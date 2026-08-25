import { RESOURCE_CHANNEL, chartApplicationMessage, iconApplicationMessage, readResourceContext } from "/studio/resource-application-protocol.mjs";
import { createClientEchartsRuntime } from "/studio/client-echarts-runtime.mjs";

const families = Object.freeze({
  all: { label: "全部", match: () => true },
  line: { label: "线图", match: ({ type }) => ["line", "time-series", "area", "combo-bar-line"].includes(type) },
  column: { label: "柱图", match: ({ type }) => ["bar", "grouped-bar", "stacked-bar", "percent-stacked-bar", "histogram"].includes(type) },
  bar: { label: "条图", match: ({ type }) => ["horizontal-bar", "grouped-horizontal-bar", "stacked-horizontal-bar", "percent-stacked-horizontal-bar", "diverging-bar", "ranking-bar", "gantt", "bullet"].includes(type) },
  pie: { label: "饼图", match: ({ type }) => ["sector-pie", "pie", "rose"].includes(type) },
  indicator: { label: "指标图", match: ({ type }) => type === "gauge" },
  relation: { label: "关系图", match: ({ type }) => type === "radar" },
  conversion: { label: "转化图", match: ({ type }) => type === "funnel" },
  table: { label: "表格", match: ({ type }) => type === "data-table" }
});

const samples = Object.freeze({
  "combo-bar-line": { labels: ["1月", "2月", "3月", "4月", "5月", "6月"], series: [{ name: "收入", values: [128, 156, 142, 188, 214, 246] }, { name: "转化率", values: [18, 21, 20, 25, 27, 30] }], combo: { dualAxis: true, barUnit: "万元", lineUnit: "%" } },
  histogram: { labels: [], series: [{ name: "订单金额", values: [12,18,21,22,24,25,27,29,31,35,36,42,48,53] }] },
  "time-series": { labels: ["2026-01-01","2026-02-01","2026-03-01","2026-04-01","2026-05-01"], series: [{ name: "响应时间", values: [18,22,27,24,34] }], thresholds: [20,30] },
  gantt: { labels: ["调研","设计","开发","验收"], series: [{ name: "开始", values: [0,2,5,9] }, { name: "工期", values: [3,4,5,3] }] },
  "diverging-bar": { labels: ["18-24","25-34","35-44","45+"], series: [{ name: "左侧", values: [24,32,28,18] }, { name: "右侧", values: [27,35,25,21] }] },
  bullet: { labels: ["收入","毛利","续费率","交付率"], series: [{ name: "实际", values: [82,68,91,74] }, { name: "目标", values: [90,75,88,85] }], bullet: { min: 0, max: 120, unit: "%", precision: 0, ranges: [60,85,100] } },
  gauge: { labels: ["完成率"], series: [{ name: "目标完成率", values: [76.8] }], gauge: { min: 0, max: 100, unit: "%", precision: 1, thresholds: [60,85] } },
  radar: { labels: ["增长","转化","留存","活跃","口碑"], series: [{ name: "本期", values: [82,68,76,88,72] }, { name: "目标", values: [75,80,78,82,85] }] },
  funnel: { labels: ["访问","注册","试用","付费","续费"], series: [{ name: "用户数", values: [1200,820,540,260,180] }] },
  "data-table": { labels: ["华东","华南","华北","西部"], series: [{ name: "收入", values: [128,96,84,71] }, { name: "订单", values: [342,286,251,198] }], table: { sort: "desc", sortBy: 0, limit: 4, summary: true, formats: [{ suffix: " 万" }, { suffix: " 单" }], conditional: false } },
  default: { labels: ["华东","华南","华北","西部"], series: [{ name: "本期", values: [42,36,31,24] }, { name: "上期", values: [34,29,27,21] }, { name: "目标", values: [18,22,16,20] }] }
});

