import { createEchartsOption, normalizeChartSpec } from "./chart-spec-client.mjs";

export const CLIENT_ECHARTS_TYPES = Object.freeze([
  "line", "combo-bar-line", "time-series", "area", "bar", "grouped-bar", "stacked-bar", "percent-stacked-bar", "histogram",
  "horizontal-bar", "grouped-horizontal-bar", "stacked-horizontal-bar", "percent-stacked-horizontal-bar",
  "diverging-bar", "ranking-bar", "gantt", "sector-pie", "pie", "rose", "bullet", "gauge", "radar", "funnel"
]);

function preserveDataZoom(option, instance, previousSpec, nextSpec) {
  if (!option.dataZoom?.length || previousSpec?.interactions?.zoom !== nextSpec.interactions.zoom) return option;
  const current = instance.getOption?.().dataZoom;
  if (!Array.isArray(current) || !current.length) return option;
  const fields = ["start", "end", "startValue", "endValue"];
  option.dataZoom = option.dataZoom.map((item, index) => ({
    ...item,
    ...Object.fromEntries(fields.filter((field) => current[index]?.[field] !== undefined).map((field) => [field, current[index][field]]))
  }));
  return option;
}

export function createClientEchartsRuntime({
  loadEcharts = () => import("/vendor/echarts.mjs"),
  createResizeObserver = typeof ResizeObserver === "function" ? (callback) => new ResizeObserver(callback) : null
} = {}) {
  const records = new Map();
  const renderTokens = new WeakMap();
  let echartsPromise = null;

  function dispose(container) {
    renderTokens.set(container, (renderTokens.get(container) || 0) + 1);
    const record = records.get(container);
    if (!record) return false;
    record.observer?.disconnect();
    record.instance.off?.("click", record.clickHandler);
    record.instance.dispose();
    records.delete(container);
    return true;
  }

  async function render(container, input, { onIntent = null } = {}) {
    const token = (renderTokens.get(container) || 0) + 1;
    renderTokens.set(container, token);
    const spec = normalizeChartSpec(input, { chartTypes: CLIENT_ECHARTS_TYPES, defaultPalette: input?.appearance?.palette || input?.palette });
    echartsPromise ||= Promise.resolve().then(loadEcharts);
    const echarts = await echartsPromise;
    if (!container.isConnected || renderTokens.get(container) !== token) return { status: "stale", spec };

    let record = records.get(container);
    const created = !record;
    if (!record) {
      const instance = echarts.init(container, null, { renderer: "canvas" });
      const observer = createResizeObserver?.(() => {
        if (container.isConnected && records.get(container)?.instance === instance) instance.resize();
      }) || null;
      observer?.observe(container);
      const clickHandler = (event) => records.get(container)?.onIntent?.({
        type: "chart.select",
        value: event?.name ?? null,
        dataIndex: Number.isInteger(event?.dataIndex) ? event.dataIndex : null,
        seriesName: event?.seriesName ? String(event.seriesName) : null
      });
      instance.on?.("click", clickHandler);
      record = { instance, observer, clickHandler, onIntent, spec: null };
      records.set(container, record);
    }
    record.onIntent = onIntent;
    const option = preserveDataZoom(createEchartsOption(spec, { interactive: true, animation: true }), record.instance, record.spec, spec);
    record.instance.setOption(option, { notMerge: true, lazyUpdate: false });
    record.spec = spec;
    return { status: created ? "client-created" : "client-updated", spec };
  }

  function disposeMissing(activeContainers) {
    const active = new Set(activeContainers);
    let disposed = 0;
    for (const container of records.keys()) {
      if (!active.has(container) || !container.isConnected) disposed += Number(dispose(container));
    }
    return disposed;
  }

  function disposeAll() {
    for (const container of [...records.keys()]) dispose(container);
  }

  return Object.freeze({ render, dispose, disposeMissing, disposeAll, size: () => records.size });
}
