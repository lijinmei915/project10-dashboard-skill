import test from "node:test";
import assert from "node:assert/strict";
import { createKpiSparklineOption, createKpiSparklineRuntime, createStaticKpiSparklineSvg, normalizeKpiSparkline } from "../studio/kpi-sparkline-runtime.mjs";

test("normalizes a bounded KPI sparkline without inventing points", () => {
  const input = { labels: Array.from({ length: 14 }, (_, index) => `D${index + 1}`), values: Array.from({ length: 14 }, (_, index) => index + 1), unit: " 家" };
  assert.deepEqual(normalizeKpiSparkline(input, { points: 7 }).labels, ["D8", "D9", "D10", "D11", "D12", "D13", "D14"]);
  assert.equal(normalizeKpiSparkline({ labels: ["A"], values: [1] }), null);
  assert.equal(normalizeKpiSparkline({ labels: ["A", "B"], values: [1, Number.NaN] }), null);
});

test("builds a controlled interactive area sparkline option", () => {
  const option = createKpiSparklineOption({ labels: ["周一", "周二", "周三"], values: [12, 15, 14], unit: " 家" }, { style: "area", color: "#ff8000" });
  assert.equal(option.tooltip.trigger, "axis");
  assert.equal(option.series[0].type, "line");
  assert.equal(option.series[0].smooth, 0.32);
  assert.equal(option.series[0].lineStyle.width, 1.5);
  assert.equal(option.series[0].areaStyle.opacity, 1);
  assert.deepEqual(option.series[0].areaStyle.color.colorStops.map(({ offset }) => offset), [0, 0.72, 1]);
  assert.equal(option.series[0].areaStyle.color.colorStops.at(-1).color, "rgba(255, 128, 0, 0)");
  assert.equal(option.series[0].lineStyle.color, "#ff8000");
});

test("builds static Report SVG from the same controlled trend data", () => {
  const smooth = createStaticKpiSparklineSvg({ labels: ["一", "二", "三"], values: [10, 30, 20] }, { style: "smooth" });
  assert.match(smooth, /class="kpi-sparkline-static"/);
  assert.match(smooth, /<path d="M/);
  assert.doesNotMatch(smooth, /<polygon/);
  const area = createStaticKpiSparklineSvg({ labels: ["一", "二"], values: [10, 20] }, { style: "area" });
  assert.match(area, /<linearGradient id="kpi-sparkline-fill-trend"/);
  assert.match(area, /<path d="M .* Q .* L 176 57 L 4 57 Z" fill="url\(#kpi-sparkline-fill-trend\)"/);
  assert.equal(createStaticKpiSparklineSvg({ labels: ["一"], values: [10] }), "");
});

test("reuses and disposes KPI sparkline ECharts instances", async () => {
  const calls = [];
  const instance = { on: () => {}, off: () => {}, setOption: (option) => calls.push(option), resize: () => {}, dispose: () => calls.push("disposed") };
  const runtime = createKpiSparklineRuntime({ loadEcharts: async () => ({ init: () => instance }), createResizeObserver: null });
  const container = { isConnected: true };
  const input = { labels: ["A", "B"], values: [1, 2] };
  assert.equal((await runtime.render(container, input)).status, "client-created");
  assert.equal((await runtime.render(container, input)).status, "client-updated");
  assert.equal(runtime.size(), 1);
  runtime.disposeMissing([]);
  assert.equal(runtime.size(), 0);
  assert(calls.includes("disposed"));
});
