export const CUSTOM_CHART_EXTENSION_MANIFEST_VERSION = 1;

const KNOWN_CAPABILITIES = new Set(["custom-series", "cartesian", "tooltip", "selection"]);
const KNOWN_RUNTIME_KEYS = new Set(["dashboard", "analysis-report", "report"]);
const STANDARD_FALLBACK_TYPES = new Set([
  "line", "time-series", "area", "bar", "grouped-bar", "stacked-bar", "percent-stacked-bar", "histogram",
  "horizontal-bar", "grouped-horizontal-bar", "stacked-horizontal-bar", "percent-stacked-horizontal-bar",
  "diverging-bar", "ranking-bar", "gantt", "sector-pie", "pie", "rose", "gauge", "radar", "funnel"
]);
const IDENTIFIER = /^[a-z][a-z0-9-]*$/;

function assertPureJson(value, path = "$") {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) return value.forEach((item, index) => assertPureJson(item, `${path}[${index}]`));
  if (typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`Custom chart manifest must contain JSON values only: ${path}`);
  for (const [key, item] of Object.entries(value)) assertPureJson(item, `${path}.${key}`);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

export function validateCustomChartExtensionManifest(manifest) {
  assertPureJson(manifest);
  const allowed = ["manifestVersion", "id", "name", "semantic", "dataShape", "capabilities", "runtimes", "fallbackType"];
  const unknown = Object.keys(manifest || {}).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`Unknown custom chart manifest field: ${unknown}`);
  if (manifest?.manifestVersion !== CUSTOM_CHART_EXTENSION_MANIFEST_VERSION) throw new Error("Unsupported custom chart manifest version");
  if (!IDENTIFIER.test(manifest.id || "")) throw new Error("Invalid custom chart extension id");
  for (const field of ["name", "semantic", "dataShape"]) if (!String(manifest[field] || "").trim()) throw new Error(`Custom chart manifest requires ${field}`);
  if (!Array.isArray(manifest.capabilities) || !manifest.capabilities.length || manifest.capabilities.some((value) => !KNOWN_CAPABILITIES.has(value))) throw new Error("Unknown custom chart capability");
  if (new Set(manifest.capabilities).size !== manifest.capabilities.length) throw new Error("Duplicate custom chart capability");
  const unknownRuntime = Object.keys(manifest.runtimes || {}).find((key) => !KNOWN_RUNTIME_KEYS.has(key));
  if (unknownRuntime) throw new Error(`Unknown custom chart runtime field: ${unknownRuntime}`);
  if (!manifest.runtimes || manifest.runtimes.dashboard !== "client-echarts" || manifest.runtimes["analysis-report"] !== "server-svg" || manifest.runtimes.report !== "server-svg") throw new Error("Custom chart runtimes are invalid");
  if (!STANDARD_FALLBACK_TYPES.has(manifest.fallbackType)) throw new Error("Custom chart fallback type must be a registered standard chart");
  return deepFreeze(structuredClone(manifest));
}

export function createCustomChartExtensionRegistry(entries) {
  const registry = new Map();
  for (const entry of entries || []) {
    const manifest = validateCustomChartExtensionManifest(entry?.manifest);
    if (registry.has(manifest.id)) throw new Error(`Duplicate custom chart extension id: ${manifest.id}`);
    if (typeof entry?.buildOption !== "function") throw new Error(`Custom chart extension requires a local builder: ${manifest.id}`);
    registry.set(manifest.id, Object.freeze({ manifest, buildOption: entry.buildOption }));
  }
  return Object.freeze({
    ids: () => Object.freeze([...registry.keys()]),
    manifests: () => Object.freeze([...registry.values()].map(({ manifest }) => manifest)),
    get: (id) => registry.get(id) || null
  });
}

