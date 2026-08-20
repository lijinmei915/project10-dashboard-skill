import assert from "node:assert/strict";
import test from "node:test";
import { chartAriaLabel, normalizeChartSeries, requestChartSvg, visibleChartSeries } from "../studio/workspace-chart-adapter.mjs";

test("normalizes explicit chart series and numeric values", () => {
  assert.deepEqual(normalizeChartSeries({ title: "趋势", props: { series: [{ name: "收入", values: [1, "2"] }, { values: [3] }] } }), [
    { name: "收入", values: [1, 2] },
    { name: "系列 2", values: [3] }
  ]);
});

test("falls back to the component value series", () => {
  assert.deepEqual(normalizeChartSeries({ title: "构成", props: { values: ["4", 5] } }), [{ name: "构成", values: [4, 5] }]);
});

test("filters chart series from persisted legend state and never renders an empty chart", () => {
  const component = { title: "趋势", props: { series: [{ name: "收入", values: [1] }, { name: "订单", values: [2] }] } };
  assert.deepEqual(visibleChartSeries(component, { 收入: false }), [{ name: "订单", values: [2] }]);
  assert.deepEqual(visibleChartSeries(component, { 收入: false, 订单: false }), normalizeChartSeries(component));
});

test("builds accessible labels for every controlled chart type", () => {
  assert.equal(chartAriaLabel("趋势", "line"), "趋势 · 折线图");
  assert.equal(chartAriaLabel("累计", "area"), "累计 · 面积图");
  assert.equal(chartAriaLabel("对比", "bar"), "对比 · 基础柱图");
  assert.equal(chartAriaLabel("监控", "time-series"), "监控 · 时序图");
  assert.equal(chartAriaLabel("区域对比", "grouped-bar"), "区域对比 · 分组柱图");
  assert.equal(chartAriaLabel("构成", "stacked-bar"), "构成 · 堆叠柱图");
  assert.equal(chartAriaLabel("占比", "percent-stacked-bar"), "占比 · 百分比堆叠柱图");
  assert.equal(chartAriaLabel("分布", "histogram"), "分布 · 直方图");
  assert.equal(chartAriaLabel("对比", "horizontal-bar"), "对比 · 基础条图");
  assert.equal(chartAriaLabel("分组", "grouped-horizontal-bar"), "分组 · 分组条图");
  assert.equal(chartAriaLabel("构成", "stacked-horizontal-bar"), "构成 · 堆叠条图");
  assert.equal(chartAriaLabel("占比", "percent-stacked-horizontal-bar"), "占比 · 百分比堆叠条图");
  assert.equal(chartAriaLabel("正负", "diverging-bar"), "正负 · 双向条图");
  assert.equal(chartAriaLabel("排名", "ranking-bar"), "排名 · 排名图");
  assert.equal(chartAriaLabel("排期", "gantt"), "排期 · 甘特图");
  assert.equal(chartAriaLabel("构成", "sector-pie"), "构成 · 饼图");
  assert.equal(chartAriaLabel("占比", "pie"), "占比 · 环图");
  assert.equal(chartAriaLabel("规模", "rose"), "规模 · 玫瑰图");
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
