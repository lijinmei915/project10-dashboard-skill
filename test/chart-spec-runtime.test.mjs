import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { chartSpecRenderConfig, createEchartsOption, normalizeChartSpec } from "../.agents/skills/dashboard-html/scripts/chart-spec-runtime.mjs";

const root = path.resolve(import.meta.dirname, "..");
const chartCatalog = JSON.parse(await readFile(path.join(root, ".agents/skills/dashboard-html/data/chart-catalog.json"), "utf8"));
const palette = JSON.parse(await readFile(path.join(root, ".agents/skills/dashboard-html/assets/palette.v1.json"), "utf8")).categorical;
const chartTypes = chartCatalog.map(({ type }) => type);

function request(type = "line") {
  return {
    type,
    labels: type === "gauge" ? ["完成率"] : ["华东", "华南", "华北", "西部"],
    series: type === "histogram"
      ? [{ name: "订单金额", values: [12, 18, 21, 22, 27, 35, 42] }]
      : type === "gauge"
        ? [{ name: "目标完成率", values: [76.8] }]
        : [{ name: "本期", values: [42, 36, 31, 24] }, { name: "上期", values: [34, 29, 27, 21] }],
    ...(type === "gauge" ? { gauge: { min: 0, max: 100, unit: "%", precision: 1, thresholds: [60, 85] } } : {}),
    mode: "light",
    width: 640,
    height: 320,
    palette
  };
}

function comboRequest(overrides = {}) {
  return {
    type: "combo-bar-line",
    labels: ["1月", "2月", "3月"],
    series: [
      { name: "收入", values: [128, 156, 142] },
      { name: "转化率", values: [18, 21, 20] }
    ],
    combo: { dualAxis: true, barUnit: "万元", lineUnit: "%" },
    mode: "light",
    width: 640,
    height: 320,
    palette,
    ...overrides
  };
}

test("normalizes the legacy render request into a pure ChartSpec v1", () => {
  const spec = normalizeChartSpec(request("gauge"), { chartTypes, defaultPalette: palette });
  assert.equal(spec.version, 1);
  assert.equal(spec.chartType, "gauge");
  assert.deepEqual(spec.data.gauge, { min: 0, max: 100, unit: "%", precision: 1, thresholds: [60, 85] });
  assert.deepEqual(spec.refreshPolicy, { mode: "manual", pauseWhenHidden: true });
  assert.deepEqual(chartSpecRenderConfig(spec).palette, palette);
  assert.doesNotThrow(() => JSON.stringify(spec));
});

test("rejects executable values before a ChartSpec reaches the builder", () => {
  const unsafe = request();
  unsafe.interactions = { tooltip: { formatter: () => "unsafe" } };
  assert.throws(() => normalizeChartSpec(unsafe, { chartTypes, defaultPalette: palette }), /JSON values only/);
  assert.throws(() => normalizeChartSpec({ ...request(), type: "unknown" }, { chartTypes, defaultPalette: palette }), /Unsupported chart type/);
  const versioned = normalizeChartSpec(request(), { chartTypes, defaultPalette: palette });
  assert.throws(() => normalizeChartSpec({ ...versioned, formatter: "unsafe" }, { chartTypes, defaultPalette: palette }), /unknown field/);
  assert.throws(() => normalizeChartSpec({ ...versioned, dataBinding: { datasetId: "sales", dimensions: ["Region"], metrics: ["revenue"] } }, { chartTypes, defaultPalette: palette }), /identifier is invalid/);
  assert.throws(() => normalizeChartSpec({ ...versioned, interactions: { ...versioned.interactions, drilldown: { hierarchy: ["region"], targetScope: "page" } } }, { chartTypes, defaultPalette: palette }), /identifier count is invalid/);
});