const semanticCopy = Object.freeze({
  "ordered-category-trend": "展示有顺序的数据变化趋势",
  "bar-and-line-dual-metric-comparison": "用柱状图和折线图同时比较两个相关指标",
  "timestamp-indexed-trend": "按真实时间轴查看变化和阈值",
  "single-series-category-comparison": "比较不同分类的一组数值",
  "multi-series-side-by-side-comparison": "并排比较同一分类下的多个系列",
  "multi-series-total-and-composition": "同时查看分类总量和内部构成",
  "normalized-composition-comparison": "比较不同分类内部的百分比构成",
  "continuous-value-frequency-distribution": "查看连续数值落在各区间的频数",
  "single-series-horizontal-category-comparison": "适合长标签的横向分类对比",
  "multi-series-horizontal-side-by-side-comparison": "横向并排比较多个系列",
  "horizontal-total-and-composition": "横向查看总量和组成",
  "horizontal-normalized-composition-comparison": "横向比较内部百分比构成",
  "opposing-values-around-zero-baseline": "围绕中轴比较两个方向或群体",
  "descending-ranked-category-comparison": "按数值降序展示名次",
  "task-duration-on-time-axis": "展示任务开始时间和持续时长",
  "part-to-whole-solid-sectors": "用实心扇区展示整体构成",
  "part-to-whole-donut": "用圆环展示整体构成",
  "part-to-whole-radius-comparison": "用扇区半径强化规模差异"
  ,"actual-versus-target-with-performance-ranges": "比较实际值、目标线和绩效区间"
  ,"multi-dimensional-profile-comparison": "比较对象在多个统一维度上的能力轮廓"
  ,"ordered-stage-conversion": "展示有序阶段中的规模递减与转化流失"
  ,"single-value-progress-with-thresholds": "展示单个指标相对目标区间的位置"
  ,"exact-value-multi-field-lookup": "以行列形式查询精确值并对照多个字段"
});

const dataShapeCopy = Object.freeze({
  "ordered-categories+one-or-more-series": "有序分类 + 一个或多个系列",
  "categories+bar-series+line-series+optional-dual-axis": "分类 + 柱状系列 + 折线系列 + 可选双 Y 轴",
  "timestamps+one-or-more-series+optional-thresholds": "时间戳 + 数值系列 + 可选阈值",
  "categories+single-series": "分类 + 单系列",
  "categories+multiple-series": "分类 + 至少两个系列",
  "single-series-raw-samples": "一组连续数值样本",
  "categories+two-series": "分类 + 两个方向系列",
  "tasks+start-series+duration-series": "任务 + 开始时间 + 工期",
  "categories+single-nonnegative-series": "分类 + 一组非负数值"
  ,"dimensions+one-or-more-series": "统一维度 + 一个或多个对象系列"
  ,"ordered-stages+single-nonnegative-series": "有序阶段 + 单系列非负数值"
  ,"single-value+range+optional-thresholds": "单个数值 + 最小/最大范围 + 可选阈值"
  ,"categories+actual-series+target-series+optional-ranges": "分类 + 实际系列 + 目标系列 + 可选绩效区间"
  ,"rows+one-or-more-value-columns": "行标签 + 一个或多个数值列"
});

const grid = document.querySelector("#chartGrid");
const search = document.querySelector("#resourceSearch");
const filters = document.querySelector("#familyFilters");
const meta = document.querySelector("#resourceMeta");
const empty = document.querySelector("#chartEmpty");
const applyContext = document.querySelector("#applyContext");
const context = readResourceContext(window.location.href);
const channel = (context.canApplyChart || context.canApplyIcon) && "BroadcastChannel" in window ? new BroadcastChannel(RESOURCE_CHANNEL) : null;
let catalog = [];
let chartPalette = null;
let family = "all";
let iconWeight = "regular";
let iconSearchTimer = null;
const previewRuntime = createClientEchartsRuntime();
const standardColors = Object.freeze({ "#ff7a2f": "#ff7a2f", categorical: "linear-gradient(90deg,#5b8ff9,#45b8d8,#43c59e,#96bf45,#f3a83b,#f06b72,#de72b4,#9270e8)", success: "#16a34a", warning: "#d97706", danger: "#dc2626" });

