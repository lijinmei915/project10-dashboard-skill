import { expect, test } from "@playwright/test";
import { createDeterministicDraft } from "../../.agents/skills/dashboard-html/scripts/draft-generator.mjs";
import { validateWorkspace } from "../../.agents/skills/dashboard-html/scripts/workspace-core.mjs";

const chartTypes = [
  "line", "time-series", "area", "bar", "grouped-bar", "stacked-bar", "percent-stacked-bar", "histogram",
  "horizontal-bar", "grouped-horizontal-bar", "stacked-horizontal-bar", "percent-stacked-horizontal-bar",
  "diverging-bar", "ranking-bar", "gantt", "sector-pie", "pie", "rose", "bullet", "gauge", "radar", "funnel"
];

async function triggerFirstChartPoint(page, componentId) {
  return page.locator(`[data-item-id="${componentId}"] .chart-render`).evaluate(async (container) => {
    const echarts = await import("/vendor/echarts.mjs");
    const instance = echarts.getInstanceByDom(container);
    const value = instance.getOption().series[0].data[0];
    const [x, y] = instance.convertToPixel({ seriesIndex: 0 }, [0, value / 2]);
    const renderer = instance.getZr();
    const hover = renderer.handler.findHover(x, y);
    renderer.trigger("click", { type: "click", target: hover.target, topTarget: hover.topTarget, offsetX: x, offsetY: y });
    return Boolean(hover.target);
  });
}

test("client ECharts runtime renders every interactive chart recipe and disposes cleanly", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/.dashboard-preset-preview.html?ci=client-echarts-runtime");

  const audit = await page.evaluate(async (types) => {
    const { createClientEchartsRuntime } = await import("/studio/client-echarts-runtime.mjs");
    const runtime = createClientEchartsRuntime();
    const root = document.createElement("main");
    root.style.cssText = "display:grid;grid-template-columns:repeat(3,320px);gap:12px";
    document.body.replaceChildren(root);
    const containers = types.map((type) => {
      const container = document.createElement("div");
      container.dataset.type = type;
      container.style.cssText = "width:320px;height:260px";
      root.append(container);
      return container;
    });
    const spec = (chartType, values = [18, 34, 26, 48]) => ({
      version: 1,
      chartType,
      data: {
        labels: chartType === "time-series" ? ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"] : ["华东", "华南", "华北", "西部"],
        series: [
          { name: "收入", values },
          { name: "目标", values: [22, 31, 35, 42] }
        ],
        thresholds: [40],
        gauge: { min: 0, max: 100, unit: "%", precision: 0, thresholds: [60, 80] },
        bullet: { min: 0, max: 120, unit: "%", precision: 0, ranges: [60, 85, 100] },
        table: { sort: "none", sortBy: 0, limit: 8, summary: false, formats: [], conditional: false }
      },
      appearance: { mode: "light", width: 320, height: 260, palette: ["#1677ff", "#f59e0b", "#22c55e"] },
      interactions: { legend: { visible: false, interactive: false }, tooltip: { enabled: true }, zoom: "none" },
      refreshPolicy: { mode: "manual", pauseWhenHidden: true }
    });
    const results = await Promise.all(types.map((type, index) => runtime.render(containers[index], spec(type))));
    const updated = await runtime.render(containers[0], spec(types[0], [20, 38, 30, 52]));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvases = containers.map((container) => {
      const canvas = container.querySelector("canvas");
      return canvas ? { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight } : null;
    });
    const sizeBeforeDispose = runtime.size();
    runtime.disposeAll();
    return { results: results.map(({ status }) => status), updated: updated.status, canvases, sizeBeforeDispose, sizeAfterDispose: runtime.size() };
  }, chartTypes);

  expect(audit.results).toEqual(chartTypes.map(() => "client-created"));
  expect(audit.updated).toBe("client-updated");
  expect(audit.sizeBeforeDispose).toBe(chartTypes.length);
  expect(audit.sizeAfterDispose).toBe(0);
  expect(audit.canvases).toHaveLength(chartTypes.length);
  for (const canvas of audit.canvases) {
    expect(canvas).not.toBeNull();
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
    expect(canvas.cssWidth).toBe(320);
    expect(canvas.cssHeight).toBe(260);
  }
  expect(errors).toEqual([]);
});

