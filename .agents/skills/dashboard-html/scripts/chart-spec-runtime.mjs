import { buildControlledCustomChartOption, DEFAULT_CUSTOM_CHART_EXTENSION_REGISTRY } from "./custom-chart-extension-runtime.mjs";

export const CHART_SPEC_VERSION = 1;

function assertPureJson(value, path = "$") {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return;
  if (["function", "symbol", "bigint", "undefined"].includes(typeof value)) throw new Error(`ChartSpec must contain JSON values only: ${path}`);
  if (Array.isArray(value)) return value.forEach((item, index) => assertPureJson(item, `${path}[${index}]`));
  if (typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`ChartSpec contains an unsupported object: ${path}`);
  for (const [key, item] of Object.entries(value)) assertPureJson(item, `${path}.${key}`);
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.round(number))) : fallback;
}

function assertKnownKeys(value, allowed, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`ChartSpec field must be an object: ${path}`);
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`ChartSpec contains an unknown field: ${path}.${unknown}`);
}

function assertIdentifierList(values, { path, minimum = 0, maximum }) {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) throw new Error(`ChartSpec identifier count is invalid: ${path}`);
  if (new Set(values).size !== values.length || values.some((value) => !/^[a-z][a-z0-9-]*$/.test(value))) throw new Error(`ChartSpec identifier is invalid: ${path}`);
}