test("normalizes and renders the controlled bar-line combo contract", () => {
  const spec = normalizeChartSpec(comboRequest(), { chartTypes, defaultPalette: palette });
  assert.deepEqual(spec.data.combo, { dualAxis: true, barUnit: "万元", lineUnit: "%" });
  const option = createEchartsOption(spec, { interactive: true });
  assert.deepEqual(option.series.map(({ type, yAxisIndex }) => ({ type, yAxisIndex })), [
    { type: "bar", yAxisIndex: 0 },
    { type: "line", yAxisIndex: 1 }
  ]);
  assert.equal(option.yAxis.length, 2);
  assert.equal(option.yAxis[0].name, "万元");
  assert.equal(option.yAxis[1].name, "%");
  assert.equal(option.tooltip.trigger, "axis");
});

test("rejects combo data that does not contain exactly two aligned metrics", () => {
  assert.throws(() => normalizeChartSpec(comboRequest({ series: [{ name: "收入", values: [1, 2, 3] }] }), { chartTypes, defaultPalette: palette }), /exactly two series/);
  assert.throws(() => normalizeChartSpec(comboRequest({ labels: ["1月", "2月"] }), { chartTypes, defaultPalette: palette }), /align with categories/);
  assert.throws(() => normalizeChartSpec(comboRequest({ combo: { dualAxis: true, unknown: true } }), { chartTypes, defaultPalette: palette }), /unknown field/);
});

test("keeps stacked joins and diverging zero-axis ends square", () => {
  const stacked = normalizeChartSpec({
    ...request("percent-stacked-horizontal-bar"),
    series: [
      { name: "本期", values: [42, 36, 31, 24] },
      { name: "上期", values: [34, 29, 27, 21] },
      { name: "目标", values: [18, 22, 16, 20] }
    ]
  }, { chartTypes, defaultPalette: palette });
  assert.deepEqual(createEchartsOption(stacked).series.map(({ itemStyle }) => itemStyle.borderRadius), [
    [4, 0, 0, 4],
    0,
    [0, 4, 4, 0]
  ]);

  const diverging = normalizeChartSpec(request("diverging-bar"), { chartTypes, defaultPalette: palette });
  assert.deepEqual(createEchartsOption(diverging).series.map(({ itemStyle }) => itemStyle.borderRadius), [
    [4, 0, 0, 4],
    [0, 4, 4, 0]
  ]);
});

test("builds every registered ECharts chart from the shared ChartSpec", () => {
  for (const type of chartTypes.filter((value) => value !== "data-table")) {
    const spec = normalizeChartSpec(request(type), { chartTypes, defaultPalette: palette });
    const staticOption = createEchartsOption(spec);
    const interactiveOption = createEchartsOption(spec, { interactive: true });
    assert(Array.isArray(staticOption.series) && staticOption.series.length, `${type} must create a series`);
    assert.equal(staticOption.animation, false);
    assert.equal(interactiveOption.tooltip.show, true);
  }
  const tableSpec = normalizeChartSpec(request("data-table"), { chartTypes, defaultPalette: palette });
  assert.throws(() => createEchartsOption(tableSpec), /DOM table renderer/);
});

test("keeps interaction intent declarative while the builder owns ECharts callbacks", () => {
  const spec = normalizeChartSpec({
    ...request("line"),
    interactions: {
      legend: { visible: true, interactive: true },
      tooltip: { enabled: true },
      zoom: "x",
      selection: { enabled: true, targetScope: "section" },
      drilldown: { hierarchy: ["region", "province", "city"], targetScope: "page" }
    },
    refreshPolicy: { mode: "poll", intervalMs: 30000, pauseWhenHidden: true }
  }, { chartTypes, defaultPalette: palette });
  assert.deepEqual(spec.interactions.drilldown, { hierarchy: ["region", "province", "city"], targetScope: "page" });
  assert.deepEqual(spec.interactions.selection, { enabled: true, targetScope: "section" });
  assert.deepEqual(spec.refreshPolicy, { mode: "poll", intervalMs: 30000, pauseWhenHidden: true });
  const option = createEchartsOption(spec, { interactive: true });
  assert.equal(option.dataZoom[0].type, "inside");
  assert.equal(option.tooltip.show, true);
});
