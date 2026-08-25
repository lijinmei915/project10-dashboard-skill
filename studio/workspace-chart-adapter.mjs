import { createClientEchartsRuntime } from "./client-echarts-runtime.mjs";
import { normalizeRefreshPolicy } from "./live-data-refresh-runtime.mjs";

export function normalizeChartSeries(component) {
  if (Array.isArray(component.props?.series) && component.props.series.length) {
    return component.props.series.map((item, index) => ({
      name: String(item.name || `系列 ${index + 1}`),
      values: Array.isArray(item.values) ? item.values.map(Number) : []
    }));
  }
  return [{
    name: component.title || "数据",
    values: Array.isArray(component.props?.values) ? component.props.values.map(Number) : []
  }];
}

export function chartAriaLabel(title, type) {
  const labels = { line: "折线图", "combo-bar-line": "柱线复合图", "time-series": "时序图", area: "面积图", "sector-pie": "饼图", pie: "环图", rose: "玫瑰图", bullet: "子弹图", gauge: "仪表盘", radar: "雷达图", funnel: "漏斗图", "data-table": "表格", bar: "基础柱图", "grouped-bar": "分组柱图", "stacked-bar": "堆叠柱图", "percent-stacked-bar": "百分比堆叠柱图", histogram: "直方图", "horizontal-bar": "基础条图", "grouped-horizontal-bar": "分组条图", "stacked-horizontal-bar": "堆叠条图", "percent-stacked-horizontal-bar": "百分比堆叠条图", "diverging-bar": "双向条图", "ranking-bar": "排名图", gantt: "甘特图" };
  return `${title || "图表"} · ${labels[type] || labels.bar}`;
}

export function visibleChartSeries(component, visibility = {}) {
  const series = normalizeChartSeries(component);
  const visible = series.filter(({ name }) => visibility[name] !== false);
  return visible.length ? visible : series;
}

export function automaticChartPaletteMode(component, type) {
  if (["gauge", "bullet"].includes(type)) return "monochrome";
  if (["sector-pie", "pie", "rose", "radar", "funnel"].includes(type)) return "categorical";
  const seriesCount = normalizeChartSeries(component).length;
  if (seriesCount <= 1) return "monochrome";
  if (seriesCount === 2) return "bichrome";
  return "categorical";
}

