import assert from "node:assert/strict";
import test from "node:test";
import { chartAriaLabel, normalizeChartSeries, requestChartSvg } from "../studio/workspace-chart-adapter.mjs";

test("normalizes explicit chart series and numeric values", () => {
  assert.deepEqual(normalizeChartSeries({ title: "趋势", props: { series: [{ name: "收入", values: [1, "2"] }, { values: [3] }] } }), [
    { name: "收入", values: [1, 2] },
    { name: "系列 2", values: [3] }
  ]);
});

test("falls back to the component value series", () => {
  assert.deepEqual(normalizeChartSeries({ title: "构成", props: { values: ["4", 5] } }), [{ name: "构成", values: [4, 5] }]);
});

test("builds accessible labels for every controlled chart type", () => {
  assert.equal(chartAriaLabel("趋势", "line"), "趋势 · 折线图");
  assert.equal(chartAriaLabel("累计", "area"), "累计 · 面积图");
  assert.equal(chartAriaLabel("构成", "pie"), "构成 · 环形图");
  assert.equal(chartAriaLabel("对比", "bar"), "对比 · 柱状图");
  assert.equal(chartAriaLabel("排名", "horizontal-bar"), "排名 · 条形图");
});

test("requests a valid SVG and rejects invalid chart responses", async () => {
  const calls = [];
  const svg = await requestChartSvg({ type: "line" }, async (...args) => {
    calls.push(args);
    return { ok: true, async json() { return { svg: "<svg></svg>" }; } };
  });
  assert.equal(svg, "<svg></svg>");
  assert.equal(calls[0][0], "/api/charts/render");
  assert.equal(JSON.parse(calls[0][1].body).type, "line");
  await assert.rejects(() => requestChartSvg({}, async () => ({ ok: true, async json() { return { svg: "not-svg" }; } })), /图表服务不可用/);
});