const componentPreview = Object.freeze({
  summary: '<div class="preview-summary"><strong>本周经营表现稳定</strong><p>核心指标持续改善，关注渠道转化效率。</p></div>',
  kpi: '<span>本月收入</span><strong>¥ 128.6 万</strong><small>较上期 +12.4%</small>',
  chart: '<div class="preview-bars"><i style="height:42%"></i><i style="height:68%"></i><i style="height:55%"></i><i style="height:84%"></i></div>',
  table: '<div class="preview-table"><span></span><span></span><span></span><span></span></div>',
  list: '<div class="preview-list"><span></span><span></span><span></span></div>',
  text: '<p class="preview-text">用于解释数据口径、业务背景和决策建议的连续文本。</p>',
  "filter-bar": '<div class="preview-control"></div><div class="preview-control" style="width:70%"></div>',
  "view-tabs": '<div class="preview-tabs"><span>概览</span><span>趋势</span><span>明细</span></div>'
});

function setCapability(id, label, state = "ready") {
  const node = document.querySelector(`[data-capability="${id}"]`);
  if (!node) return;
  node.textContent = label;
  node.dataset.state = state;
}

function renderComponents(items) {
  const grid = document.querySelector("#componentGrid");
  grid.replaceChildren(...items.map((item) => {
    const card = document.createElement("article"); card.className = "component-card";
    const props = item.requiredProps?.length ? item.requiredProps.join("、") : "无固定展示字段";
    card.innerHTML = `<header class="chart-head"><strong>${item.name}</strong><span class="chart-id">${item.type}</span></header><div class="component-preview">${componentPreview[item.type] || componentPreview.text}</div><div class="component-detail"><p>数据：${item.dataOptional ? "可选" : "必需"}${item.bindings?.length ? ` · ${item.bindings.join(" / ")}` : ""}</p><p>字段：${props}</p><p>降级：<code>${item.fallback}</code></p></div>`;
    return card;
  }));
  document.querySelector("#componentMeta").textContent = `共 ${items.length} 类资源，包括内容组件和页面控件`;
}

async function loadComponents() {
  const response = await fetch("/api/components/catalog");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "读取组件目录失败");
  renderComponents([...(payload.components || []), ...(payload.controls || [])]);
  setCapability("components", `组件目录 v${payload.version || 1} · ${(payload.components?.length || 0) + (payload.controls?.length || 0)} 类`);
}

function standardSample(groupId, item) {
  const sample = String(item.sample);
  if (groupId === "color") return `<span class="standard-sample" data-kind="color" style="background:${standardColors[sample] || sample}">${sample === "categorical" ? "8 色" : "Aa"}</span>`;
  if (groupId === "type") return `<span class="standard-sample" style="font-size:${sample}">Aa</span>`;
  if (groupId === "space") return `<span class="standard-sample" data-kind="space" style="--sample-size:${sample}"></span>`;
  if (groupId === "shape") return `<span class="standard-sample" data-kind="shape" style="--sample-radius:${sample.includes("–") ? "10px" : sample}">${sample}</span>`;
  return `<span class="standard-sample">${sample}</span>`;
}

function renderStandards(standards) {
  const root = document.querySelector("#standardGroups");
  const nav = document.querySelector("#guideNav");
  const groups = standards.groups || [];
  root.replaceChildren(...groups.map((group) => {
    const section = document.createElement("section"); section.className = "standard-section"; section.id = `standard-${group.id}`;
    section.innerHTML = `<h2>${group.name}</h2><p class="standard-summary">${group.summary}</p><div class="standard-list">${group.items.map((item) => `<div class="standard-item">${standardSample(group.id, item)}<div class="standard-copy"><strong>${item.name}</strong><code>${item.token}</code><p>${item.rule}</p></div></div>`).join("")}</div>`;
    return section;
  }));
  nav.prepend(...groups.map((group) => { const link = document.createElement("a"); link.href = `#standard-${group.id}`; link.textContent = group.name; return link; }));
}

