import assert from "node:assert/strict";
import test from "node:test";
import { createLiveDataRefreshRuntime, normalizeRefreshPolicy } from "../studio/live-data-refresh-runtime.mjs";

function createTimers() {
  let id = 0;
  const pending = new Map();
  return {
    setTimer(callback, delay) { const timerId = ++id; pending.set(timerId, { callback, delay }); return timerId; },
    clearTimer(timerId) { pending.delete(timerId); },
    delays() { return [...pending.values()].map(({ delay }) => delay).sort((a, b) => a - b); },
    async run(delay) {
      const entry = [...pending].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `missing timer with delay ${delay}`);
      pending.delete(entry[0]);
      await entry[1].callback();
      await Promise.resolve();
    }
  };
}

function createDocument() {
  const listeners = new Map();
  return {
    visibilityState: "visible",
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    dispatch(type) { listeners.get(type)?.(); }
  };
}

class FakeEventSource {
  constructor(url) { this.url = url; this.listeners = new Map(); this.closed = false; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  emit(type, { id = "", data = {} } = {}) { this.listeners.get(type)?.({ lastEventId: id, data: JSON.stringify(data) }); }
  close() { this.closed = true; }
}

test("normalizes safe defaults and clamps polling intervals", () => {
  assert.deepEqual(normalizeRefreshPolicy(undefined), { mode: "dataset-event", pauseWhenHidden: true });
  assert.deepEqual(normalizeRefreshPolicy({ mode: "poll", intervalMs: 100 }), { mode: "poll", intervalMs: 5_000, pauseWhenHidden: true });
  assert.deepEqual(normalizeRefreshPolicy({ mode: "manual", pauseWhenHidden: false }), { mode: "manual", pauseWhenHidden: false });
});

test("polling pauses while hidden and retries failures with exponential backoff", async () => {
  const timers = createTimers();
  const documentRef = createDocument();
  const calls = [];
  const outcomes = [false, true, true];
  const runtime = createLiveDataRefreshRuntime({
    documentRef, setTimer: timers.setTimer, clearTimer: timers.clearTimer,
    onRefresh: async (event) => { calls.push(event); return outcomes.shift(); }, jitter: () => 0
  });
  runtime.configure([{ componentId: "chart-a", datasetId: "sales", policy: { mode: "poll", intervalMs: 5_000 } }]);
  assert.deepEqual(timers.delays(), [5_000]);
  await timers.run(5_000);
  assert.equal(calls[0].reason, "poll");
  assert.deepEqual(timers.delays(), [1_000]);
  await timers.run(1_000);
  assert.equal(calls[1].reason, "retry");
  assert.deepEqual(timers.delays(), [5_000]);
  documentRef.visibilityState = "hidden";
  documentRef.dispatch("visibilitychange");
  assert.deepEqual(timers.delays(), []);
  documentRef.visibilityState = "visible";
  documentRef.dispatch("visibilitychange");
  await Promise.resolve();
  assert.equal(calls.at(-1).reason, "resume");
  assert.deepEqual(timers.delays(), [5_000]);
  runtime.dispose();
});

test("manual refresh updates every configured dataset group", async () => {
  const calls = [];
  const runtime = createLiveDataRefreshRuntime({
    onRefresh: async (event) => { calls.push(event); return true; }
  });
  runtime.configure([
    { componentId: "kpi-a", datasetId: "sales", policy: { mode: "manual" } },
    { componentId: "chart-a", datasetId: "sales", policy: { mode: "manual" } },
    { componentId: "table-a", datasetId: "customers", policy: { mode: "manual" } }
  ]);
  await runtime.refreshNow();
  assert.deepEqual(calls.map(({ datasetId, componentIds, reason }) => ({ datasetId, componentIds, reason })), [
    { datasetId: "customers", componentIds: ["table-a"], reason: "manual" },
    { datasetId: "sales", componentIds: ["chart-a", "kpi-a"], reason: "manual" }
  ]);
  runtime.dispose();
});

test("dataset events are deduplicated and reconnect from the last event id", async () => {
  const timers = createTimers();
  const documentRef = createDocument();
  const sources = [];
  const calls = [];
  const runtime = createLiveDataRefreshRuntime({
    documentRef, setTimer: timers.setTimer, clearTimer: timers.clearTimer, jitter: () => 0,
    eventSourceFactory: (url) => { const source = new FakeEventSource(url); sources.push(source); return source; },
    onRefresh: async (event) => { calls.push(event); return true; }
  });
  runtime.configure([
    { componentId: "chart-a", datasetId: "sales", policy: { mode: "dataset-event" } },
    { componentId: "kpi-a", datasetId: "sales", policy: { mode: "dataset-event" } }
  ]);
  assert.equal(sources.length, 1);
  sources[0].emit("dataset.snapshot", { id: "v1", data: { version: 1, updatedAt: "2026-08-23T00:00:00.000Z" } });
  sources[0].emit("dataset.updated", { id: "v2", data: { version: 1, updatedAt: "2026-08-23T00:01:00.000Z" } });
  await Promise.resolve();
  assert.deepEqual(calls[0], { datasetId: "sales", componentIds: ["chart-a", "kpi-a"], reason: "dataset-event" });
  sources[0].emit("dataset.updated", { id: "v2", data: { version: 1, updatedAt: "2026-08-23T00:01:00.000Z" } });
  await Promise.resolve();
  assert.equal(calls.length, 1);
  sources[0].onerror();
  assert.equal(sources[0].closed, true);
  assert.deepEqual(timers.delays(), [1_000]);
  await timers.run(1_000);
  assert.equal(sources[1].url, "/api/data-sources/sales/events?after=v2");
  runtime.dispose();
});

test("an explicit background policy continues polling while the page is hidden", async () => {
  const timers = createTimers();
  const documentRef = createDocument();
  documentRef.visibilityState = "hidden";
  const calls = [];
  const runtime = createLiveDataRefreshRuntime({
    documentRef, setTimer: timers.setTimer, clearTimer: timers.clearTimer,
    onRefresh: async (event) => { calls.push(event); return true; }
  });
  runtime.configure([{ componentId: "chart-a", datasetId: "sales", policy: { mode: "poll", intervalMs: 5_000, pauseWhenHidden: false } }]);
  assert.deepEqual(timers.delays(), [5_000]);
  await timers.run(5_000);
  assert.equal(calls[0].reason, "poll");
  assert.deepEqual(timers.delays(), [5_000]);
  runtime.dispose();
});
