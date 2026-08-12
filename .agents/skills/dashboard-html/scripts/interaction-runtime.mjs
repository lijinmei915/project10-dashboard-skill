import { assertWorkspace, cloneValue } from "./workspace-core.mjs";
import { materializeWorkspaceDocument } from "./data-runtime.mjs";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function controlState(workspace) {
  const filters = {};
  let activeView;
  for (const control of workspace.document?.controls ?? []) {
    if (control.type === "filter-bar") for (const filter of control.props.controls) filters[filter.id] = workspace.interactions?.filters?.[filter.id] ?? filter.defaultValue;
    if (control.type === "view-tabs") activeView = workspace.interactions?.activeView ?? control.props.defaultValue;
  }
  return { filters, ...(activeView ? { activeView } : {}) };
}

export function renderInteractionControls(workspace) {
  assertWorkspace(workspace);
  const state = controlState(workspace);
  return (workspace.document?.controls ?? []).map((control) => {
    if (control.type === "filter-bar") {
      const fields = control.props.controls.map((filter) => `<label class="dashboard-filter"><span>${escapeHtml(filter.label)}</span><select data-dashboard-filter="${escapeHtml(filter.id)}" data-filter-field="${escapeHtml(filter.field)}">${filter.options.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === state.filters[filter.id] ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>`).join("");
      return `<div class="dashboard-filter-bar" data-dashboard-control="${escapeHtml(control.id)}" data-surface="${escapeHtml(control.props.surface ?? "plain")}" data-targets="${escapeHtml(control.props.targets.join(" "))}">${fields}</div>`;
    }
    const tabs = control.props.items.map((item) => `<button type="button" role="tab" aria-selected="${item.id === state.activeView}" tabindex="${item.id === state.activeView ? "0" : "-1"}" data-dashboard-view="${escapeHtml(item.id)}" data-section-ids="${escapeHtml(item.sectionIds.join(" "))}">${escapeHtml(item.label)}</button>`).join("");
    return `<div class="dashboard-view-tabs" role="tablist" aria-label="视图切换" data-dashboard-control="${escapeHtml(control.id)}">${tabs}</div>`;
  }).join("");
}

export const interactionStyles = `
.dashboard-controls{display:flex;align-items:flex-end;justify-content:flex-start;gap:12px;flex-wrap:wrap;margin:0 0 var(--section-gap,18px)}
.dashboard-filter-bar{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap}.dashboard-filter-bar[data-surface="card"]{padding:12px;border:1px solid var(--card-border,#e5e7eb);border-radius:var(--card-radius,8px);background:var(--card-bg,#fff);box-shadow:var(--card-shadow,none)}
.dashboard-filter{display:grid;gap:5px;color:var(--muted,#667085);font-size:12px}.dashboard-filter select{min-width:132px;height:34px;padding:0 30px 0 10px;border:1px solid var(--card-border,#d0d5dd);border-radius:6px;background:var(--card-bg,#fff);color:var(--text,#101828);font:inherit}
.dashboard-view-tabs{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--card-border,#e5e7eb);border-radius:7px;background:var(--surface-muted,#f2f4f7)}.dashboard-view-tabs button{min-height:30px;padding:0 12px;border:0;border-radius:5px;background:transparent;color:var(--muted,#667085);font-family:inherit;font-size:13px;font-weight:600;line-height:1;cursor:pointer}.dashboard-view-tabs button[aria-selected="true"]{background:var(--card-bg,#fff);color:var(--accent,#e8590c);box-shadow:0 1px 2px rgb(16 24 40 / .08)}
@media(max-width:640px){.dashboard-controls,.dashboard-filter-bar{align-items:stretch}.dashboard-filter-bar,.dashboard-filter{width:100%}.dashboard-filter select{width:100%}.dashboard-view-tabs{display:flex;width:100%;overflow:auto}.dashboard-view-tabs button{flex:1;white-space:nowrap}}
`;

export function createInteractionController(root, workspace, { onChange = () => {} } = {}) {
  assertWorkspace(workspace);
  const next = cloneValue(workspace);
  next.interactions ||= { filters: {} };
  next.interactions.filters ||= {};
  const applyView = (viewId) => {
    const tabs = [...root.querySelectorAll("[data-dashboard-view]")];
    const active = tabs.find((tab) => tab.dataset.dashboardView === viewId) ?? tabs[0];
    if (!active) return;
    const visible = new Set(active.dataset.sectionIds.split(/\s+/).filter(Boolean));
    tabs.forEach((tab) => { const selected = tab === active; tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1; });
    root.querySelectorAll("[data-section-id]").forEach((section) => { section.hidden = !visible.has(section.dataset.sectionId); });
    next.interactions.activeView = active.dataset.dashboardView;
  };
  root.querySelectorAll("[data-dashboard-filter]").forEach((select) => select.addEventListener("change", () => {
    const definition = (next.document?.controls ?? []).filter(({ type }) => type === "filter-bar").flatMap(({ props }) => props.controls).find(({ id }) => id === select.dataset.dashboardFilter);
    next.interactions.filters[select.dataset.dashboardFilter] = definition?.options.find(({ value }) => String(value) === select.value)?.value ?? select.value;
    const document = materializeWorkspaceDocument(next);
    root.dispatchEvent(new CustomEvent("dashboard:filters-change", { bubbles: true, detail: { filters: cloneValue(next.interactions.filters), document } }));
    onChange(cloneValue(next));
  }));
  root.querySelectorAll("[data-dashboard-view]").forEach((tab) => tab.addEventListener("click", () => { applyView(tab.dataset.dashboardView); onChange(cloneValue(next)); }));
  if (next.interactions.activeView) applyView(next.interactions.activeView);
  return { getWorkspace: () => cloneValue(next), setView: applyView };
}
