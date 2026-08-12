import { createHash } from "node:crypto";
import { materializeWorkspaceDocument } from "./data-runtime.mjs";
import { interactionStyles, renderInteractionControls } from "./interaction-runtime.mjs";
import { assertProject, restoreProjectRevision } from "./project-store.mjs";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function points(values, width = 640, height = 220) {
  const numbers = values.map(Number).map((value) => Number.isFinite(value) ? value : 0);
  const max = Math.max(...numbers, 1);
  const min = Math.min(...numbers, 0);
  const range = max - min || 1;
  return numbers.map((value, index) => [
    28 + (numbers.length === 1 ? (width - 56) / 2 : index * (width - 56) / (numbers.length - 1)),
    18 + (max - value) * (height - 48) / range
  ]);
}

function chartSvg(component, workspace) {
  const resource = workspace.resources?.charts?.[component.id] ?? {};
  const type = component.props.chartType || resource.type || "bar";
  const labels = component.props.labels ?? resource.labels ?? [];
  const values = component.props.values ?? resource.series?.[0]?.values ?? [];
  if (!values.length || component.props.empty) return `<div class="empty">暂无数据</div>`;
  const coords = points(values);
  const labelNodes = type === "horizontal-bar" ? "" : labels.map((label, index) => `<text x="${coords[index]?.[0] ?? 28}" y="212" text-anchor="middle">${escapeHtml(label)}</text>`).join("");
  let shape;
  if (type === "pie") {
    const total = values.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0) || 1;
    let offset = 0;
    shape = values.map((value, index) => {
      const length = Math.max(0, Number(value) || 0) / total * 100;
      const node = `<circle cx="320" cy="105" r="68" fill="none" stroke="var(--chart-${index % 8 + 1})" stroke-width="34" pathLength="100" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${-offset}"/>`;
      offset += length;
      return node;
    }).join("");
  } else if (type === "horizontal-bar") {
    const maximum = Math.max(...values.map((value) => Math.max(0, Number(value) || 0)), 1);
    const rowHeight = Math.max(18, 164 / values.length);
    shape = values.map((value, index) => {
      const y = 18 + index * rowHeight;
      const width = Math.max(0, Number(value) || 0) / maximum * 504;
      return `<rect x="108" y="${y}" width="${width}" height="${Math.max(10, rowHeight - 7)}" rx="4" fill="var(--chart-1)"/><text x="100" y="${y + rowHeight / 2 + 4}" text-anchor="end">${escapeHtml(labels[index] ?? "")}</text>`;
    }).join("");
  } else if (type === "bar") {
    const baseline = 190;
    const width = Math.min(42, 480 / Math.max(values.length, 1));
    shape = coords.map(([x, y]) => `<rect x="${x - width / 2}" y="${y}" width="${width}" height="${baseline - y}" rx="4" fill="var(--chart-1)"/>`).join("");
  } else {
    const line = coords.map(([x, y]) => `${x},${y}`).join(" ");
    const area = type === "area" ? `<polygon points="28,190 ${line} 612,190" fill="var(--chart-1)" opacity=".14"/>` : "";
    shape = `${area}<polyline points="${line}" fill="none" stroke="var(--chart-1)" stroke-width="3" stroke-linejoin="round"/>${coords.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="var(--surface)" stroke="var(--chart-1)" stroke-width="3"/>`).join("")}`;
  }
  return `<svg class="chart" viewBox="0 0 640 220" role="img" aria-label="${escapeHtml(component.title)}"><g class="chart-shape">${shape}</g><g class="chart-labels">${labelNodes}</g></svg>`;
}

function renderComponent(component, workspace, span) {
  const subtitle = component.subtitle ? `<p class="component-subtitle">${escapeHtml(component.subtitle)}</p>` : "";
  let body = "";
  if (component.type === "kpi") body = `<strong class="kpi-value">${escapeHtml(component.props.value)}</strong>${component.props.trend ? `<span class="trend">${escapeHtml(component.props.trend)}</span>` : ""}`;
  else if (component.type === "chart") body = chartSvg(component, workspace);
  else if (component.type === "list") body = component.props.empty ? `<div class="empty">暂无数据</div>` : `<ul>${(component.props.items ?? []).map((item) => `<li><span>${escapeHtml(item.label ?? item)}</span><strong>${escapeHtml(item.value ?? "")}</strong></li>`).join("")}</ul>`;
  else if (component.type === "table") body = component.props.empty ? `<div class="empty">暂无数据</div>` : `<div class="table-wrap"><table><thead><tr>${(component.props.columns ?? []).map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${(component.props.rows ?? []).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  else body = `<div class="prose">${escapeHtml(component.props.body ?? "")}</div>`;
  return `<article class="card component-${component.type}" data-component-id="${escapeHtml(component.id)}" style="--span:${span}"><header><h3>${escapeHtml(component.title)}</h3>${subtitle}</header><div class="component-body">${body}</div></article>`;
}

function portableRuntime() {
  const root = document.querySelector("[data-dashboard-root]");
  const state = JSON.parse(document.querySelector("#dashboard-state").textContent);
  const aggregate = (rows, operation, field) => operation === "count" ? rows.length : (() => { const values = rows.map((row) => Number(row[field])).filter(Number.isFinite); const sum = values.reduce((total, value) => total + value, 0); if (operation === "average" && values.length) return sum / values.length; if (operation === "min" && values.length) return Math.min(...values); if (operation === "max" && values.length) return Math.max(...values); return sum; })();
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const recordsFor = (component) => {
    const section = state.document.sections.find(({ components }) => components.some(({ id }) => id === component.id));
    const filters = state.document.controls.filter(({ type }) => type === "filter-bar").filter(({ props }) => props.targets.includes(component.id) || props.targets.includes(section.id)).flatMap(({ props }) => props.controls);
    return (state.resources.datasets[component.dataRef]?.records || []).filter((record) => filters.every((filter) => { const value = state.interactions.filters[filter.id] ?? filter.defaultValue; return value === "" || value == null || String(record[filter.field]) === String(value); }));
  };
  const group = (rows, labelField, valueField, operation) => [...rows.reduce((map, row) => { const key = String(row[labelField] ?? ""); map.set(key, [...(map.get(key) || []), row]); return map; }, new Map())].map(([label, values]) => ({ label, value: aggregate(values, operation, valueField) }));
  const chart = (component, rows) => {
    const grouped = group(rows, component.binding.categoryField, component.binding.valueField, component.binding.operation);
    const values = grouped.map(({ value }) => Number(value) || 0); const max = Math.max(...values, 1); const min = Math.min(...values, 0); const range = max - min || 1;
    const points = values.map((value,index)=>[28+(values.length===1?292:index*584/(values.length-1)),18+(max-value)*172/range]);
    const type = component.props.chartType || "bar"; let shape = "";
    if (type === "horizontal-bar") shape = grouped.map(({label,value},index)=>{ const rowHeight=Math.max(18,164/grouped.length); const y=18+index*rowHeight; const width=Math.max(0,Number(value)||0)/max*504; return `<rect x="108" y="${y}" width="${width}" height="${Math.max(10,rowHeight-7)}" rx="4" fill="var(--chart-1)"/><text x="100" y="${y+rowHeight/2+4}" text-anchor="end">${escape(label)}</text>`; }).join("");
    else if (type === "bar") shape = points.map(([x,y])=>`<rect x="${x-18}" y="${y}" width="36" height="${190-y}" rx="4" fill="var(--chart-1)"/>`).join("");
    else shape = `<polyline points="${points.map(([x,y])=>`${x},${y}`).join(" ")}" fill="none" stroke="var(--chart-1)" stroke-width="3"/>`;
    return `<svg class="chart" viewBox="0 0 640 220" role="img" aria-label="${escape(component.title)}"><g>${shape}</g><g class="chart-labels">${type === "horizontal-bar" ? "" : grouped.map(({label},index)=>`<text x="${points[index][0]}" y="212" text-anchor="middle">${escape(label)}</text>`).join("")}</g></svg>`;
  };
  const render = () => state.document.sections.flatMap(({ components }) => components).filter(({ binding }) => binding).forEach((component) => {
    const card = root.querySelector(`[data-component-id="${CSS.escape(component.id)}"]`); if (!card) return;
    const rows = recordsFor(component); const binding = component.binding;
    if (binding.kind === "aggregate") { const value = aggregate(rows, binding.operation, binding.field); const format = binding.format || {}; card.querySelector(".kpi-value").textContent = `${format.prefix || ""}${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: format.maximumFractionDigits ?? 0 }).format(value * (format.multiplier ?? 1))}${format.suffix || ""}`; }
    if (binding.kind === "ranking") card.querySelector("ul").innerHTML = group(rows, binding.labelField, binding.valueField, binding.operation).sort((a,b)=>b.value-a.value).slice(0,binding.limit||10).map((item)=>`<li><span>${escape(item.label)}</span><strong>${escape(item.value)}</strong></li>`).join("");
    if (binding.kind === "rows") card.querySelector("tbody").innerHTML = rows.slice(0,binding.limit||100).map((row)=>`<tr>${binding.columns.map(({field})=>`<td>${escape(row[field])}</td>`).join("")}</tr>`).join("");
    if (binding.kind === "series") card.querySelector(".chart")?.replaceWith(Object.assign(document.createElement("template"), { innerHTML: chart(component, rows) }).content.firstElementChild);
  });
  root.querySelectorAll("[data-dashboard-filter]").forEach((select) => select.addEventListener("change", () => { state.interactions.filters[select.dataset.dashboardFilter] = select.value; render(); }));
  const setView = (tab) => { const visible = new Set(tab.dataset.sectionIds.split(/\s+/)); root.querySelectorAll("[data-dashboard-view]").forEach((item) => item.setAttribute("aria-selected", String(item === tab))); root.querySelectorAll("[data-section-id]").forEach((section) => { section.hidden = !visible.has(section.dataset.sectionId); }); };
  root.querySelectorAll("[data-dashboard-view]").forEach((tab) => tab.addEventListener("click", () => setView(tab)));
  const activeTab = root.querySelector('[data-dashboard-view][aria-selected="true"]'); if (activeTab) setView(activeTab);
}

const styles = `
:root{--accent:#e8590c;--page:#f5f7fa;--surface:#fff;--text:#172033;--muted:#667085;--line:#e4e7ec;--shadow:0 2px 8px rgb(15 23 42/.06);--radius:8px;--gap:16px;--chart-1:#5b8ff9;--chart-2:#45b8d8;--chart-3:#43c59e;--chart-4:#96bf45;--chart-5:#f3a83b;--chart-6:#f06b72;--chart-7:#de72b4;--chart-8:#9270e8}*{box-sizing:border-box}html{color-scheme:light}html[data-theme="dark"]{color-scheme:dark;--page:#14171d;--surface:#20242c;--text:#f4f6f8;--muted:#aab2c0;--line:#343b47;--shadow:0 6px 18px rgb(0 0 0/.28)}body{margin:0;background:var(--page);color:var(--text);font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}.dashboard{width:min(100%,1440px);margin:auto;padding:28px}.dashboard[data-page-type="report"]{width:min(calc(100% - 32px),1000px);margin:24px auto;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}.page-header{margin-bottom:24px}.page-header h1{margin:0;font-size:30px;line-height:1.2}.page-header p,.section-header p,.component-subtitle{margin:6px 0 0;color:var(--muted)}.sample-label{display:inline-block;margin-top:10px;color:var(--accent);font-size:12px}.dashboard-controls{margin-bottom:20px}.section{margin-top:24px}.section-header{margin-bottom:12px}.section-header h2{margin:0;font-size:17px}.component-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:var(--gap)}.card{grid-column:span var(--span);min-width:0;padding:18px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow)}.card h3{margin:0;font-size:14px}.component-body{margin-top:16px}.kpi-value{display:block;font-size:28px}.trend{display:block;margin-top:7px;color:var(--accent);font-size:13px}.chart{display:block;width:100%;min-height:180px}.chart text{fill:var(--muted);font-size:11px}ul{display:grid;gap:10px;margin:0;padding:0;list-style:none}li{display:flex;justify-content:space-between;gap:12px;padding-bottom:9px;border-bottom:1px solid var(--line)}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left;font-size:13px}th{color:var(--muted)}.prose{white-space:pre-wrap;line-height:1.7}.empty{padding:28px;text-align:center;color:var(--muted)}[hidden]{display:none!important}@media(max-width:760px){.dashboard{padding:18px}.card{grid-column:1/-1}.page-header h1{font-size:25px}}
${interactionStyles}`;

export function renderStandaloneWorkspace(workspace) {
  const document = materializeWorkspaceDocument(workspace);
  const layout = new Map(workspace.layout.sections.map((section) => [section.id, section]));
  const portableDatasets = Object.fromEntries(Object.entries(workspace.resources?.datasets ?? {}).filter(([, dataset]) => dataset.portable === true));
  const hasPortableData = Object.keys(portableDatasets).length > 0;
  const controlsWorkspace = hasPortableData ? workspace : { ...workspace, document: { ...workspace.document, controls: (workspace.document.controls ?? []).filter(({ type }) => type !== "filter-bar") } };
  const controls = renderInteractionControls(controlsWorkspace);
  const sections = document.sections.map((section) => {
    const sectionLayout = layout.get(section.id);
    const spans = new Map(sectionLayout?.items.map(({ id, span }) => [id, span]) ?? []);
    const cards = section.components.map((component) => renderComponent(component, workspace, spans.get(component.id) ?? 12)).join("");
    return `<section class="section" data-section-id="${escapeHtml(section.id)}"><header class="section-header"><h2>${escapeHtml(section.title)}</h2>${section.subtitle ? `<p>${escapeHtml(section.subtitle)}</p>` : ""}</header><div class="component-grid">${cards}</div></section>`;
  }).join("");
  const state = hasPortableData ? `<script type="application/json" id="dashboard-state">${safeJson({ document: workspace.document, resources: { datasets: portableDatasets }, interactions: workspace.interactions ?? { filters: {} } })}</script><script>(${portableRuntime.toString()})()</script>` : "";
  const accent = workspace.theme.accent;
  return `<!DOCTYPE html>\n<html lang="${workspace.theme.language === "en" ? "en" : "zh-CN"}" data-theme="${workspace.theme.mode}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(document.title)}</title><style>:root{--accent:${accent}}${styles}</style></head><body><main class="dashboard" data-dashboard-root data-page-type="${workspace.theme.pageType}"><header class="page-header"><h1>${escapeHtml(document.title)}</h1>${document.subtitle ? `<p>${escapeHtml(document.subtitle)}</p>` : ""}${document.sampleDataLabel ? `<span class="sample-label">${escapeHtml(document.sampleDataLabel)}</span>` : ""}</header>${controls ? `<div class="dashboard-controls">${controls}</div>` : ""}${sections}</main>${state}</body></html>`;
}

export function exportProjectRevision(project, revisionId = project?.currentRevisionId) {
  assertProject(project);
  const workspace = restoreProjectRevision(project, revisionId);
  const html = renderStandaloneWorkspace(workspace);
  return {
    version: 1,
    projectId: project.id,
    revisionId,
    mediaType: "text/html; charset=utf-8",
    filename: `${project.id}-${revisionId}.html`,
    sha256: createHash("sha256").update(html).digest("hex"),
    html
  };
}
