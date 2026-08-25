import assert from "node:assert/strict";
import test from "node:test";
import {
  BULLET_CHART_EXTENSION_MANIFEST,
  createCustomChartExtensionRegistry,
  DEFAULT_CUSTOM_CHART_EXTENSION_REGISTRY,
  validateCustomChartExtensionManifest
} from "../.agents/skills/dashboard-html/scripts/custom-chart-extension-runtime.mjs";
import { createEchartsOption, normalizeChartSpec } from "../.agents/skills/dashboard-html/scripts/chart-spec-runtime.mjs";
import { createDeterministicDraft } from "../.agents/skills/dashboard-html/scripts/draft-generator.mjs";

const palette = ["#1677ff", "#f59e0b"];
const input = {
  type: "bullet",
  labels: ["收入", "毛利"],
  series: [{ name: "实际", values: [82, 68] }, { name: "目标", values: [90, 75] }],
  bullet: { min: 0, max: 120, unit: "%", precision: 0, ranges: [60, 85, 100] },
  palette,
  width: 640,
  height: 300
};

test("registers a versioned controlled custom chart manifest", () => {
  assert.deepEqual(DEFAULT_CUSTOM_CHART_EXTENSION_REGISTRY.ids(), ["bullet"]);
  assert.equal(DEFAULT_CUSTOM_CHART_EXTENSION_REGISTRY.get("bullet").manifest.fallbackType, "horizontal-bar");
  assert.equal(validateCustomChartExtensionManifest(BULLET_CHART_EXTENSION_MANIFEST).semantic, "actual-versus-target-with-performance-ranges");
});

test("rejects duplicate ids, unknown capabilities, and executable manifest input", () => {
  const entry = { manifest: BULLET_CHART_EXTENSION_MANIFEST, buildOption: () => ({}) };
  assert.throws(() => createCustomChartExtensionRegistry([entry, entry]), /Duplicate/);
  assert.throws(() => validateCustomChartExtensionManifest({ ...BULLET_CHART_EXTENSION_MANIFEST, capabilities: ["network"] }), /capability/);
  assert.throws(() => validateCustomChartExtensionManifest({ ...BULLET_CHART_EXTENSION_MANIFEST, capabilities: ["custom-series", "custom-series"] }), /Duplicate custom chart capability/);
  assert.throws(() => validateCustomChartExtensionManifest({ ...BULLET_CHART_EXTENSION_MANIFEST, runtimes: { ...BULLET_CHART_EXTENSION_MANIFEST.runtimes, worker: "server-svg" } }), /runtime field/);
  assert.throws(() => validateCustomChartExtensionManifest({ ...BULLET_CHART_EXTENSION_MANIFEST, fallbackType: "bullet-copy" }), /registered standard chart/);
  assert.throws(() => validateCustomChartExtensionManifest({ ...BULLET_CHART_EXTENSION_MANIFEST, formatter() {} }), /JSON values only/);
});

test("deep-freezes validated manifest arrays and nested runtime fields", () => {
  const manifest = validateCustomChartExtensionManifest(BULLET_CHART_EXTENSION_MANIFEST);
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.capabilities), true);
  assert.equal(Object.isFrozen(manifest.runtimes), true);
  assert.throws(() => manifest.capabilities.push("selection"), TypeError);
  assert.throws(() => { manifest.runtimes.dashboard = "other"; }, TypeError);
});

test("keeps executable fields out of ChartSpec and builds renderItem locally", () => {
  assert.throws(() => normalizeChartSpec({ ...input, renderItem() {} }, { chartTypes: ["bullet"], defaultPalette: palette }), /JSON values only/);
  const spec = normalizeChartSpec(input, { chartTypes: ["bullet"], defaultPalette: palette });
  assert.equal(JSON.stringify(spec).includes("renderItem"), false);
  const option = createEchartsOption(spec);
  assert.equal(option.series[0].type, "custom");
  assert.equal(typeof option.series[0].renderItem, "function");
});

test("isolates a failing local builder and honors its declared standard fallback", () => {
  const manifest = { ...BULLET_CHART_EXTENSION_MANIFEST, fallbackType: "line" };
  const failing = createCustomChartExtensionRegistry([{ manifest, buildOption() { throw new Error("broken extension"); } }]);
  const spec = normalizeChartSpec(input, { chartTypes: ["bullet"], defaultPalette: palette });
  const option = createEchartsOption(spec, { customRegistry: failing });
  assert.equal(option.series[0].type, "line");
  assert.deepEqual(option.series[0].data, [82, 68]);
});

test("rejects malformed Bullet data before the controlled builder runs", () => {
  const options = { chartTypes: ["bullet"], defaultPalette: palette };
  assert.throws(() => normalizeChartSpec({ ...input, labels: [] }, options), /at least one category/);
  assert.throws(() => normalizeChartSpec({ ...input, series: input.series.slice(0, 1) }, options), /exactly two series/);
  assert.throws(() => normalizeChartSpec({ ...input, series: [...input.series, { name: "预测", values: [95, 80] }] }, options), /exactly two series/);
  assert.throws(() => normalizeChartSpec({ ...input, series: [input.series[0], { ...input.series[1], values: [90] }] }, options), /align with categories/);
});

test("does not attach a single-metric binding to a generated Bullet chart", () => {
  const baseline = { version: 2, theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" }, layout: { sections: [] }, logo: null };
  const run = createDeterministicDraft({ id: "bullet-binding", prompt: "用子弹图比较实际收入和目标收入", language: "zh", pageType: "dashboard", dataInputs: [] }, baseline);
  const bullet = run.preview.workspace.document.sections.flatMap(({ components }) => components).find(({ props }) => props?.chartType === "bullet");
  assert.equal(bullet.dataRef, undefined);
  assert.equal(bullet.binding, undefined);
  assert.equal(bullet.props.series.length, 2);
  assert.equal(bullet.props.series.every(({ values }) => values.length === bullet.props.labels.length), true);
});