test("a registered semantic hierarchy drills through authorized levels and restores breadcrumbs", async ({ page }) => {
  const queryBodies = [];
  page.on("request", (request) => { if (request.url().endsWith("/query")) queryBodies.push(request.postDataJSON()); });
  const sourceId = "browser-drilldown-sales";
  const imported = await page.request.post("/api/data-sources/import", { data: {
    id: sourceId, name: "地域销售", format: "csv", portable: false,
    content: "区域,省份,城市,收入\n华东,浙江,杭州,1000\n华东,浙江,宁波,500\n华东,江苏,南京,700\n华南,广东,广州,900"
  } });
  expect(imported.status()).toBe(201);
  const source = (await imported.json()).dataSource;
  const dimensions = source.semanticModel.dimensions;
  const metrics = source.semanticModel.metrics;
  const configured = await page.request.patch(`/api/data-sources/${sourceId}/schema`, { data: {
    expectedUpdatedAt: source.updatedAt,
    semanticModel: {
      dimensions: dimensions.map(({ fieldId, label }) => ({ fieldId, label })),
      metrics: metrics.map(({ fieldId, label, aggregation, format }) => ({ fieldId, label, aggregation, format })),
      hierarchies: [{ id: "geo", label: "地域", levels: dimensions.map(({ id }) => id) }]
    }
  } });
  expect(configured.status()).toBe(200);
  const baseline = { version: 2, theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" }, layout: { sections: [] }, logo: null };
  const generated = await page.request.post("/api/generation/draft", { data: {
    request: { id: "browser-drilldown-draft", prompt: "生成地域销售 Dashboard，趋势图支持下钻", language: "zh", pageType: "dashboard", dataInputs: [{ id: sourceId, kind: "uploaded", name: "地域销售" }] },
    baseWorkspace: baseline
  } });
  expect(generated.status()).toBe(200);
  const workspace = (await generated.json()).run.preview.workspace;
  const chart = workspace.document.sections.flatMap(({ components }) => components).find(({ id }) => id === "opportunity-trend");
  expect(chart.props.drilldown.hierarchyId).toBe("geo");
  chart.props.chartType = "bar";
  expect(validateWorkspace(workspace)).toEqual({ valid: true, issues: [] });
  await page.goto("/.dashboard-preset-preview.html?design=1&ci=drilldown");
  await page.evaluate((value) => localStorage.setItem("dashboard-preset-preview:v1", JSON.stringify(value)), workspace);
  await page.reload();
  const drilldownAudit = await page.evaluate(async () => {
    const workspace = window.DashboardStudioBridge.getAiHistoryContext().currentWorkspace;
    const component = workspace.document.sections.flatMap(({ components }) => components).find(({ id }) => id === "opportunity-trend");
    const { drilldownContext } = await import("/studio/drilldown-state.mjs");
    return {
      runtimeError: document.documentElement.dataset.runtimeError || "",
      drilldown: component?.props?.drilldown || null,
      binding: component?.binding || null,
      type: component?.type || null,
      dataRef: component?.dataRef || null,
      context: drilldownContext(workspace.document, workspace.interactions, "opportunity-trend"),
      heading: Boolean(document.querySelector('[data-item-id="opportunity-trend"] > .card-heading'))
    };
  });
  expect(drilldownAudit.context, JSON.stringify(drilldownAudit)).not.toBeNull();
  await expect(page.locator('[data-item-id="opportunity-trend"] .chart-drilldown-breadcrumb')).toContainText("区域");
  expect(await triggerFirstChartPoint(page, "opportunity-trend")).toBe(true);
  await expect(page.locator('[data-item-id="opportunity-trend"] .chart-drilldown-breadcrumb')).toContainText("华东");
  await expect.poll(() => page.locator('[data-item-id="opportunity-trend"] .chart-render').evaluate(async (container) => {
    const echarts = await import("/vendor/echarts.mjs");
    return echarts.getInstanceByDom(container).getOption().xAxis[0].data;
  })).toEqual(["浙江", "江苏"]);
  expect(await triggerFirstChartPoint(page, "opportunity-trend")).toBe(true);
  await expect(page.locator('[data-item-id="opportunity-trend"] .chart-drilldown-breadcrumb')).toContainText("浙江");
  await expect.poll(() => page.locator('[data-item-id="opportunity-trend"] .chart-render').evaluate(async (container) => {
    const echarts = await import("/vendor/echarts.mjs");
    return echarts.getInstanceByDom(container).getOption().xAxis[0].data;
  })).toEqual(["杭州", "宁波"]);
  expect(queryBodies.some((body) => body.dimensions.includes("dimension-field-2") && body.filters.some(({ dimensionId, value }) => dimensionId === "dimension-field-1" && value === "华东"))).toBe(true);
  expect(queryBodies.some((body) => body.dimensions.includes("dimension-field-3") && body.filters.some(({ dimensionId, value }) => dimensionId === "dimension-field-2" && value === "浙江"))).toBe(true);
  await page.locator("#designSaveControl").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("dashboard-preset-preview:v1")).interactions?.drilldowns || null)).toEqual({ "opportunity-trend": { path: ["华东", "浙江"] } });
  await page.reload();
  await expect(page.locator('[data-item-id="opportunity-trend"] .chart-drilldown-breadcrumb')).toContainText("浙江");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#designDrawerClose").click();
  await expect.poll(() => page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }))).toEqual({ documentWidth: 390, viewportWidth: 390 });
  const mobileLayout = await page.locator('[data-item-id="opportunity-trend"]').evaluate((card) => {
    const title = card.querySelector(".card-heading");
    const breadcrumb = card.querySelector(".chart-drilldown-breadcrumb");
    const titleRect = title?.getBoundingClientRect();
    const breadcrumbRect = breadcrumb?.getBoundingClientRect();
    return {
      titleVisible: Boolean(titleRect?.width && titleRect?.height),
      breadcrumbVisible: Boolean(breadcrumbRect?.width && breadcrumbRect?.height),
      overlaps: Boolean(titleRect && breadcrumbRect
        && titleRect.left < breadcrumbRect.right
        && titleRect.right > breadcrumbRect.left
        && titleRect.top < breadcrumbRect.bottom
        && titleRect.bottom > breadcrumbRect.top)
    };
  });
  expect(mobileLayout).toEqual({ titleVisible: true, breadcrumbVisible: true, overlaps: false });
  await page.screenshot({ path: "/tmp/dashboard-m4-drilldown-mobile.png", fullPage: true });
  await page.locator('[data-item-id="opportunity-trend"] .chart-drilldown-breadcrumb button').first().click();
  await expect.poll(() => page.locator('[data-item-id="opportunity-trend"] .chart-render').evaluate(async (container) => {
    const echarts = await import("/vendor/echarts.mjs");
    return echarts.getInstanceByDom(container).getOption().xAxis[0].data;
  })).toEqual(["华东", "华南"]);
});