async function loadStandards() {
  const response = await fetch("/api/design/standards");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "读取设计规范失败");
  renderStandards(payload);
  setCapability("standards", `设计规范 v${payload.version} · ${payload.groups?.length || 0} 类`);
}

async function renderIcons(query = "") {
  const grid = document.querySelector("#iconGrid");
  const metaNode = document.querySelector("#iconMeta");
  metaNode.textContent = "正在读取图标...";
  try {
    const response = await fetch(`/api/icons/search?q=${encodeURIComponent(query)}&limit=48`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "读取图标失败");
    const icons = await Promise.all((payload.icons || []).map(async (icon) => {
      if (iconWeight === "regular") return icon;
      const asset = await fetch(`/api/icons/phosphor/${encodeURIComponent(icon.name)}?weight=${iconWeight}`).then((result) => result.ok ? result.json() : null);
      return { ...icon, svg: asset?.svg || icon.svg };
    }));
    grid.replaceChildren(...icons.map((icon) => {
      const card = document.createElement("article"); card.className = "icon-card"; card.title = icon.aliases?.length ? `${icon.name} · ${icon.aliases.join("、")}` : icon.name;
      card.innerHTML = `${icon.svg}<span>${icon.name}</span>${context.canApplyIcon ? `<button class="icon-apply" type="button" aria-label="应用 ${icon.name}"></button>` : ""}`;
      card.querySelector("button")?.addEventListener("click", () => {
        channel?.postMessage(iconApplicationMessage({ iconName: icon.name, targetId: context.targetId, targetType: context.targetType, session: context.session }));
        grid.querySelectorAll("[data-applied]").forEach((node) => delete node.dataset.applied);
        card.dataset.applied = "true";
        document.querySelector("#iconApplyContext").innerHTML = `<strong>已应用 ${icon.name}</strong><span>返回 Studio 查看结果，可继续选择其他图标。</span>`;
      });
      return card;
    }));
    metaNode.textContent = `当前显示 ${icons.length} 个图标 · ${iconWeight}`;
    setCapability("icons", `Phosphor 图标库 · 可用`);
  } catch (error) {
    grid.replaceChildren(); metaNode.textContent = error.message || "读取图标失败"; setCapability("icons", "图标库 · 不可用", "error");
  }
}

function sampleFor(type) {
  const source = samples[type] || samples.default;
  const singleSeries = ["line","area","bar","horizontal-bar","ranking-bar","sector-pie","pie","rose","gauge","funnel"].includes(type);
  return { ...source, series: singleSeries ? [source.series[0]] : source.series };
}

