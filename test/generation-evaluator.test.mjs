import assert from "node:assert/strict";
import test from "node:test";
import { createDataContext, parseDataSource } from "../.agents/skills/dashboard-html/scripts/data-source-service.mjs";
import { createDeterministicDraft } from "../.agents/skills/dashboard-html/scripts/draft-generator.mjs";
import { scoreGenerationCase } from "../.agents/skills/dashboard-html/scripts/generation-evaluator.mjs";

function workspace(chartType = "line", kpiTitle = "收入") {
  return {
    version: 2,
    document: {
      title: "评测工作区",
      sections: [{ id: "main", title: "概览", components: [
        { id: "trend", type: "chart", title: "趋势", props: { chartType, labels: ["一月"], values: [1] } },
        { id: "revenue", type: "kpi", title: kpiTitle, props: { value: "1" } }
      ] }]
    },
    theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light", paletteVersion: "1.2.0", sectionIcons: {}, sectionSubtitles: {}, cardOverrides: {} },
    layout: { sections: [{ id: "main", grouped: true, span: 12, layout: "split", items: [{ id: "trend", span: 6 }, { id: "revenue", span: 6 }] }] },
    logo: null,
    resources: { charts: {} }
  };
}

const definition = { id: "refine", mode: "refine", expect: { chartType: "area", targetOnly: true } };
const baseWorkspace = workspace();

test("generation evaluator accepts a narrow target-only refinement", () => {
  const run = { status: "preview-ready", repairAttempts: 0, preview: { workspace: workspace("area"), diff: [] }, bundle: {} };
  const result = scoreGenerationCase(definition, run, { targetId: "trend", baseWorkspace });
  assert.equal(result.score, 100);
  assert.equal(result.passed, true);
});

test("generation evaluator rejects collateral component changes", () => {
  const run = { status: "preview-ready", repairAttempts: 0, preview: { workspace: workspace("area", "被意外修改"), diff: [] }, bundle: {} };
  const result = scoreGenerationCase(definition, run, { targetId: "trend", baseWorkspace });
  assert.equal(result.score, 75);
  assert.equal(result.passed, false);
  assert.deepEqual(result.checks.find(({ name }) => name === "target-only-change"), {
    name: "target-only-change",
    passed: false,
    weight: 25,
    detail: "trend, revenue"
  });
});

test("generation evaluator rejects unknown bindings and ungrounded visible values", () => {
  const source = parseDataSource({
    id: "grounded-sales",
    name: "Grounded sales",
    format: "csv",
    content: "month,revenue,orders,conversion_rate\n2026-01,120000,80,0.12\n2026-02,150000,95,0.15",
    portable: true,
    now: "2026-08-11T12:00:00.000Z"
  });
  const dataContext = createDataContext(source);
  const run = createDeterministicDraft({
    id: "grounding-eval",
    prompt: "Generate a monthly sales dashboard",
    language: "en",
    pageType: "dashboard",
    dataInputs: [dataContext.input]
  }, {
    version: 2,
    theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" },
    layout: { sections: [] },
    logo: null
  }, { dataContexts: [dataContext], now: "2026-08-11T12:00:00.000Z" });
  const groundedDefinition = {
    id: "grounded-sales",
    mode: "draft",
    expect: { pageType: "dashboard", provenance: "real", grounding: { dataRef: "grounded-sales", portable: true } }
  };
  const accepted = scoreGenerationCase(groundedDefinition, run, { dataContext });
  assert.equal(accepted.passed, true);

  const tampered = structuredClone(run);
  const chart = tampered.preview.workspace.document.sections.flatMap(({ components }) => components).find(({ type }) => type === "chart");
  chart.binding.valueField = "unknown-field";
  chart.props.values[0] += 1;
  const rejected = scoreGenerationCase(groundedDefinition, tampered, { dataContext });
  assert.equal(rejected.passed, false);
  assert.equal(rejected.checks.find(({ name }) => name === "grounding-fields").passed, false);
  assert.equal(rejected.checks.find(({ name }) => name === "grounding-visible-values").passed, false);
});

test("generation evaluator keeps non-portable Dashboard data online without record leakage", () => {
  const source = parseDataSource({
    id: "secure-sales",
    name: "Secure sales",
    format: "csv",
    content: "month,revenue,orders\n2026-01,120000,80\n2026-02,150000,95",
    portable: false,
    now: "2026-08-11T12:00:00.000Z"
  });
  const dataContext = createDataContext(source);
  const run = createDeterministicDraft({
    id: "secure-grounding-eval",
    prompt: "Generate a monthly sales dashboard",
    language: "en",
    pageType: "dashboard",
    dataInputs: [dataContext.input]
  }, {
    version: 2,
    theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" },
    layout: { sections: [] },
    logo: null
  }, { dataContexts: [dataContext], now: "2026-08-11T12:00:00.000Z" });
  const definition = {
    id: "secure-sales",
    mode: "draft",
    expect: { pageType: "dashboard", provenance: "real", grounding: { dataRef: "secure-sales", portable: false } }
  };
  const components = run.preview.workspace.document.sections.flatMap(({ components: items }) => items);
  assert.equal(components.every(({ type, binding }) => !["kpi", "chart", "list", "table"].includes(type) || binding), true);
  assert.equal(components.filter(({ binding }) => binding).every(({ props }) => JSON.stringify(props.refreshPolicy) === JSON.stringify({ mode: "dataset-event", pauseWhenHidden: true })), true);
  assert.deepEqual(run.preview.workspace.resources?.datasets?.["secure-sales"], { portable: false });
  assert.equal(scoreGenerationCase(definition, run, { dataContext }).passed, true);

  const leaked = structuredClone(run);
  leaked.preview.workspace.resources = { datasets: { "secure-sales": { portable: true, records: source.records } } };
  const table = leaked.preview.workspace.document.sections.flatMap(({ components: items }) => items).find(({ type }) => type === "table");
  table.props.rows[0][1] += 1;
  const rejected = scoreGenerationCase(definition, leaked, { dataContext });
  assert.equal(rejected.passed, false);
  assert.equal(rejected.checks.find(({ name }) => name === "grounding-portability").passed, false);
  assert.equal(rejected.checks.find(({ name }) => name === "grounding-visible-values").passed, false);
});