export function normalizeChartSpec(input, { chartTypes, defaultPalette }) {
  assertPureJson(input);
  const versioned = input?.version === CHART_SPEC_VERSION;
  if (versioned) {
    assertKnownKeys(input, ["version", "chartType", "data", "dataBinding", "appearance", "interactions", "refreshPolicy"], "$");
    for (const field of ["chartType", "data", "appearance", "interactions", "refreshPolicy"]) if (input[field] === undefined) throw new Error(`ChartSpec is missing a required field: $.${field}`);
    assertKnownKeys(input.data, ["labels", "series", "thresholds", "gauge", "bullet", "combo", "table"], "$.data");
    assertKnownKeys(input.appearance, ["mode", "width", "height", "palette"], "$.appearance");
    assertKnownKeys(input.interactions, ["legend", "tooltip", "zoom", "selection", "drilldown"], "$.interactions");
    assertKnownKeys(input.refreshPolicy, ["mode", "intervalMs", "pauseWhenHidden"], "$.refreshPolicy");
  }
  const source = versioned && input.chartType
    ? input
    : {
        version: CHART_SPEC_VERSION,
        chartType: input?.type,
        data: { labels: input?.labels, series: input?.series, thresholds: input?.thresholds, gauge: input?.gauge, bullet: input?.bullet, combo: input?.combo, table: input?.table },
        appearance: { mode: input?.mode, width: input?.width, height: input?.height, palette: input?.palette },
        interactions: input?.interactions,
        refreshPolicy: input?.refreshPolicy
      };
  const allowedTypes = new Set(chartTypes || []);
  if (!allowedTypes.has(source.chartType)) throw new Error("Unsupported chart type");
  const labels = Array.isArray(source.data?.labels) ? source.data.labels.slice(0, 100).map((value) => String(value).slice(0, 120)) : [];
  const series = Array.isArray(source.data?.series) ? source.data.series.slice(0, 12).map((item, index) => ({
    name: String(item?.name || `Series ${index + 1}`).slice(0, 80),
    values: Array.isArray(item?.values) ? item.values.slice(0, 100).map((value) => Number.isFinite(Number(value)) ? Number(value) : 0) : []
  })) : [];
  if (!series.length || !series.some(({ values }) => values.length)) throw new Error("Chart series is required");
  if (source.chartType === "bullet") {
    if (!labels.length) throw new Error("Bullet chart requires at least one category");
    if (series.length !== 2) throw new Error("Bullet chart requires exactly two series: actual and target");
    if (series.some(({ values }) => values.length !== labels.length)) throw new Error("Bullet chart actual and target values must align with categories");
  }
  if (source.chartType === "combo-bar-line") {
    if (!labels.length) throw new Error("Combo chart requires at least one category");
    if (series.length !== 2) throw new Error("Combo chart requires exactly two series: bar and line");
    if (series.some(({ values }) => values.length !== labels.length)) throw new Error("Combo chart bar and line values must align with categories");
  }
  if (source.data?.combo !== undefined) assertKnownKeys(source.data.combo, ["dualAxis", "barUnit", "lineUnit"], "$.data.combo");
  const gaugeMin = Number.isFinite(Number(source.data?.gauge?.min)) ? Number(source.data.gauge.min) : 0;
  const requestedGaugeMax = Number(source.data?.gauge?.max);
  const gaugeMax = Number.isFinite(requestedGaugeMax) && requestedGaugeMax > gaugeMin ? requestedGaugeMax : gaugeMin + 100;
  const gaugeThresholds = Array.isArray(source.data?.gauge?.thresholds) ? source.data.gauge.thresholds
    .slice(0, 6).map(Number).filter((value) => Number.isFinite(value) && value > gaugeMin && value < gaugeMax).sort((left, right) => left - right) : [];
  const bulletMin = Number.isFinite(Number(source.data?.bullet?.min)) ? Number(source.data.bullet.min) : 0;
  const requestedBulletMax = Number(source.data?.bullet?.max);
  const bulletMax = Number.isFinite(requestedBulletMax) && requestedBulletMax > bulletMin ? requestedBulletMax : Math.max(bulletMin + 100, ...series.flatMap(({ values }) => values));
  const bulletRanges = Array.isArray(source.data?.bullet?.ranges) ? source.data.bullet.ranges.slice(0, 3).map(Number)
    .filter((value) => Number.isFinite(value) && value > bulletMin && value < bulletMax).sort((left, right) => left - right) : [];
  const palette = Array.isArray(source.appearance?.palette)
    ? source.appearance.palette.slice(0, 12).filter((color) => /^#[0-9a-f]{6}$/i.test(color))
    : [];
  const fallbackPalette = Array.isArray(defaultPalette) ? defaultPalette.filter((color) => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 12) : [];
  if (!palette.length && !fallbackPalette.length) throw new Error("Chart palette is required");
  const interactions = source.interactions || {};
  const refreshPolicy = source.refreshPolicy || {};
  if (source.dataBinding) {
    assertKnownKeys(source.dataBinding, ["datasetId", "dimensions", "metrics"], "$.dataBinding");
    if (!String(source.dataBinding.datasetId || "").trim()) throw new Error("ChartSpec dataBinding requires datasetId");
    assertIdentifierList(source.dataBinding.dimensions, { path: "$.dataBinding.dimensions", maximum: 3 });
    assertIdentifierList(source.dataBinding.metrics, { path: "$.dataBinding.metrics", minimum: 1, maximum: 12 });
  }
  if (interactions.drilldown) {
    assertKnownKeys(interactions.drilldown, ["hierarchy", "targetScope"], "$.interactions.drilldown");
    assertIdentifierList(interactions.drilldown.hierarchy, { path: "$.interactions.drilldown.hierarchy", minimum: 2, maximum: 8 });
  }
  if (interactions.selection) assertKnownKeys(interactions.selection, ["enabled", "targetScope"], "$.interactions.selection");
  return {
    version: CHART_SPEC_VERSION,
    chartType: source.chartType,
    data: {
      labels,
      series,
      thresholds: Array.isArray(source.data?.thresholds) ? source.data.thresholds.slice(0, 6).map(Number).filter(Number.isFinite) : [],
      gauge: {
        min: gaugeMin,
        max: gaugeMax,
        unit: String(source.data?.gauge?.unit || "").slice(0, 12),
        precision: clampInteger(source.data?.gauge?.precision, 0, 4, 0),
        thresholds: gaugeThresholds
      },
      bullet: {
        min: bulletMin,
        max: bulletMax,
        unit: String(source.data?.bullet?.unit || "").slice(0, 12),
        precision: clampInteger(source.data?.bullet?.precision, 0, 4, 0),
        ranges: bulletRanges
      },
      combo: {
        dualAxis: source.data?.combo?.dualAxis !== false,
        barUnit: String(source.data?.combo?.barUnit || "").slice(0, 12),
        lineUnit: String(source.data?.combo?.lineUnit || "").slice(0, 12)
      },
      table: {
        sort: ["asc", "desc"].includes(source.data?.table?.sort) ? source.data.table.sort : "none",
        sortBy: clampInteger(source.data?.table?.sortBy, 0, 11, 0),
        limit: clampInteger(source.data?.table?.limit, 1, 20, 8),
        summary: source.data?.table?.summary === true,
        formats: Array.isArray(source.data?.table?.formats) ? source.data.table.formats.slice(0, 12).map((format) => ({
          prefix: String(format?.prefix || "").slice(0, 12),
          suffix: String(format?.suffix || "").slice(0, 12),
          decimals: clampInteger(format?.decimals, 0, 4, 0)
        })) : [],
        conditional: source.data?.table?.conditional === true
      }
    },
    ...(source.dataBinding ? { dataBinding: {
      datasetId: String(source.dataBinding.datasetId || "").slice(0, 120),
      dimensions: Array.isArray(source.dataBinding.dimensions) ? source.dataBinding.dimensions.slice(0, 3).map(String) : [],
      metrics: Array.isArray(source.dataBinding.metrics) ? source.dataBinding.metrics.slice(0, 12).map(String) : []
    } } : {}),
    appearance: {
      mode: source.appearance?.mode === "dark" ? "dark" : "light",
      width: clampInteger(source.appearance?.width, 240, 1600, 720),
      height: clampInteger(source.appearance?.height, 180, 1000, 360),
      palette: palette.length ? palette : fallbackPalette
    },
    interactions: {
      legend: { visible: interactions.legend?.visible !== false, interactive: interactions.legend?.interactive !== false },
      tooltip: { enabled: interactions.tooltip?.enabled !== false },
      zoom: ["x", "y", "xy"].includes(interactions.zoom) ? interactions.zoom : "none",
      ...(interactions.selection ? { selection: {
        enabled: interactions.selection.enabled === true,
        targetScope: ["component", "page"].includes(interactions.selection.targetScope) ? interactions.selection.targetScope : "section"
      } } : {}),
      ...(interactions.drilldown ? { drilldown: {
        hierarchy: Array.isArray(interactions.drilldown.hierarchy) ? interactions.drilldown.hierarchy.slice(0, 8).map(String) : [],
        targetScope: ["section", "page"].includes(interactions.drilldown.targetScope) ? interactions.drilldown.targetScope : "component"
      } } : {})
    },
    refreshPolicy: {
      mode: ["poll", "dataset-event"].includes(refreshPolicy.mode) ? refreshPolicy.mode : "manual",
      ...(refreshPolicy.mode === "poll" ? { intervalMs: clampInteger(refreshPolicy.intervalMs, 5000, 86400000, 30000) } : {}),
      pauseWhenHidden: refreshPolicy.pauseWhenHidden !== false
    }
  };
}

export function chartSpecRenderConfig(spec) {
  return {
    type: spec.chartType,
    ...spec.data,
    ...spec.appearance,
    interactions: spec.interactions,
    refreshPolicy: spec.refreshPolicy,
    ...(spec.dataBinding ? { dataBinding: spec.dataBinding } : {})
  };
}

export function createEchartsOption(spec, { interactive = false, animation = interactive, customRegistry = DEFAULT_CUSTOM_CHART_EXTENSION_REGISTRY } = {}) {
  const { type, labels: inputLabels, series: inputSeries, palette: colors, mode, width, thresholds = [], gauge = {}, bullet = {}, combo = {}, interactions } = chartSpecRenderConfig(spec);
  if (type === "data-table") throw new Error("Data tables use the DOM table renderer");
  let labels = inputLabels;
  let series = inputSeries;
  const textStyle = { color: mode === "dark" ? "#aeb8c6" : "#71717a", fontFamily: "sans-serif", fontSize: 12 };
  const axisColor = mode === "dark" ? "#46505f" : "#d4d4d8";
  const gridColor = mode === "dark" ? "#303947" : "#e4e4e7";
  const tooltip = {
    show: interactive && interactions.tooltip.enabled,
    trigger: "item",
    confine: true,
    axisPointer: { type: "line", snap: true, lineStyle: { color: axisColor, width: 1, type: "dashed" } }
  };
  const horizontalTypes = new Set(["horizontal-bar", "grouped-horizontal-bar", "stacked-horizontal-bar", "percent-stacked-horizontal-bar", "diverging-bar", "ranking-bar", "gantt"]);
  const horizontal = horizontalTypes.has(type);
  const stacked = ["stacked-bar", "percent-stacked-bar", "stacked-horizontal-bar", "percent-stacked-horizontal-bar"].includes(type);
  const normalized = type === "percent-stacked-bar" || type === "percent-stacked-horizontal-bar";
  const custom = buildControlledCustomChartOption(type, { labels, series, colors, mode, width, bullet, textStyle, axisColor, gridColor, interactive, animation }, { registry: customRegistry });
  if (custom?.option) return custom.option;
  if (custom?.degraded) {
    return createEchartsOption({ ...spec, chartType: custom.extension.fallbackType }, { interactive, animation, customRegistry });
  }
  if (type === "gauge") {
    const value = Number(series[0]?.values[0]) || 0;
    return {
      animation, color: colors, textStyle, tooltip,
      series: [{
        type: "gauge", min: gauge.min, max: gauge.max, startAngle: 210, endAngle: -30,
        center: ["50%", width < 420 ? "56%" : "58%"], radius: width < 420 ? "80%" : "88%",
        progress: { show: true, width: width < 420 ? 12 : 15, roundCap: true, itemStyle: { color: colors[0] } },
        axisLine: { roundCap: true, lineStyle: { width: width < 420 ? 12 : 15, color: [[1, gridColor]] } },
        axisTick: { show: false },
        splitLine: { distance: -20, length: 5, lineStyle: { color: axisColor, width: 1 } },
        axisLabel: { distance: 24, color: textStyle.color, fontSize: 10, formatter: (label) => label === gauge.min || label === gauge.max ? label : "" },
        pointer: { show: true, length: "58%", width: 4, itemStyle: { color: mode === "dark" ? "#e5e7eb" : "#3f3f46" } },
        anchor: { show: true, size: 8, itemStyle: { color: mode === "dark" ? "#e5e7eb" : "#3f3f46" } },
        title: { show: true, offsetCenter: [0, "62%"], color: textStyle.color, fontSize: 12 },
        detail: { valueAnimation: false, offsetCenter: [0, "28%"], color: mode === "dark" ? "#f4f6f8" : "#27272a", fontSize: width < 420 ? 24 : 30, fontWeight: 700, formatter: (current) => `${Number(current).toFixed(gauge.precision)}${gauge.unit}` },
        data: [{ value, name: series[0]?.name || labels[0] || "当前值" }]
      }]
    };
  }
  if (type === "histogram") {
    const samples = series[0].values.filter(Number.isFinite);
    const minimum = Math.min(...samples, 0);
    const maximum = Math.max(...samples, 1);
    const binCount = Math.max(4, Math.min(12, Math.ceil(Math.sqrt(samples.length))));
    const binWidth = (maximum - minimum || 1) / binCount;
    const bins = Array.from({ length: binCount }, (_, index) => ({ start: minimum + index * binWidth, end: minimum + (index + 1) * binWidth, count: 0 }));
    samples.forEach((value) => bins[Math.min(binCount - 1, Math.max(0, Math.floor((value - minimum) / binWidth)))].count += 1);
    labels = bins.map(({ start, end }) => `${start.toFixed(1)}-${end.toFixed(1)}`);
    series = [{ name: series[0].name, values: bins.map(({ count }) => count) }];
  }
  if (type === "ranking-bar") {
    const order = labels.map((label, index) => ({ label, value: Number(series[0]?.values[index]) || 0 })).sort((left, right) => left.value - right.value);
    labels = order.map(({ label }) => label);
    series = [{ ...series[0], values: order.map(({ value }) => value) }];
  }
  if (type === "diverging-bar") series = series.slice(0, 2).map((item, index) => ({ ...item, values: item.values.map((value) => index === 0 ? -Math.abs(value) : Math.abs(value)) }));
  if (["pie", "sector-pie", "rose"].includes(type)) {
    const compact = width < 420;
    return {
      animation, color: colors, textStyle, tooltip,
      legend: compact ? { show: interactions.legend.visible, bottom: 0, left: "center", width: "92%", itemWidth: 8, itemHeight: 8, textStyle, selectedMode: interactive && interactions.legend.interactive } : { show: false },
      series: [{
        type: "pie",
        radius: type === "sector-pie" ? (compact ? "56%" : "72%") : type === "rose" ? (compact ? ["18%", "56%"] : ["20%", "72%"]) : compact ? ["34%", "56%"] : ["48%", "72%"],
        roseType: type === "rose" ? "radius" : undefined,
        center: compact ? ["50%", "42%"] : ["50%", "50%"],
        label: compact ? { show: false } : { color: textStyle.color, formatter: "{b}  {d}%" },
        labelLine: { show: !compact },
        data: series[0].values.map((value, index) => ({ name: labels[index] || `Item ${index + 1}`, value }))
      }]
    };
  }
  if (type === "radar") {
    const maximum = Math.max(1, ...series.flatMap(({ values }) => values.map((value) => Number(value) || 0)));
    return {
      animation, color: colors, textStyle, tooltip,
      legend: { show: interactions.legend.visible && series.length > 1, top: 0, textStyle, selectedMode: interactive && interactions.legend.interactive },
      radar: { center: ["50%", series.length > 1 ? "57%" : "52%"], radius: width < 420 ? "55%" : "66%", splitNumber: 4, indicator: labels.map((name) => ({ name, max: maximum })), axisName: textStyle, splitLine: { lineStyle: { color: gridColor } }, splitArea: { show: false }, axisLine: { lineStyle: { color: axisColor } } },
      series: [{ type: "radar", symbolSize: 5, areaStyle: { opacity: 0.12 }, data: series.map(({ name, values }) => ({ name, value: labels.map((_, index) => Number(values[index]) || 0) })) }]
    };
  }
  if (type === "funnel") {
    return {
      animation, color: colors, textStyle, tooltip, legend: { show: false },
      series: [{ type: "funnel", left: width < 420 ? "8%" : "16%", width: width < 420 ? "84%" : "68%", top: 12, bottom: 12, minSize: "20%", maxSize: "100%", sort: "descending", gap: 2, label: { color: textStyle.color, formatter: "{b}  {c}" }, itemStyle: { borderColor: mode === "dark" ? "#20242c" : "#fff", borderWidth: 1 }, data: series[0].values.map((value, index) => ({ name: labels[index] || `Stage ${index + 1}`, value })) }]
    };
  }
  if (type === "combo-bar-line") {
    const dualAxis = combo.dualAxis !== false;
    const axisLabel = (unit) => unit ? { ...textStyle, formatter: (value) => `${value}${unit}` } : textStyle;
    return {
      animation, color: colors, textStyle,
      tooltip: interactive && interactions.tooltip.enabled ? { ...tooltip, trigger: "axis" } : tooltip,
      legend: { show: interactions.legend.visible, top: 0, textStyle, selectedMode: interactive && interactions.legend.interactive },
      grid: { left: width < 420 ? 44 : 52, right: width < 420 ? (dualAxis ? 44 : 14) : (dualAxis ? 56 : 22), top: 42, bottom: 34 },
      xAxis: { type: "category", data: labels, axisLine: { lineStyle: { color: axisColor } }, axisTick: { show: false }, axisLabel: { ...textStyle, hideOverlap: true } },
      yAxis: dualAxis ? [
        { type: "value", name: combo.barUnit || undefined, nameTextStyle: textStyle, splitLine: { lineStyle: { color: gridColor } }, axisLabel: axisLabel(combo.barUnit) },
        { type: "value", name: combo.lineUnit || undefined, nameTextStyle: textStyle, splitLine: { show: false }, axisLabel: axisLabel(combo.lineUnit) }
      ] : { type: "value", name: combo.barUnit || combo.lineUnit || undefined, nameTextStyle: textStyle, splitLine: { lineStyle: { color: gridColor } }, axisLabel: axisLabel(combo.barUnit || combo.lineUnit) },
      series: [
        { name: series[0].name, type: "bar", data: series[0].values, yAxisIndex: 0, barMaxWidth: 32, itemStyle: { color: colors[0], borderRadius: [4, 4, 0, 0] } },
        { name: series[1].name, type: "line", data: series[1].values, yAxisIndex: dualAxis ? 1 : 0, symbol: "circle", symbolSize: 7, smooth: true, lineStyle: { width: 2.5, color: colors[1] }, itemStyle: { color: colors[1] } }
      ]
    };
  }
  const horizontalStacked = type === "stacked-horizontal-bar" || type === "percent-stacked-horizontal-bar";
  const horizontalBarItemStyle = (seriesIndex, name) => {
    if (type === "gantt" && name === series[0]?.name) return { color: "transparent" };
    if (type === "diverging-bar") return { borderRadius: seriesIndex === 0 ? [4, 0, 0, 4] : [0, 4, 4, 0] };
    if (horizontalStacked) {
      if (series.length === 1) return { borderRadius: 4 };
      if (seriesIndex === 0) return { borderRadius: [4, 0, 0, 4] };
      if (seriesIndex === series.length - 1) return { borderRadius: [0, 4, 4, 0] };
      return { borderRadius: 0 };
    }
    if (type === "gantt") return { borderRadius: [4, 4, 4, 4] };
    return { borderRadius: [0, 4, 4, 0] };
  };
  return {
    animation,
    color: colors,
    textStyle,
    tooltip: interactive && interactions.tooltip.enabled ? { ...tooltip, trigger: "axis" } : tooltip,
    legend: { show: interactions.legend.visible && series.length > 1, top: 0, textStyle, selectedMode: interactive && interactions.legend.interactive },
    grid: horizontal ? { left: width < 420 ? 78 : 110, right: width < 420 ? 14 : 24, top: series.length > 1 ? 42 : 18, bottom: 20 } : { left: width < 420 ? 42 : 48, right: width < 420 ? 12 : 20, top: series.length > 1 ? 42 : 20, bottom: 34 },
    xAxis: horizontal ? { type: "value", max: normalized ? 100 : undefined, splitLine: { lineStyle: { color: gridColor } }, axisLabel: normalized ? { ...textStyle, formatter: "{value}%" } : type === "diverging-bar" ? { ...textStyle, formatter: (value) => Math.abs(value) } : textStyle } : type === "time-series" ? { type: "time", axisLine: { lineStyle: { color: axisColor } }, axisLabel: { ...textStyle, hideOverlap: true } } : { type: "category", data: labels, axisLine: { lineStyle: { color: axisColor } }, axisTick: { show: false }, axisLabel: { ...textStyle, hideOverlap: true } },
    yAxis: horizontal ? { type: "category", data: labels, axisLine: { lineStyle: { color: axisColor } }, axisTick: { show: false }, axisLabel: { ...textStyle, width: width < 420 ? 62 : 92, overflow: "truncate" } } : { type: "value", max: normalized ? 100 : undefined, splitLine: { lineStyle: { color: gridColor } }, axisLabel: normalized ? { ...textStyle, formatter: "{value}%" } : textStyle },
    dataZoom: interactive && interactions.zoom !== "none" ? [{ type: "inside", ...(interactions.zoom === "y" ? { yAxisIndex: 0 } : { xAxisIndex: 0 }) }] : undefined,
    series: series.map(({ name, values }, seriesIndex) => ({
      name,
      type: type === "bar" || type === "grouped-bar" || stacked || type === "histogram" || horizontal ? "bar" : "line",
      stack: stacked || type === "diverging-bar" || type === "gantt" ? "total" : undefined,
      data: type === "time-series" ? values.map((value, index) => [labels[index], value]) : normalized ? values.map((value, index) => {
        const total = series.reduce((sum, item) => sum + (Number(item.values[index]) || 0), 0);
        return total ? Number(value) / total * 100 : 0;
      }) : values,
      smooth: type === "area",
      symbol: "circle",
      symbolSize: 6,
      lineStyle: { width: 2 },
      areaStyle: type === "area" ? { opacity: 0.18 } : undefined,
      barGap: type === "histogram" ? "0%" : undefined,
      barCategoryGap: type === "histogram" ? "0%" : undefined,
      barMaxWidth: horizontal ? 24 : type === "histogram" ? 56 : 32,
      itemStyle: type === "ranking-bar" ? { borderRadius: [0, 4, 4, 0] } : type === "bar" || type === "grouped-bar" || type === "histogram" ? { borderRadius: type === "histogram" ? 0 : [4, 4, 0, 0] } : horizontal ? horizontalBarItemStyle(seriesIndex, name) : undefined,
      label: type === "ranking-bar" ? { show: true, position: "insideLeft", formatter: ({ dataIndex }) => `${labels.length - dataIndex}` } : undefined,
      markLine: type === "time-series" && thresholds.length ? { silent: true, symbol: "none", lineStyle: { type: "dashed" }, data: thresholds.map((yAxis) => ({ yAxis })) } : undefined
    }))
  };
}
