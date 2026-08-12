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
  const labels = { line: "折线图", area: "面积图", pie: "环形图", bar: "柱状图", "horizontal-bar": "条形图" };
  return `${title || "图表"} · ${labels[type] || labels.bar}`;
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

export function createWorkspaceChartAdapter({ document: documentRef, dashboard, request = requestChartSvg, cache = new Map(), resolveType, resolvePalette, getMode, createFallbackSvg, escape = CSS.escape }) {
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
      const series = normalizeChartSeries(component);
      if (!series.some(({ values }) => values.some(Number.isFinite))) {
        existing?.remove();
        delete card.dataset.chartRendered;
        return { status: "empty", type };
      }
      const colors = resolvePalette(card);
      const width = Math.max(280, Math.min(1200, Math.round(card.getBoundingClientRect().width - 40) || 720));
      const payload = { type, labels, series, mode: getMode(), width, height: 260, palette: colors };
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
