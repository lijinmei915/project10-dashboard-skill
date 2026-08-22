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
  const labels = { line: "折线图", "time-series": "时序图", area: "面积图", "sector-pie": "饼图", pie: "环图", rose: "玫瑰图", radar: "雷达图", funnel: "漏斗图", "data-table": "表格", bar: "基础柱图", "grouped-bar": "分组柱图", "stacked-bar": "堆叠柱图", "percent-stacked-bar": "百分比堆叠柱图", histogram: "直方图", "horizontal-bar": "基础条图", "grouped-horizontal-bar": "分组条图", "stacked-horizontal-bar": "堆叠条图", "percent-stacked-horizontal-bar": "百分比堆叠条图", "diverging-bar": "双向条图", "ranking-bar": "排名图", gantt: "甘特图" };
  return `${title || "图表"} · ${labels[type] || labels.bar}`;
}

export function visibleChartSeries(component, visibility = {}) {
  const series = normalizeChartSeries(component);
  const visible = series.filter(({ name }) => visibility[name] !== false);
  return visible.length ? visible : series;
}

export function automaticChartPaletteMode(component, type) {
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

export function createWorkspaceChartAdapter({ document: documentRef, dashboard, request = requestChartSvg, cache = new Map(), resolveType, resolvePalette, getMode, createFallbackSvg, getSeriesVisibility = () => ({}), onSeriesVisibilityChange, escape = CSS.escape }) {
  return Object.freeze({
    async render(component) {
      const card = dashboard.querySelector(`[data-item-id="${escape(component.id)}"]`);
      if (!card) return { status: "missing" };
      const type = resolveType(card, component);
      card.dataset.chartType = type;
      const existing = card.querySelector(":scope > .chart-render");
      if (type === "bar") {
        existing?.remove();
        delete card.dataset.chartRendered;
        return { status: "native", type };
      }
      const labels = Array.isArray(component.props?.labels) ? component.props.labels.map(String) : [];
      const allSeries = normalizeChartSeries(component);
      const visibility = getSeriesVisibility(component.id) || {};
      const series = visibleChartSeries(component, visibility);
      if (!series.some(({ values }) => values.some(Number.isFinite))) {
        existing?.remove();
        delete card.dataset.chartRendered;
        return { status: "empty", type };
      }
      const colors = resolvePalette(card, component, type);
      let legend = card.querySelector(":scope > .dashboard-chart-legend");
      if (allSeries.length > 1 && component.props?.legend?.visible !== false) {
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
      const payload = { type, labels, series, thresholds: component.props?.thresholds || [], table: component.props?.table || {}, mode: getMode(), width, height: 260, palette: colors, legend: false };
      const cacheKey = JSON.stringify(payload);
      let container = existing;
      if (!container) {
        container = documentRef.createElement("div");
        container.className = "chart-render";
        const fallback = card.querySelector(".bar-chart");
        fallback ? fallback.before(container) : card.append(container);
      }
      container.dataset.renderKey = cacheKey;
      container.setAttribute("aria-busy", "true");
      let status = "remote";
      try {
        let svg = cache.get(cacheKey);
        if (!svg) {
          svg = await request(payload);
          cache.set(cacheKey, svg);
        } else {
          status = "cache";
        }
        if (!container.isConnected || container.dataset.renderKey !== cacheKey) return { status: "stale", type };
        container.innerHTML = svg;
      } catch {
        if (!container.isConnected || container.dataset.renderKey !== cacheKey) return { status: "stale", type };
        container.replaceChildren(createFallbackSvg({ type, labels, values: series[0].values, colors, title: component.title, width }));
        status = "fallback";
      }
      container.removeAttribute("aria-busy");
      container.setAttribute("role", "img");
      container.setAttribute("aria-label", chartAriaLabel(component.title, type));
      card.dataset.chartRendered = "true";
      return { status, type };
    }
  });
}
