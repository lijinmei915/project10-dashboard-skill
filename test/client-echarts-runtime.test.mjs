import assert from "node:assert/strict";
import test from "node:test";
import { createClientEchartsRuntime } from "../studio/client-echarts-runtime.mjs";

function chartSpec(values = [12, 18], zoom = "none") {
  return {
    version: 1,
    chartType: "line",
    data: { labels: ["一月", "二月"], series: [{ name: "收入", values }], thresholds: [], gauge: {}, table: {} },
    appearance: { mode: "light", width: 720, height: 260, palette: ["#1677ff"] },
    interactions: { legend: { visible: false, interactive: false }, tooltip: { enabled: true }, zoom },
    refreshPolicy: { mode: "manual", pauseWhenHidden: true }
  };
}

test("client ECharts runtime reuses instances, translates intents, resizes and disposes deterministically", async () => {
  const calls = { init: 0, setOption: 0, resize: 0, dispose: 0, observe: 0, disconnect: 0, on: 0, off: 0 };
  let resizeCallback;
  let clickHandler;
  const intents = [];
  const instance = {
    setOption(option, settings) {
      calls.setOption += 1;
      assert.equal(option.series[0].type, "line");
      assert.deepEqual(settings, { notMerge: true, lazyUpdate: false });
    },
    on(name, handler) { assert.equal(name, "click"); calls.on += 1; clickHandler = handler; },
    off(name, handler) { assert.equal(name, "click"); assert.equal(handler, clickHandler); calls.off += 1; },
    resize() { calls.resize += 1; },
    dispose() { calls.dispose += 1; }
  };
  const runtime = createClientEchartsRuntime({
    loadEcharts: async () => ({ init(container, theme, settings) {
      calls.init += 1;
      assert.equal(container.isConnected, true);
      assert.equal(theme, null);
      assert.deepEqual(settings, { renderer: "canvas" });
      return instance;
    } }),
    createResizeObserver(callback) {
      resizeCallback = callback;
      return { observe() { calls.observe += 1; }, disconnect() { calls.disconnect += 1; } };
    }
  });
  const container = { isConnected: true };

  assert.equal((await runtime.render(container, chartSpec(), { onIntent: (intent) => intents.push(intent) })).status, "client-created");
  assert.equal((await runtime.render(container, chartSpec([20, 24]), { onIntent: (intent) => intents.push({ ...intent, current: true }) })).status, "client-updated");
  assert.equal(runtime.size(), 1);
  clickHandler({ name: "二月", dataIndex: 1, seriesName: "收入" });
  assert.deepEqual(intents, [{ type: "chart.select", value: "二月", dataIndex: 1, seriesName: "收入", current: true }]);
  resizeCallback();
  assert.deepEqual(calls, { init: 1, setOption: 2, resize: 1, dispose: 0, observe: 1, disconnect: 0, on: 1, off: 0 });

  assert.equal(runtime.disposeMissing([]), 1);
  assert.equal(runtime.size(), 0);
  assert.deepEqual(calls, { init: 1, setOption: 2, resize: 1, dispose: 1, observe: 1, disconnect: 1, on: 1, off: 1 });
});

test("client ECharts runtime ignores a render that finishes after disposal", async () => {
  let resolveEcharts;
  let initialized = false;
  const runtime = createClientEchartsRuntime({
    loadEcharts: () => new Promise((resolve) => { resolveEcharts = resolve; }),
    createResizeObserver: null
  });
  const container = { isConnected: true };
  const pending = runtime.render(container, chartSpec());
  await Promise.resolve();
  runtime.dispose(container);
  resolveEcharts({ init() { initialized = true; throw new Error("must not initialize"); } });

  assert.equal((await pending).status, "stale");
  assert.equal(initialized, false);
  assert.equal(runtime.size(), 0);
});

test("client ECharts runtime preserves the active zoom window across data updates", async () => {
  const options = [];
  const instance = {
    setOption(option) { options.push(option); },
    getOption() { return { dataZoom: [{ start: 20, end: 80 }] }; },
    on() {}, off() {}, dispose() {}, resize() {}
  };
  const runtime = createClientEchartsRuntime({
    loadEcharts: async () => ({ init: () => instance }),
    createResizeObserver: null
  });
  const container = { isConnected: true };
  await runtime.render(container, chartSpec([12, 18], "x"));
  assert.deepEqual({ start: options[0].dataZoom[0].start, end: options[0].dataZoom[0].end }, { start: undefined, end: undefined });
  await runtime.render(container, chartSpec([20, 24], "x"));
  assert.deepEqual({ start: options[1].dataZoom[0].start, end: options[1].dataZoom[0].end }, { start: 20, end: 80 });
  await runtime.render(container, chartSpec([30, 36], "y"));
  assert.deepEqual({ start: options[2].dataZoom[0].start, end: options[2].dataZoom[0].end }, { start: undefined, end: undefined });
});