function hueFromHex(color) {
  const [red, green, blue] = color.match(/[0-9a-f]{2}/gi).map((value) => parseInt(value, 16) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (!delta) return 0;
  const segment = max === red
    ? ((green - blue) / delta) % 6
    : max === green
      ? (blue - red) / delta + 2
      : (red - green) / delta + 4;
  return (segment * 60 + 360) % 360;
}

function automaticPaletteMode(type, seriesCount) {
  if (type === "gauge") return "monochrome";
  if (["sector-pie", "pie", "rose", "radar", "funnel"].includes(type)) return "categorical";
  if (seriesCount <= 1) return "monochrome";
  if (seriesCount === 2) return "bichrome";
  return "categorical";
}

function previewPalette(type, seriesCount) {
  const categorical = chartPalette.categorical;
  const mode = automaticPaletteMode(type, seriesCount);
  if (mode === "categorical") return categorical;
  const accentHue = hueFromHex("#ff8000");
  const ranked = [...categorical].sort((first, second) => {
    const distance = (color) => {
      const delta = Math.abs(hueFromHex(color) - accentHue);
      return Math.min(delta, 360 - delta);
    };
    return distance(first) - distance(second);
  });
  return mode === "bichrome" ? ranked.slice(0, 2) : ranked.slice(0, 1);
}

function formatTableValue(value, format = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  const decimals = Math.max(0, Math.min(4, Number(format.decimals) || 0));
  return `${format.prefix || ""}${number.toLocaleString("zh-CN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${format.suffix || ""}`;
}

function renderTablePreview(preview, sample) {
  const config = sample.table || {};
  const formats = Array.isArray(config.formats) ? config.formats : [];
  const rows = sample.labels.map((label, rowIndex) => ({
    label,
    values: sample.series.map(({ values }) => values[rowIndex])
  }));
  if (["asc", "desc"].includes(config.sort)) {
    const direction = config.sort === "asc" ? 1 : -1;
    rows.sort((left, right) => direction * ((Number(left.values[config.sortBy]) || 0) - (Number(right.values[config.sortBy]) || 0)));
  }
  const visibleRows = rows.slice(0, Math.max(1, Math.min(20, Number(config.limit) || 8)));
  const maxima = sample.series.map((_, columnIndex) => Math.max(...visibleRows.map(({ values }) => Number(values[columnIndex]) || 0)));
  const table = document.createElement("table");
  table.className = "resource-data-table";
  const header = table.createTHead().insertRow();
  ["分类", ...sample.series.map(({ name }) => name)].forEach((label) => {
    const cell = document.createElement("th"); cell.scope = "col"; cell.textContent = label; header.append(cell);
  });
  const body = table.createTBody();
  visibleRows.forEach((row) => {
    const tableRow = body.insertRow();
    const label = document.createElement("th"); label.scope = "row"; label.textContent = row.label; tableRow.append(label);
    row.values.forEach((value, columnIndex) => {
      const cell = tableRow.insertCell(); cell.textContent = formatTableValue(value, formats[columnIndex]);
      if (config.conditional && Number(value) === maxima[columnIndex]) cell.dataset.emphasis = "true";
    });
  });
  if (config.summary) {
    const footer = table.createTFoot().insertRow();
    const label = document.createElement("th"); label.scope = "row"; label.textContent = "合计"; footer.append(label);
    sample.series.forEach((_, columnIndex) => {
      const cell = footer.insertCell();
      cell.textContent = formatTableValue(visibleRows.reduce((sum, row) => sum + (Number(row.values[columnIndex]) || 0), 0), formats[columnIndex]);
    });
  }
  const scroll = document.createElement("div"); scroll.className = "resource-table-scroll"; scroll.append(table);
  preview.replaceChildren(scroll);
}

async function renderPreview(card, chart) {
  const preview = card.querySelector(".chart-preview");
  const sample = sampleFor(chart.type);
  if (chart.type === "data-table") {
    renderTablePreview(preview, sample);
    return;
  }
  try {
    const palette = previewPalette(chart.type, sample.series.length);
    preview.replaceChildren();
    const spec = {
      version: 1,
      chartType: chart.type,
      data: { labels: sample.labels, series: sample.series, thresholds: sample.thresholds || [], gauge: sample.gauge || {}, bullet: sample.bullet || {}, combo: sample.combo || {}, table: sample.table || {} },
      appearance: { mode: "light", width: 460, height: 220, palette },
      interactions: { legend: { visible: true, interactive: true }, tooltip: { enabled: true }, zoom: "none" },
      refreshPolicy: { mode: "manual", pauseWhenHidden: true }
    };
    await previewRuntime.render(preview, spec);
  } catch (error) {
    preview.innerHTML = `<div class="chart-status" data-tone="danger">${String(error.message || "预览生成失败")}</div>`;
  }
}

function render() {
  const query = search.value.trim().toLowerCase();
  const visible = catalog.filter((chart) => families[family].match(chart) && `${chart.type} ${chart.name} ${chart.semantic || ""} ${(chart.aliases || []).join(" ")}`.toLowerCase().includes(query));
  const cards = visible.map((chart) => {
    const card = document.createElement("article"); card.className = "chart-card";
    card.innerHTML = `<header class="chart-head"><strong>${chart.name}</strong><span class="chart-id">${chart.type}</span></header><div class="chart-preview"><div class="chart-status">正在生成预览...</div></div><div class="chart-detail"><p>${semanticCopy[chart.semantic] || "受控图表能力"}</p><p><span>数据：</span>${dataShapeCopy[chart.dataShape] || "分类与数值系列"}</p></div>${context.canApplyChart ? '<button class="chart-apply" type="button">应用</button>' : ""}`;
    card.querySelector(".chart-apply")?.addEventListener("click", (event) => {
      channel?.postMessage(chartApplicationMessage({ chartType: chart.type, targetId: context.targetId, session: context.session }));
      document.querySelectorAll(".chart-apply[data-state]").forEach((button) => { delete button.dataset.state; button.textContent = "应用"; });
      event.currentTarget.dataset.state = "applied";
      event.currentTarget.textContent = "已应用";
      applyContext.innerHTML = `<strong>已应用 ${chart.name}</strong><span>返回 Studio 查看结果，可继续选择其他图表。</span>`;
    });
    return { card, chart };
  });
  grid.replaceChildren(...cards.map(({ card }) => card));
  cards.forEach(({ card, chart }) => renderPreview(card, chart));
  previewRuntime.disposeMissing([...grid.querySelectorAll(".chart-preview")]);
  meta.textContent = `共 ${catalog.length} 种图表，当前显示 ${visible.length} 种`;
  empty.hidden = visible.length > 0;
}

if (context.canApplyChart) applyContext.innerHTML = "<strong>应用到当前图表卡片</strong><span>选择一种图表，原看板会立即更新并保存。</span>";
if (context.canApplyIcon) {
  const targetLabel = context.targetType === "section" ? "当前分组标题" : "当前卡片标题";
  document.querySelector("#iconApplyContext").innerHTML = `<strong>应用到${targetLabel}</strong><span>选择图标后，原看板会立即更新并保存。</span>`;
}

Object.entries(families).forEach(([id, item]) => {
  const button = document.createElement("button"); button.type = "button"; button.textContent = item.label; button.setAttribute("aria-pressed", String(id === family));
  button.addEventListener("click", () => { family = id; [...filters.children].forEach((node) => node.setAttribute("aria-pressed", String(node === button))); render(); });
  filters.append(button);
});

document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll('main > section[id$="Panel"]').forEach((panel) => { panel.hidden = panel.id !== `${button.dataset.tab}Panel`; });
  document.querySelectorAll("[data-tab]").forEach((item) => item.setAttribute("aria-selected", String(item === button)));
}));
search.addEventListener("input", render);
document.querySelector("#iconSearch").addEventListener("input", (event) => {
  clearTimeout(iconSearchTimer);
  iconSearchTimer = setTimeout(() => renderIcons(event.target.value.trim()), 220);
});
document.querySelector("#iconWeights").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-weight]");
  if (!button) return;
  iconWeight = button.dataset.weight;
  document.querySelectorAll("#iconWeights button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  renderIcons(document.querySelector("#iconSearch").value.trim());
});

try {
  const response = await fetch("/api/charts/catalog");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "读取图表目录失败");
  catalog = payload.charts || [];
  if (!payload.palette?.version || !Array.isArray(payload.palette.categorical) || payload.palette.categorical.length < 3) throw new Error("图表色板不可用");
  chartPalette = payload.palette;
  setCapability("charts", `图表目录 · ${catalog.length} 种 · 色板 v${chartPalette.version}`);
  render();
  const loaders = [["components", "组件目录", loadComponents], ["icons", "图标库", () => renderIcons("")], ["standards", "设计规范", loadStandards]];
  await Promise.all(loaders.map(async ([id, label, loader]) => {
    try { await loader(); }
    catch { setCapability(id, `${label} · 不可用`, "error"); }
  }));
} catch (error) {
  meta.textContent = error.message || "读取图表目录失败";
  meta.style.color = "#b42318";
}