test("a directly opened Report renders SVG without loading the client ECharts vendor", async ({ page }) => {
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  const baseline = {
    version: 2,
    theme: { preset: "fx-orange", pageType: "report", language: "zh", accent: "#e8590c", mode: "light" },
    layout: { sections: [] },
    logo: null
  };
  const run = createDeterministicDraft({ id: "report-client-runtime", prompt: "生成月度经营分析报告，包含趋势图", language: "zh", pageType: "report", dataInputs: [] }, baseline);
  await page.addInitScript((workspace) => {
    localStorage.setItem("dashboard-preset-preview:v1", JSON.stringify(workspace));
  }, run.preview.workspace);

  await page.goto("/.dashboard-preset-preview.html?design=1&ci=report-no-client");
  await expect(page.locator(".dashboard")).toHaveAttribute("data-page-type", "report");
  await expect(page.locator("[data-chart-rendered=true] .chart-render svg").first()).toBeVisible();
  expect(await page.locator("[data-chart-rendered=true] .chart-render canvas").count()).toBe(0);
  expect(requests.filter((url) => url.endsWith("/vendor/echarts.mjs"))).toEqual([]);
  expect(errors).toEqual([]);
});

test("an Online Analysis Report keeps online bindings, renders SVG, and refreshes manually", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  const sourceId = "browser-analysis-report-sales";
  const imported = await page.request.post("/api/data-sources/import", { data: {
    id: sourceId, name: "在线分析销售", format: "csv", portable: false,
    content: "区域,收入\n华东,100\n华南,200"
  } });
  expect(imported.status()).toBe(201);
  const baseline = { version: 2, theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" }, layout: { sections: [] } };
  const generated = await page.request.post("/api/generation/draft", { data: {
    request: { id: "browser-analysis-report-draft", prompt: "生成在线分析销售报告", language: "zh", pageType: "analysis-report", dataInputs: [{ id: sourceId, kind: "uploaded", name: "在线分析销售" }] },
    baseWorkspace: baseline
  } });
  expect(generated.status()).toBe(200);
  const workspace = (await generated.json()).run.preview.workspace;
  expect(workspace.theme.pageType).toBe("analysis-report");
  expect(workspace.resources.datasets[sourceId]).toEqual({ portable: false });
  expect(JSON.stringify(workspace)).not.toContain('"records"');
  await page.addInitScript((value) => localStorage.setItem("dashboard-preset-preview:v1", JSON.stringify(value)), workspace);
  await page.goto("/.dashboard-preset-preview.html?design=1&ci=analysis-report-online");
  await expect(page.locator(".dashboard")).toHaveAttribute("data-page-type", "analysis-report");
  await expect(page.locator("[data-chart-rendered=true] .chart-render svg").first()).toBeVisible();
  expect(await page.locator("[data-chart-rendered=true] .chart-render canvas").count()).toBe(0);
  await expect(page.locator("#dashboardRefreshButton")).toBeEnabled();
  await page.locator("#designDrawerClose").click();
  const before = await page.locator("#dashboardRefreshStatus").innerText();
  await page.locator("#dashboardRefreshButton").click();
  await expect.poll(() => page.locator("#dashboardRefreshStatus").innerText()).not.toBe(before);
  expect(requests.filter((url) => url.endsWith("/vendor/echarts.mjs"))).toEqual([]);
});