export async function requestChartSvg(payload, fetcher = fetch) {
  const response = await fetcher("/api/charts/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !/^<svg\b/i.test(result.svg || "")) throw new Error("图表服务不可用");
  return result.svg;
}

export function createWorkspaceChartAdapter({ document: documentRef, dashboard, request = requestChartSvg, cache = new Map(), resolveType, resolvePalette, getMode, getPageType = () => dashboard.dataset.pageType || "dashboard", clientRuntime = createClientEchartsRuntime(), createFallbackSvg, getSeriesVisibility = () => ({}), onSeriesVisibilityChange, onSelectionIntent, onDrilldownIntent, escape = CSS.escape }) {
  const activeClientContainers = new Set();

  function removeRenderedChart(card, existing) {
    if (existing) clientRuntime.dispose(existing);
    existing?.remove();
    delete card.dataset.chartRendered;
    delete card.dataset.chartRuntime;
  }

  async function renderStatic({ card, container, cacheKey, spec, fallback }) {
    let status = "remote";
    try {
      let svg = cache.get(cacheKey);
      if (!svg) {
        svg = await request(spec);
        cache.set(cacheKey, svg);
      } else {
        status = "cache";
      }
      if (!container.isConnected || container.dataset.renderKey !== cacheKey) return { status: "stale" };
      container.innerHTML = svg;
    } catch {
      if (!container.isConnected || container.dataset.renderKey !== cacheKey) return { status: "stale" };
      container.replaceChildren(createFallbackSvg(fallback));
      status = "fallback";
    }
    card.dataset.chartRuntime = "svg";
    return { status };
  }

  const adapter = {
    async render(component) {
      const card = dashboard.querySelector(`[data-item-id="${escape(component.id)}"]`);
      if (!card) return { status: "missing" };
      const type = resolveType(card, component);
      card.dataset.chartType = type;
      const existing = card.querySelector(":scope > .chart-render");
      const labels = Array.isArray(component.props?.labels) ? component.props.labels.map(String) : [];
      const allSeries = normalizeChartSeries(component);
      const visibility = getSeriesVisibility(component.id) || {};
      const series = visibleChartSeries(component, visibility);
      if (!series.some(({ values }) => values.some(Number.isFinite))) {
        removeRenderedChart(card, existing);
        return { status: "empty", type };
      }
      const colors = resolvePalette(card, component, type);
      let legend = card.querySelector(":scope > .dashboard-chart-legend");
      if (!["gauge", "bullet"].includes(type) && allSeries.length > 1 && component.props?.legend?.visible !== false) {
        if (!legend) { legend = documentRef.createElement("div"); legend.className = "dashboard-chart-legend"; legend.setAttribute("aria-label", "图例"); }
        legend.replaceChildren(...allSeries.map((item, index) => {
          const button = documentRef.createElement("button"); button.type = "button"; button.className = "dashboard-chart-legend-item";
          const visible = visibility[item.name] !== false; button.setAttribute("aria-pressed", String(visible)); button.style.setProperty("--legend-color", colors[index % colors.length]);
          const dot = documentRef.createElement("span"); dot.className = "dashboard-chart-legend-dot"; dot.setAttribute("aria-hidden", "true");
          const label = documentRef.createElement("span"); label.textContent = item.name; button.append(dot, label);
          button.addEventListener("click", () => onSeriesVisibilityChange?.({ componentId: component.id, seriesName: item.name, visible: !visible })); return button;
        }));
        const body = card.querySelector(".chart-render, .bar-chart"); body ? body.before(legend) : card.append(legend);
      } else legend?.remove();
      const width = Math.max(280, Math.min(1200, Math.round(card.getBoundingClientRect().width - 40) || 720));
      const spec = {
        version: 1,
        chartType: type,
        data: { labels, series, thresholds: component.props?.thresholds || [], gauge: component.props?.gauge || {}, bullet: component.props?.bullet || {}, combo: component.props?.combo || {}, table: component.props?.table || {} },
        appearance: { mode: getMode(), width, height: 260, palette: colors },
        interactions: {
          legend: { visible: false, interactive: false },
          tooltip: { enabled: true },
          zoom: component.props?.zoom || "none",
          ...(component.props?.selection ? { selection: component.props.selection } : {}),
          ...(component.props?.drilldown ? { drilldown: { hierarchy: component.props.drilldown.levels.map(({ field }) => field), targetScope: component.props.drilldown.targetScope } } : {})
        },
        refreshPolicy: normalizeRefreshPolicy(component.props?.refreshPolicy, { online: Boolean(component.dataRef && component.binding) })
      };
      const cacheKey = JSON.stringify(spec);
      let container = existing;
      if (!container) {
        container = documentRef.createElement("div");
        container.className = "chart-render";
        const fallback = card.querySelector(".bar-chart");
        fallback ? fallback.before(container) : card.append(container);
      }
      container.dataset.renderKey = cacheKey;
      container.setAttribute("aria-busy", "true");
      const fallback = { type, labels, values: series[0].values, colors, title: component.title, width, gauge: component.props?.gauge || {} };
      let result;
      if (getPageType() === "dashboard" && type !== "data-table") {
        activeClientContainers.add(container);
        try {
          result = await clientRuntime.render(container, spec, {
            onIntent: component.props?.drilldown?.enabled === true
              ? (intent) => onDrilldownIntent?.({ componentId: component.id, ...intent })
              : component.props?.selection?.enabled === true
                ? (intent) => onSelectionIntent?.({ componentId: component.id, ...intent })
              : null
          });
          if (result.status !== "stale") card.dataset.chartRuntime = "echarts";
        } catch {
          clientRuntime.dispose(container);
          activeClientContainers.delete(container);
          result = await renderStatic({ card, container, cacheKey, spec, fallback });
          if (result.status !== "stale") result.status = result.status === "fallback" ? "fallback" : "client-fallback";
        }
      } else {
        clientRuntime.dispose(container);
        activeClientContainers.delete(container);
        result = await renderStatic({ card, container, cacheKey, spec, fallback });
      }
      if (result.status === "stale") return { status: "stale", type };
      container.removeAttribute("aria-busy");
      container.setAttribute("role", "img");
      container.setAttribute("aria-label", chartAriaLabel(component.title, type));
      card.dataset.chartRendered = "true";
      return { status: result.status, type };
    },
    prune(componentIds = []) {
      const activeIds = new Set(componentIds);
      for (const container of [...activeClientContainers]) {
        const card = container.closest("[data-item-id]");
        if (!card?.isConnected || !activeIds.has(card.dataset.itemId) || getPageType() !== "dashboard") activeClientContainers.delete(container);
      }
      return clientRuntime.disposeMissing(activeClientContainers);
    },
    dispose() {
      activeClientContainers.clear();
      clientRuntime.disposeAll();
    }
  };
  return Object.freeze(adapter);
}