function buildBulletOption(context) {
  const { labels, series, colors, mode, width, bullet, textStyle, gridColor, interactive, animation } = context;
  const actual = series[0]?.values || [];
  const target = series[1]?.values || [];
  const min = bullet.min;
  const observedMax = Math.max(...actual, ...target, ...bullet.ranges, min + 1);
  const max = bullet.max > min ? bullet.max : observedMax;
  const rangeStops = [...bullet.ranges.filter((value) => value > min && value < max), max].sort((left, right) => left - right).slice(0, 4);
  const rangeColors = mode === "dark" ? ["#303947", "#3d4756", "#4b5667", "#596679"] : ["#f1f2f4", "#e4e6e9", "#d7dade", "#c9cdd2"];
  const rows = labels.map((_, index) => [index, Number(actual[index]) || 0, Number(target[index]) || 0, min, max, ...rangeStops]);
  const precision = bullet.precision;
  const unit = bullet.unit;
  return {
    animation,
    color: colors,
    textStyle,
    tooltip: {
      show: interactive,
      trigger: "item",
      confine: true,
      formatter: ({ dataIndex }) => `${labels[dataIndex] || "指标"}<br/>${series[0]?.name || "实际"}：${Number(actual[dataIndex] || 0).toFixed(precision)}${unit}<br/>${series[1]?.name || "目标"}：${Number(target[dataIndex] || 0).toFixed(precision)}${unit}`
    },
    grid: { left: width < 420 ? 74 : 108, right: width < 420 ? 24 : 48, top: 14, bottom: 30 },
    xAxis: { type: "value", min, max, splitLine: { lineStyle: { color: gridColor } }, axisLabel: { ...textStyle, formatter: `{value}${unit}` } },
    yAxis: { type: "category", data: labels, axisTick: { show: false }, axisLine: { show: false }, axisLabel: textStyle },
    series: [{
      type: "custom",
      name: series[0]?.name || "实际",
      coordinateSystem: "cartesian2d",
      encode: { x: [1, 2], y: 0 },
      data: rows,
      renderItem(params, api) {
        const categoryIndex = api.value(0);
        const start = api.coord([api.value(3), categoryIndex]);
        const end = api.coord([api.value(4), categoryIndex]);
        const band = Math.max(18, Math.min(38, Math.abs(api.size([0, 1])[1]) * 0.56));
        const children = [];
        let previous = api.value(3);
        for (let index = 5; index < rows[params.dataIndex].length; index += 1) {
          const stop = api.value(index);
          const left = api.coord([previous, categoryIndex])[0];
          const right = api.coord([stop, categoryIndex])[0];
          children.push({ type: "rect", shape: { x: left, y: start[1] - band / 2, width: Math.max(0, right - left), height: band }, style: { fill: rangeColors[index - 5] || rangeColors[rangeColors.length - 1] } });
          previous = stop;
        }
        const actualX = api.coord([Math.max(min, Math.min(max, api.value(1))), categoryIndex])[0];
        children.push({ type: "rect", shape: { x: start[0], y: start[1] - band * 0.18, width: Math.max(2, actualX - start[0]), height: band * 0.36, r: 2 }, style: { fill: colors[0] } });
        const targetX = api.coord([Math.max(min, Math.min(max, api.value(2))), categoryIndex])[0];
        children.push({ type: "line", shape: { x1: targetX, y1: start[1] - band * 0.34, x2: targetX, y2: start[1] + band * 0.34 }, style: { stroke: mode === "dark" ? "#f4f6f8" : "#27272a", lineWidth: 2 } });
        return { type: "group", clipPath: { type: "rect", shape: { x: start[0], y: start[1] - band / 2, width: end[0] - start[0], height: band } }, children };
      }
    }]
  };
}

export const BULLET_CHART_EXTENSION_MANIFEST = validateCustomChartExtensionManifest({
  manifestVersion: CUSTOM_CHART_EXTENSION_MANIFEST_VERSION,
  id: "bullet",
  name: "子弹图",
  semantic: "actual-versus-target-with-performance-ranges",
  dataShape: "categories+actual-series+target-series+optional-ranges",
  capabilities: ["custom-series", "cartesian", "tooltip", "selection"],
  runtimes: { dashboard: "client-echarts", "analysis-report": "server-svg", report: "server-svg" },
  fallbackType: "horizontal-bar"
});

export const DEFAULT_CUSTOM_CHART_EXTENSION_REGISTRY = createCustomChartExtensionRegistry([
  { manifest: BULLET_CHART_EXTENSION_MANIFEST, buildOption: buildBulletOption }
]);

export function buildControlledCustomChartOption(type, context, { registry = DEFAULT_CUSTOM_CHART_EXTENSION_REGISTRY } = {}) {
  const extension = registry.get(type);
  if (!extension) return null;
  try {
    return { option: extension.buildOption(context), extension: extension.manifest, degraded: false };
  } catch (error) {
    return { option: null, extension: extension.manifest, degraded: true, error };
  }
}
