const POINT_OPTIONS = new Set([7, 12, 30]);
const STYLE_OPTIONS = new Set(["line", "smooth", "area"]);

export function normalizeKpiSparkline(input, { points = 7, style = "area" } = {}) {
  const labels = Array.isArray(input?.labels) ? input.labels.map(String) : [];
  const values = Array.isArray(input?.values) ? input.values.map(Number) : [];
  if (labels.length !== values.length || labels.length < 2 || values.some((value) => !Number.isFinite(value))) return null;
  const limit = POINT_OPTIONS.has(Number(points)) ? Number(points) : 7;
  const offset = Math.max(0, labels.length - limit);
  return Object.freeze({
    labels: Object.freeze(labels.slice(offset)),
    values: Object.freeze(values.slice(offset)),
    unit: typeof input?.unit === "string" ? input.unit.slice(0, 20) : "",
    style: STYLE_OPTIONS.has(style) ? style : "area"
  });
}

function colorWithAlpha(color, alpha) {
  const hex = String(color).trim().match(/^#([\da-f]{6})$/i);
  if (hex) {
    const value = Number.parseInt(hex[1], 16);
    return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }
  const rgb = String(color).trim().match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/i);
  return rgb ? `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})` : color;
}

function safeSvgId(value) {
  return String(value || "trend").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "trend";
}

export function createKpiSparklineOption(input, { color = "#5b8ff9", mode = "light", points = 7, style = "area", title = "指标趋势" } = {}) {
  const sparkline = normalizeKpiSparkline(input, { points, style });
  if (!sparkline) return null;
  const area = sparkline.style === "area";
  return {
    animation: true,
    animationDuration: 320,
    grid: { top: 8, right: 4, bottom: 5, left: 4, containLabel: false },
    tooltip: {
      show: true,
      trigger: "axis",
      confine: true,
      appendToBody: false,
      backgroundColor: mode === "dark" ? "rgba(24,27,34,.96)" : "rgba(255,255,255,.98)",
      borderColor: mode === "dark" ? "rgba(255,255,255,.16)" : "rgba(15,23,42,.12)",
      textStyle: { color: mode === "dark" ? "#f4f6f8" : "#172033", fontSize: 12 },
      axisPointer: { type: "line", lineStyle: { color, width: 1, opacity: 0.45 } },
      valueFormatter: (value) => `${Number(value).toLocaleString("zh-CN")}${sparkline.unit}`
    },
    xAxis: { type: "category", data: sparkline.labels, boundaryGap: false, show: false },
    yAxis: { type: "value", show: false, scale: true },
    series: [{
      name: title,
      type: "line",
      data: sparkline.values,
      smooth: sparkline.style === "line" ? false : 0.32,
      showSymbol: false,
      symbol: "circle",
      symbolSize: 6,
      lineStyle: { color, width: 1.5 },
      itemStyle: { color, borderColor: mode === "dark" ? "#20242c" : "#fff", borderWidth: 2 },
      emphasis: { scale: true, focus: "series" },
      ...(area ? { areaStyle: {
        opacity: 1,
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: colorWithAlpha(color, mode === "dark" ? 0.3 : 0.24) },
            { offset: 0.72, color: colorWithAlpha(color, mode === "dark" ? 0.08 : 0.06) },
            { offset: 1, color: colorWithAlpha(color, 0) }
          ]
        }
      } } : {})
    }]
  };
}

export function createStaticKpiSparklineSvg(input, { points = 7, style = "area", id = "trend" } = {}) {
  const sparkline = normalizeKpiSparkline(input, { points, style });
  if (!sparkline) return "";
  const min = Math.min(...sparkline.values);
  const max = Math.max(...sparkline.values);
  const range = max - min || 1;
  const coordinates = sparkline.values.map((value, index) => [
    4 + index * 172 / (sparkline.values.length - 1),
    5 + (max - value) * 48 / range
  ]);
  const linePoints = coordinates.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`);
  const [first, ...rest] = coordinates;
  const smoothSegments = rest.map(([x, y], index) => {
    const [previousX, previousY] = coordinates[index];
    const midpointX = (previousX + x) / 2;
    return `Q ${midpointX.toFixed(2)} ${previousY.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  const smoothPath = `M ${first[0].toFixed(2)} ${first[1].toFixed(2)} ${smoothSegments.join(" ")}`;
  let stroke;
  if (sparkline.style === "line") stroke = `<polyline points="${linePoints.join(" ")}" fill="none"/>`;
  else stroke = `<path d="${smoothPath}" fill="none"/>`;
  const gradientId = `kpi-sparkline-fill-${safeSvgId(id)}`;
  const area = sparkline.style === "area"
    ? `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".24"/><stop offset=".72" stop-color="currentColor" stop-opacity=".06"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="${smoothPath} L 176 57 L 4 57 Z" fill="url(#${gradientId})"/>`
    : "";
  return `<svg class="kpi-sparkline-static" viewBox="0 0 180 60" aria-hidden="true"><g class="kpi-sparkline-area">${area}</g><g class="kpi-sparkline-line">${stroke}</g></svg>`;
}

export function createKpiSparklineRuntime({
  loadEcharts = () => import("/vendor/echarts.mjs"),
  createResizeObserver = typeof ResizeObserver === "function" ? (callback) => new ResizeObserver(callback) : null
} = {}) {
  const records = new Map();
  const tokens = new WeakMap();
  let echartsPromise = null;

  function dispose(container) {
    tokens.set(container, (tokens.get(container) || 0) + 1);
    const record = records.get(container);
    if (!record) return false;
    record.observer?.disconnect();
    record.instance.off?.("click", record.clickHandler);
    record.instance.dispose();
    records.delete(container);
    return true;
  }

  async function render(container, input, options = {}) {
    const option = createKpiSparklineOption(input, options);
    if (!option) { dispose(container); return { status: "empty" }; }
    const token = (tokens.get(container) || 0) + 1;
    tokens.set(container, token);
    echartsPromise ||= Promise.resolve().then(loadEcharts);
    const echarts = await echartsPromise;
    if (!container.isConnected || tokens.get(container) !== token) return { status: "stale" };
    let record = records.get(container);
    const created = !record;
    if (!record) {
      const instance = echarts.init(container, null, { renderer: "canvas" });
      const observer = createResizeObserver?.(() => container.isConnected && instance.resize()) || null;
      observer?.observe(container);
      const clickHandler = (event) => records.get(container)?.onIntent?.({
        type: "kpi.trend.select",
        value: event?.name ?? null,
        dataIndex: Number.isInteger(event?.dataIndex) ? event.dataIndex : null
      });
      instance.on?.("click", clickHandler);
      record = { instance, observer, clickHandler, onIntent: null };
      records.set(container, record);
    }
    record.onIntent = options.onIntent || null;
    record.instance.setOption(option, { notMerge: true, lazyUpdate: false });
    return { status: created ? "client-created" : "client-updated" };
  }

  function disposeMissing(activeContainers) {
    const active = new Set(activeContainers);
    let disposed = 0;
    for (const container of records.keys()) if (!active.has(container) || !container.isConnected) disposed += Number(dispose(container));
    return disposed;
  }

  function disposeAll() {
    for (const container of [...records.keys()]) dispose(container);
  }

  return Object.freeze({ render, dispose, disposeMissing, disposeAll, size: () => records.size });
}