test("one controlled Bullet spec renders as Dashboard Canvas and Report SVG on mobile", async ({ page, context }) => {
  const baseline = {
    version: 2,
    theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" },
    layout: { sections: [] },
    logo: null
  };
  const run = createDeterministicDraft({ id: "bullet-dual-runtime", prompt: "用子弹图比较实际收入和目标收入", language: "zh", pageType: "dashboard", dataInputs: [] }, baseline);
  const dashboardWorkspace = run.preview.workspace;
  const bullet = dashboardWorkspace.document.sections.flatMap(({ components }) => components).find(({ props }) => props?.chartType === "bullet");
  expect(bullet?.props?.bullet).toEqual({ min: 0, max: 120, unit: "%", precision: 0, ranges: [60, 85, 100] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((workspace) => localStorage.setItem("dashboard-preset-preview:v1", JSON.stringify(workspace)), dashboardWorkspace);
  await page.goto("/.dashboard-preset-preview.html?ci=bullet-dashboard");
  const dashboardCard = page.locator(`[data-item-id="${bullet.id}"]`);
  await expect(dashboardCard.locator(".chart-render canvas")).toBeVisible();
  await expect(dashboardCard).toHaveAttribute("data-chart-runtime", "echarts");
  const canvasAudit = await dashboardCard.locator("canvas").evaluate((canvas) => {
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let nonTransparent = 0;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) nonTransparent += 1;
    return { nonTransparent, documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth };
  });
  expect(canvasAudit.nonTransparent).toBeGreaterThan(100);
  expect(canvasAudit.documentWidth).toBe(canvasAudit.viewportWidth);
  await page.screenshot({ path: "/tmp/dashboard-m7-bullet-mobile.png", fullPage: true });

  const reportWorkspace = structuredClone(dashboardWorkspace);
  reportWorkspace.theme.pageType = "report";
  const reportPage = await context.newPage();
  const reportRequests = [];
  reportPage.on("request", (request) => reportRequests.push(request.url()));
  await reportPage.setViewportSize({ width: 390, height: 844 });
  await reportPage.addInitScript((workspace) => localStorage.setItem("dashboard-preset-preview:v1", JSON.stringify(workspace)), reportWorkspace);
  await reportPage.goto("/.dashboard-preset-preview.html?ci=bullet-report");
  await expect(reportPage.locator(".dashboard")).toHaveAttribute("data-page-type", "report");
  const reportCard = reportPage.locator(`[data-item-id="${bullet.id}"]`);
  await expect(reportCard.locator(".chart-render svg")).toBeVisible();
  await expect(reportCard).toHaveAttribute("data-chart-runtime", "svg");
  expect(await reportCard.locator(".chart-render canvas").count()).toBe(0);
  expect(await reportCard.locator(".chart-render svg path, .chart-render svg rect").count()).toBeGreaterThan(3);
  expect(reportRequests.filter((url) => url.endsWith("/vendor/echarts.mjs"))).toEqual([]);
  expect(await reportPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await reportPage.screenshot({ path: "/tmp/report-m7-bullet-mobile.png", fullPage: true });
  await reportPage.close();
});

test("a non-portable Dashboard queries authorized semantic data without mutating its Workspace", async ({ page }) => {
  const errors = [];
  const queryBodies = [];
  const eventRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().endsWith("/query")) queryBodies.push(request.postDataJSON());
    if (request.url().includes(`/api/data-sources/browser-online-sales/events`)) eventRequests.push(request.url());
  });
  const sourceId = "browser-online-sales";
  const imported = await page.request.post("/api/data-sources/import", { data: {
    id: sourceId, name: "在线销售", format: "csv", portable: false,
    content: "区域,收入\n华东,100\n华南,200"
  } });
  expect(imported.status()).toBe(201);
  const baseline = { version: 2, theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" }, layout: { sections: [] }, logo: null };
  const generated = await page.request.post("/api/generation/draft", { data: {
    request: { id: "browser-online-draft", prompt: "生成在线销售 Dashboard", language: "zh", pageType: "dashboard", dataInputs: [{ id: sourceId, kind: "uploaded", name: "伪造名称" }] },
    baseWorkspace: baseline
  } });
  expect(generated.status()).toBe(200);
  const workspace = (await generated.json()).run.preview.workspace;
  expect(workspace.resources.datasets[sourceId]).toEqual({ portable: false });
  expect(JSON.stringify(workspace)).not.toContain('"records"');
  const onlineComponentIds = workspace.document.sections.flatMap(({ components }) => components)
    .filter(({ dataRef, binding }) => dataRef === sourceId && binding)
    .map(({ id }) => id);
  const selectionChart = workspace.document.sections.flatMap(({ components }) => components).find(({ id }) => id === "opportunity-trend");
  selectionChart.props.chartType = "bar";
  selectionChart.props.zoom = "x";
  selectionChart.props.selection = { enabled: true, targetScope: "page" };
  workspace.document.controls = [{
    id: "browser-region-filter",
    type: "filter-bar",
    props: {
      controls: [{
        id: "browser-region",
        label: "区域",
        control: "select",
        field: "field-1",
        options: [{ value: "", label: "全部区域" }, { value: "华东", label: "华东" }],
        defaultValue: ""
      }],
      targets: onlineComponentIds,
      surface: "plain"
    }
  }];
  const stored = (await (await page.request.get(`/api/data-sources/${sourceId}`)).json()).dataSource;
  const refreshed = await page.request.post(`/api/data-sources/${sourceId}/refresh`, { data: {
    expectedUpdatedAt: stored.updatedAt,
    content: "区域,收入\n华东,1000\n华南,2000"
  } });
  expect(refreshed.status()).toBe(200);

  await page.goto("/.dashboard-preset-preview.html?design=1&ci=online-semantic-query");
  await page.evaluate((value) => localStorage.setItem("dashboard-preset-preview:v1", JSON.stringify(value)), workspace);
  await page.reload();
  await expect(page.locator('[data-item-id="priority-customers"] > strong')).toHaveText("3,000");
  await expect(page.locator('[data-item-id="opportunity-trend"]')).toHaveAttribute("data-data-status", "ready");
  await expect(page.locator('[data-item-id="opportunity-trend"] .chart-render canvas')).toBeVisible();
  await expect(page.locator('[data-item-id="opportunity-trend"] .card-data-status')).toContainText("数据更新于");
  expect(queryBodies.length).toBeGreaterThan(0);
  for (const body of queryBodies) {
    expect(Object.keys(body).sort()).toEqual(["dimensions", "filters", "limit", "metrics"]);
    expect(body.metrics.every((id) => id.startsWith("metric-"))).toBe(true);
    expect(body.dimensions.every((id) => id.startsWith("dimension-"))).toBe(true);
    expect(body.filters.every(({ dimensionId, operator }) => dimensionId.startsWith("dimension-") && ["equals", "in"].includes(operator))).toBe(true);
    expect(JSON.stringify(body)).not.toContain("categoryField");
    expect(JSON.stringify(body)).not.toContain("valueField");
  }
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("dashboard-preset-preview:v1")));
  expect(persisted).toEqual(workspace);

  const hitTarget = await page.locator('[data-item-id="opportunity-trend"] .chart-render').evaluate(async (container) => {
    const echarts = await import("/vendor/echarts.mjs");
    const instance = echarts.getInstanceByDom(container);
    const value = instance.getOption().series[0].data[0];
    const [x, y] = instance.convertToPixel({ seriesIndex: 0 }, [0, value / 2]);
    const renderer = instance.getZr();
    const hover = renderer.handler.findHover(x, y);
    renderer.trigger("click", { type: "click", target: hover.target, topTarget: hover.topTarget, offsetX: x, offsetY: y });
    return Boolean(hover.target);
  });
  expect(hitTarget).toBe(true);
  await expect(page.locator('[data-item-id="priority-customers"] > strong')).toHaveText("1,000");
  await expect(page.locator('[data-item-id="opportunity-trend"] .chart-selection-status')).toHaveText("筛选：华东");
  await page.locator("#designSaveControl").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("dashboard-preset-preview:v1")).interactions?.chartSelections || null)).toEqual({ "opportunity-trend": "华东" });
  await page.reload();
  await expect(page.locator('[data-item-id="priority-customers"] > strong')).toHaveText("1,000");
  await expect(page.locator('[data-item-id="opportunity-trend"] .chart-selection-status')).toHaveText("筛选：华东");
  const queriesAfterRestore = queryBodies.length;
  await page.waitForTimeout(250);
  expect(queryBodies.length).toBe(queriesAfterRestore);
  await expect.poll(() => eventRequests.length).toBeGreaterThan(0);
  await page.locator('[data-item-id="opportunity-trend"] .chart-render').evaluate(async (container) => {
    const echarts = await import("/vendor/echarts.mjs");
    echarts.getInstanceByDom(container).dispatchAction({ type: "dataZoom", start: 20, end: 80 });
  });
  const interactionsBeforeRefresh = await page.evaluate(() => JSON.parse(localStorage.getItem("dashboard-preset-preview:v1")).interactions);
  const currentSource = (await (await page.request.get(`/api/data-sources/${sourceId}`)).json()).dataSource;
  const eventRefresh = await page.request.post(`/api/data-sources/${sourceId}/refresh`, { data: {
    expectedUpdatedAt: currentSource.updatedAt,
    content: "区域,收入\n华东,1500\n华南,2500"
  } });
  expect(eventRefresh.status()).toBe(200);
  await expect(page.locator('[data-item-id="priority-customers"] > strong')).toHaveText("1,500");
  await expect(page.locator('[data-item-id="opportunity-trend"] .chart-selection-status')).toHaveText("筛选：华东");
  const zoomAfterRefresh = await page.locator('[data-item-id="opportunity-trend"] .chart-render').evaluate(async (container) => {
    const echarts = await import("/vendor/echarts.mjs");
    const zoom = echarts.getInstanceByDom(container).getOption().dataZoom?.[0];
    return { start: Math.round(zoom?.start), end: Math.round(zoom?.end) };
  });
  expect(zoomAfterRefresh).toEqual({ start: 20, end: 80 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("dashboard-preset-preview:v1")).interactions)).toEqual(interactionsBeforeRefresh);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-item-id="opportunity-trend"] .chart-selection-status')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.locator("#designDrawerClose").click();
  await expect(page.locator("#designDrawer")).toHaveAttribute("aria-hidden", "true");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "/tmp/dashboard-m5-live-refresh-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('[data-item-id="opportunity-trend"] .chart-selection-status').click();
  await expect(page.locator('[data-item-id="priority-customers"] > strong')).toHaveText("4,000");

  await page.route(`**/api/data-sources/${sourceId}/query`, (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "upstream unavailable" })
  }));
  await page.locator("#dashboardControls .custom-select-trigger").click();
  await page.locator("#dashboardControls .custom-select-option", { hasText: "华东" }).click();
  await expect(page.locator('[data-item-id="priority-customers"] > strong')).toHaveText("4,000");
  await expect(page.locator('[data-item-id="opportunity-trend"]')).toHaveAttribute("data-data-status", "stale");
  await expect(page.locator('[data-item-id="opportunity-trend"] .card-data-status')).toHaveText("连接异常，使用上次数据");
  await expect(page.locator('[data-item-id="opportunity-trend"] .chart-render canvas')).toBeVisible();
  const afterFailure = await page.evaluate(() => JSON.parse(localStorage.getItem("dashboard-preset-preview:v1")));
  expect(afterFailure.resources.datasets[sourceId]).toEqual({ portable: false });
  expect(JSON.stringify(afterFailure)).not.toContain('"records"');
  expect(errors).toEqual([]);
});
