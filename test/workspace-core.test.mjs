import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applyCommandBatch, ContractError, diffWorkspaces, materializeGenerationBundle, migrateWorkspace, validateGenerationBundle, validateWorkspace } from "../.agents/skills/dashboard-html/scripts/workspace-core.mjs";
import { acceptGenerationBundle, acceptPlan, commitGenerationPreview, createGenerationRun, prepareGenerationPreview, startPlanning } from "../.agents/skills/dashboard-html/scripts/generation-pipeline.mjs";
import { createDeterministicDraft, createDeterministicRefinement, inferChartType } from "../.agents/skills/dashboard-html/scripts/draft-generator.mjs";
import { interactionStyles, renderInteractionControls } from "../.agents/skills/dashboard-html/scripts/interaction-runtime.mjs";
import { materializeComponent, materializeWorkspaceDocument } from "../.agents/skills/dashboard-html/scripts/data-runtime.mjs";
import { appendProjectRevision, createProject, projectRevisionSummary, restoreProjectRevision, restoreProjectRevisionAsNew, undoProjectRevision } from "../.agents/skills/dashboard-html/scripts/project-store.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createProjectRepository } from "../.agents/skills/dashboard-html/scripts/studio-project-repository.mjs";
import { renderStandaloneWorkspace } from "../.agents/skills/dashboard-html/scripts/revision-exporter.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/sales-dashboard-generation.json", import.meta.url), "utf8"));
const baseline = {
  version: 2,
  theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" },
  layout: { sections: [] },
  logo: null
};

test("validates and materializes a complete generation bundle", () => {
  assert.equal(validateGenerationBundle(fixture).valid, true);
  assert.deepEqual(materializeGenerationBundle(baseline, fixture), fixture.workspace);
});

test("validates and deterministically exports every registered content component", () => {
  const components = [
    { id: "summary", type: "summary", title: "摘要", props: { body: "摘要正文" } },
    { id: "kpi", type: "kpi", title: "指标", props: { value: "42" } },
    { id: "chart", type: "chart", title: "图表", props: { chartType: "line", labels: ["一月", "二月"], values: [1, 2] } },
    { id: "table", type: "table", title: "表格", props: { columns: ["字段"], rows: [["值"]] } },
    { id: "list", type: "list", title: "列表", props: { items: [{ label: "项目", value: 1 }] } },
    { id: "text", type: "text", title: "文本", props: { body: "文本正文" } }
  ];
  const workspace = {
    ...baseline,
    document: { title: "组件能力验收", sections: [{ id: "capabilities", title: "组件", components }] },
    layout: { sections: [{ id: "capabilities", layout: "grid", items: components.map(({ id }) => ({ id, span: 6 })) }] }
  };
  assert.equal(validateWorkspace(workspace).valid, true);
  const first = renderStandaloneWorkspace(workspace);
  const second = renderStandaloneWorkspace(workspace);
  assert.equal(first, second);
  for (const { id, type } of components) {
    assert.match(first, new RegExp(`class="card component-${type}" data-component-id="${id}"`));
  }
  assert.match(first, /文本正文/);
});

test("migrates workspace v1 deterministically without mutating input", () => {
  const legacy = { version: 1, theme: { preset: "fx-orange", pageType: "report", language: "zh", accent: "#e8590c", mode: "light" }, layout: { sections: [] } };
  const migrated = migrateWorkspace(legacy);
  assert.equal(legacy.version, 1);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.theme.headerAlign, "center");
  assert.equal(migrated.theme.paletteVersion, "1.0.0");
});

test("applies local commands without changing the source workspace", () => {
  const next = applyCommandBatch(baseline, {
    batchId: "change-theme",
    source: "user",
    operations: [
      { op: "set", path: "/theme/accent", value: "#2563eb" },
      { op: "insert", path: "/layout/sections/-", value: { id: "metrics", layout: "four", items: [] } }
    ]
  });
  assert.equal(baseline.theme.accent, "#e8590c");
  assert.equal(next.theme.accent, "#2563eb");
  assert.equal(next.layout.sections.length, 1);
});

test("rejects a whole batch atomically when its result is invalid", () => {
  assert.throws(() => applyCommandBatch(baseline, {
    batchId: "invalid-page-type",
    source: "agent",
    operations: [{ op: "set", path: "/theme/pageType", value: "poster" }]
  }), ContractError);
  assert.equal(baseline.theme.pageType, "dashboard");
});

test("rejects command drift from the declared generation workspace", () => {
  const drifted = structuredClone(fixture);
  drifted.workspace.theme.accent = "#2563eb";
  assert.throws(() => materializeGenerationBundle(baseline, drifted), /do not produce/);
});

test("returns actionable paths for malformed workspaces", () => {
  const result = validateWorkspace({ version: 2, theme: {}, layout: { sections: "invalid" } });
  assert.equal(result.valid, false);
  assert(result.issues.some(({ path }) => path === "/theme/pageType"));
  assert(result.issues.some(({ path }) => path === "/layout/sections"));
});

test("runs the standard intake to committed revision lifecycle", () => {
  let run = createGenerationRun(fixture.request, { runId: "run-sales", now: "2026-08-07T00:00:00.000Z" });
  assert.equal(run.status, "normalized");
  run = startPlanning(run, { at: "2026-08-07T00:00:01.000Z" });
  run = acceptPlan(run, fixture.plan, { at: "2026-08-07T00:00:02.000Z" });
  run = acceptGenerationBundle(run, fixture, { at: "2026-08-07T00:00:03.000Z" });
  run = prepareGenerationPreview(run, baseline, { at: "2026-08-07T00:00:04.000Z" });
  assert.equal(run.status, "preview-ready");
  assert.equal(run.preview.isolated, true);
  run = commitGenerationPreview(run, { revisionId: "revision-sales-1", at: "2026-08-07T00:00:05.000Z" });
  assert.equal(run.status, "committed");
  assert.deepEqual(run.revision.workspace, fixture.workspace);
  assert.deepEqual(run.events.map(({ stage }) => stage), ["intake", "normalized", "planning", "generating", "validating", "preview-ready", "committed"]);
});

test("allows one repair and then fails without committing invalid workspace", () => {
  const invalid = structuredClone(fixture);
  invalid.workspace.theme.pageType = "poster";
  let run = createGenerationRun(fixture.request, { runId: "run-invalid", now: "2026-08-07T00:00:00.000Z" });
  run = startPlanning(run);
  run = acceptPlan(run, fixture.plan);
  run = acceptGenerationBundle(run, invalid);
  run = prepareGenerationPreview(run, baseline);
  assert.equal(run.status, "repairing");
  assert.equal(run.repairAttempts, 1);
  run = acceptGenerationBundle(run, invalid);
  run = prepareGenerationPreview(run, baseline);
  assert.equal(run.status, "failed");
  assert.equal(run.revision, undefined);
});

test("rejects a preview that changed after validation", () => {
  let run = createGenerationRun(fixture.request, { runId: "run-tampered", now: "2026-08-07T00:00:00.000Z" });
  run = startPlanning(run);
  run = acceptPlan(run, fixture.plan);
  run = acceptGenerationBundle(run, fixture);
  run = prepareGenerationPreview(run, baseline);
  run.preview.workspace.theme.accent = "#2563eb";
  assert.throws(() => commitGenerationPreview(run, { revisionId: "revision-tampered" }), /changed after validation/);
});

test("rejects provenance that is missing or inconsistent with planned components", () => {
  const invalid = structuredClone(fixture);
  delete invalid.provenance.components.revenue;
  invalid.provenance.mode = "real";
  const result = validateGenerationBundle(invalid);
  assert.equal(result.valid, false);
  assert(result.issues.some(({ path }) => path === "/provenance/components/revenue"));
  assert(result.issues.some(({ path }) => path === "/provenance/mode"));
});

test("creates editable first drafts from multiple natural-language domains", () => {
  const cases = [
    ["做一个销售负责人看的季度收入和商机看板", "dashboard", "销售经营看板"],
    ["生成产品运营月度复盘报告，关注活跃和留存", "report", "产品运营看板报告"],
    ["需要项目交付进度和风险监控看板", "dashboard", "项目交付看板"]
  ];
  cases.forEach(([prompt, pageType, title], index) => {
    const run = createDeterministicDraft({ id: `request-${index}`, prompt, language: "zh", pageType: "auto", dataInputs: [] }, baseline, { runId: `run-${index}`, now: "2026-08-07T00:00:00.000Z" });
    assert.equal(run.status, "preview-ready");
    assert.equal(run.preview.workspace.theme.pageType, pageType);
    assert.equal(run.preview.workspace.document.title, title);
    assert.equal(run.bundle.provenance.mode, "sample");
  });
});

test("generates a registered text component when the prompt requests explanatory copy", () => {
  const run = createDeterministicDraft({
    id: "request-text-component",
    prompt: "生成销售经营看板，并加入指标口径说明和备注",
    language: "zh",
    pageType: "dashboard",
    dataInputs: []
  }, baseline);
  const textComponent = run.preview.workspace.document.sections.flatMap(({ components }) => components).find(({ type }) => type === "text");
  assert.equal(run.status, "preview-ready");
  assert.equal(textComponent?.id, "methodology-note");
  assert.match(textComponent.props.body, /指标口径/);
  assert(run.preview.workspace.layout.sections.some(({ items }) => items.some(({ id }) => id === textComponent.id)));
  assert.equal(run.bundle.provenance.components[textComponent.id].source, "sample");
});

test("maps explicit and semantic chart requests to the controlled catalog", () => {
  const cases = [
    ["用折线图展示最近 12 个月销售额", "line"],
    ["用面积图展示累计收入变化", "area"],
    ["用柱状图对比不同渠道收入", "bar"],
    ["用条形图展示客户贡献排名", "horizontal-bar"],
    ["用环形图展示渠道销售额占比", "pie"]
  ];
  cases.forEach(([prompt, expected], index) => {
    assert.equal(inferChartType(prompt), expected);
    const run = createDeterministicDraft({ id: `request-chart-${index}`, prompt, language: "zh", pageType: "dashboard", dataInputs: [] }, baseline);
    const chart = run.preview.workspace.document.sections.flatMap(({ components }) => components).find(({ type }) => type === "chart");
    assert.equal(chart.props.chartType, expected);
    if (expected === "pie") assert.equal(run.preview.workspace.theme.cardOverrides[chart.id].chartPalette, "categorical");
  });
  assert.equal(inferChartType("展示客户留存走势"), "line");
  assert.equal(inferChartType("展示客户贡献排行"), "horizontal-bar");
  assert.equal(inferChartType("展示渠道贡献构成"), "pie");
});

test("rejects chart types outside the controlled catalog", () => {
  const invalid = structuredClone(fixture.workspace);
  const chart = invalid.document.sections.flatMap(({ components }) => components).find(({ type }) => type === "chart");
  chart.props.chartType = "radar";
  const result = validateWorkspace(invalid);
  assert.equal(result.valid, false);
  assert(result.issues.some(({ path }) => path.endsWith("/props/chartType")));
});

test("previews a scoped AI refinement as a narrow command batch and field diff", () => {
  const draft = createDeterministicDraft({ id: "request-refine-base", prompt: "生成销售趋势看板", language: "zh", pageType: "dashboard", dataInputs: [] }, baseline);
  const baseWorkspace = draft.preview.workspace;
  const original = structuredClone(baseWorkspace);
  const run = createDeterministicRefinement({
    id: "request-refine-chart",
    prompt: "改成环形图，卡片标题改为“渠道机会构成”，副标题改为“本期渠道占比”",
    language: "zh",
    scope: { kind: "component", id: "opportunity-trend" },
    dataInputs: []
  }, baseWorkspace, { runId: "run-refine-chart", now: "2026-08-10T00:00:00.000Z" });
  const chart = run.preview.workspace.document.sections.flatMap(({ components }) => components).find(({ id }) => id === "opportunity-trend");
  assert.equal(run.status, "preview-ready");
  assert.equal(chart.props.chartType, "pie");
  assert.equal(chart.title, "渠道机会构成");
  assert.equal(chart.subtitle, "本期渠道占比");
  assert(run.bundle.commands.operations.every(({ path }) => path !== "/"));
  assert(run.preview.diff.some(({ path, before, after }) => path.endsWith("/props/chartType") && before === "line" && after === "pie"));
  assert.deepEqual(baseWorkspace, original);
  assert.deepEqual(diffWorkspaces(baseWorkspace, run.preview.workspace), run.preview.diff);
});

test("rejects unsupported or missing local refinement scope", () => {
  const baseWorkspace = createDeterministicDraft({ id: "request-refine-invalid-base", prompt: "生成销售看板", language: "zh", pageType: "dashboard", dataInputs: [] }, baseline).preview.workspace;
  assert.throws(() => createDeterministicRefinement({ id: "request-refine-no-scope", prompt: "改得更好看", language: "zh", dataInputs: [] }, baseWorkspace), /component scope/);
  assert.throws(() => createDeterministicRefinement({ id: "request-refine-unsupported", prompt: "改得更好看", language: "zh", scope: { kind: "component", id: "opportunity-trend" }, dataInputs: [] }, baseWorkspace), /No supported local change/);
});

test("commits and atomically undoes an AI command batch when no later edits exist", () => {
  const baseWorkspace = createDeterministicDraft({ id: "request-undo-base", prompt: "生成销售趋势看板", language: "zh", pageType: "dashboard", dataInputs: [] }, baseline).preview.workspace;
  const preview = createDeterministicRefinement({ id: "request-undo-refine", prompt: "改成柱状图", language: "zh", scope: { kind: "component", id: "opportunity-trend" }, dataInputs: [] }, baseWorkspace);
  const committed = commitGenerationPreview(preview, { revisionId: "revision-refine", at: "2026-08-10T00:00:01.000Z" });
  const project = appendProjectRevision(createProject({ id: "project-refine", name: "局部修改" }), committed.revision);
  assert(committed.revision.inverseCommands.operations.length > 0);
  assert(committed.revision.inverseCommands.operations.every(({ path }) => path !== "/"));
  const undone = undoProjectRevision(project, {
    revisionId: "revision-refine",
    currentWorkspace: committed.revision.workspace,
    undoRevisionId: "revision-refine-undo",
    at: "2026-08-10T00:00:02.000Z"
  });
  assert.deepEqual(undone.workspace, baseWorkspace);
  assert.equal(undone.project.currentRevisionId, "revision-refine-undo");
  const drifted = structuredClone(committed.revision.workspace);
  drifted.theme.accent = "#2563eb";
  assert.throws(() => undoProjectRevision(project, { revisionId: "revision-refine", currentWorkspace: drifted, undoRevisionId: "revision-drift" }), /changed after/);
});

test("applies card structure and layout refinements as reversible narrow commands", () => {
  const baseWorkspace = createDeterministicDraft({
    id: "request-structure-base",
    prompt: "生成销售趋势看板，支持区域筛选",
    language: "zh",
    pageType: "dashboard",
    dataInputs: []
  }, baseline).preview.workspace;
  const scope = { kind: "component", id: "opportunity-trend" };
  const cases = [
    ["复制当前卡片", (workspace) => {
      const copy = workspace.document.sections[2].components.find(({ id }) => id.startsWith("opportunity-trend-copy"));
      assert(copy);
      assert.equal(workspace.layout.sections[2].items.some(({ id }) => id === copy.id), true);
      assert.equal(workspace.document.controls[0].props.targets.includes(copy.id), true);
    }],
    ["新增一张同类卡片，标题改为“渠道质量趋势”", (workspace) => {
      assert(workspace.document.sections[2].components.some(({ id, title }) => id.startsWith("opportunity-trend-new") && title === "渠道质量趋势"));
    }],
    ["改为半宽", (workspace) => assert.equal(workspace.layout.sections[2].items[0].span, 6)],
    ["向后移动", (workspace) => assert.equal(workspace.document.sections[2].components[1].id, "opportunity-trend")],
    ["删除当前卡片", (workspace) => {
      assert.equal(workspace.document.sections[2].components.some(({ id }) => id === "opportunity-trend"), false);
      assert.equal(workspace.layout.sections[2].items.some(({ id }) => id === "opportunity-trend"), false);
      assert.equal(workspace.document.controls[0].props.targets.includes("opportunity-trend"), false);
    }]
  ];
  cases.forEach(([prompt, assertCandidate], index) => {
    const run = createDeterministicRefinement({ id: `request-structure-${index}`, prompt, language: "zh", scope, dataInputs: [] }, baseWorkspace);
    assert(run.bundle.commands.operations.every(({ path }) => path !== "/"));
    assertCandidate(run.preview.workspace);
    const committed = commitGenerationPreview(run, { revisionId: `revision-structure-${index}` });
    assert(committed.revision.inverseCommands.operations.every(({ path }) => path !== "/"));
    const project = appendProjectRevision(createProject({ id: `project-structure-${index}`, name: prompt }), committed.revision);
    const undone = undoProjectRevision(project, {
      revisionId: committed.revision.id,
      currentWorkspace: committed.revision.workspace,
      undoRevisionId: `revision-structure-${index}-undo`
    });
    assert.deepEqual(undone.workspace, baseWorkspace);
  });
});

test("applies section-scoped refinements as reversible narrow commands", () => {
  const baseWorkspace = createDeterministicDraft({
    id: "request-section-base",
    prompt: "生成销售趋势看板，支持区域筛选和视图切换",
    language: "zh",
    pageType: "dashboard",
    dataInputs: []
  }, baseline).preview.workspace;
  const scope = { kind: "section", id: "trends" };
  const cases = [
    ["标题改为“转化分析”", (workspace) => assert.equal(workspace.document.sections.find(({ id }) => id === "trends").title, "转化分析")],
    ["副标题改为“最近 12 个月”", (workspace) => assert.equal(workspace.document.sections.find(({ id }) => id === "trends").subtitle, "最近 12 个月")],
    ["向前移动分区", (workspace) => {
      assert.equal(workspace.document.sections[1].id, "trends");
      assert.equal(workspace.layout.sections[1].id, "trends");
    }],
    ["新增一个分区，标题改为“转化说明”", (workspace) => {
      const added = workspace.document.sections.find(({ id }) => id.startsWith("ai-section"));
      assert(added);
      assert.equal(added.title, "转化说明");
      assert.equal(added.components[0].type, "text");
      assert(workspace.layout.sections.some(({ id }) => id === added.id));
    }],
    ["删除当前分区", (workspace) => {
      assert.equal(workspace.document.sections.some(({ id }) => id === "trends"), false);
      assert.equal(workspace.layout.sections.some(({ id }) => id === "trends"), false);
      assert.equal(JSON.stringify(workspace.document.controls || []).includes("trends"), false);
      assert.equal(JSON.stringify(workspace.document.controls || []).includes("opportunity-trend"), false);
    }]
  ];
  cases.forEach(([prompt, assertCandidate], index) => {
    const run = createDeterministicRefinement({ id: `request-section-${index}`, prompt, language: "zh", scope, dataInputs: [] }, baseWorkspace);
    assert(run.bundle.commands.operations.every(({ path }) => path !== "/"));
    assertCandidate(run.preview.workspace);
    const committed = commitGenerationPreview(run, { revisionId: `revision-section-${index}` });
    const project = appendProjectRevision(createProject({ id: `project-section-${index}`, name: prompt }), committed.revision);
    const undone = undoProjectRevision(project, {
      revisionId: committed.revision.id,
      currentWorkspace: committed.revision.workspace,
      undoRevisionId: `revision-section-${index}-undo`
    });
    assert.deepEqual(undone.workspace, baseWorkspace);
  });
});

test("rejects missing, invalid, or terminal section refinement targets", () => {
  const baseWorkspace = createDeterministicDraft({ id: "request-section-invalid", prompt: "生成销售看板", language: "zh", pageType: "dashboard", dataInputs: [] }, baseline).preview.workspace;
  assert.throws(() => createDeterministicRefinement({ id: "missing-scope", prompt: "改标题", language: "zh", dataInputs: [] }, baseWorkspace), /section or component scope/);
  assert.throws(() => createDeterministicRefinement({ id: "missing-section", prompt: "改标题", language: "zh", scope: { kind: "section", id: "missing" }, dataInputs: [] }, baseWorkspace), /not found/);
  assert.throws(() => createDeterministicRefinement({ id: "first-section", prompt: "向前移动分区", language: "zh", scope: { kind: "section", id: "summary" }, dataInputs: [] }, baseWorkspace), /cannot move farther/);
  const singleSection = structuredClone(baseWorkspace);
  singleSection.document.sections = [singleSection.document.sections[0]];
  singleSection.layout.sections = [singleSection.layout.sections[0]];
  singleSection.layout.canvasOrder = ["summary-card"];
  delete singleSection.document.controls;
  delete singleSection.interactions;
  assert.throws(() => createDeterministicRefinement({ id: "last-section", prompt: "删除当前分区", language: "zh", scope: { kind: "section", id: "summary" }, dataInputs: [] }, singleSection), /last section/);
});

test("preserves explicit data identity and marks it as real", () => {
  const run = createDeterministicDraft({
    id: "request-real",
    prompt: "生成销售看板",
    language: "zh",
    pageType: "dashboard",
    dataInputs: [{ id: "crm-q3", kind: "uploaded", name: "Q3 CRM 导出" }]
  }, baseline, { runId: "run-real", now: "2026-08-07T00:00:00.000Z" });
  assert.equal(run.status, "preview-ready");
  assert.equal(run.bundle.provenance.mode, "real");
  assert.equal(run.preview.workspace.document.sections[1].components[0].dataRef, "crm-q3");
});

test("extracts a requested title without Chinese quote characters", () => {
  const run = createDeterministicDraft({
    id: "request-custom-title",
    prompt: "生成项目交付看板，名称为“交付指挥台”。",
    language: "zh",
    pageType: "dashboard",
    dataInputs: []
  }, baseline, { runId: "run-custom-title", now: "2026-08-07T00:00:00.000Z" });
  assert.equal(run.preview.workspace.document.title, "交付指挥台");
});

test("rejects registered components with missing render props", () => {
  const invalid = structuredClone(fixture.workspace);
  delete invalid.document.sections[0].components[0].props.value;
  const result = validateWorkspace(invalid);
  assert.equal(result.valid, false);
  assert(result.issues.some(({ path }) => path.endsWith("/props/value")));
});

test("validates page-level filters and view tabs with serializable state", () => {
  const workspace = structuredClone(fixture.workspace);
  workspace.document.controls = [
    {
      id: "sales-filters",
      type: "filter-bar",
      props: {
        controls: [{ id: "region", label: "区域", control: "select", field: "region", options: [{ value: "", label: "全部区域" }, { value: "east", label: "华东" }], defaultValue: "" }],
        targets: ["metrics", "revenue", "opportunity-trend"],
        surface: "card"
      }
    },
    {
      id: "sales-views",
      type: "view-tabs",
      props: { items: [{ id: "overview", label: "概览", sectionIds: ["metrics"] }, { id: "details", label: "明细", sectionIds: ["trends"] }], defaultValue: "overview" }
    }
  ];
  workspace.interactions = { filters: { region: "east" }, activeView: "details" };
  assert.equal(validateWorkspace(workspace).valid, true);
  assert.deepEqual(JSON.parse(JSON.stringify(workspace.interactions)), workspace.interactions);
  const html = renderInteractionControls(workspace);
  assert.match(html, /data-dashboard-filter="region"/);
  assert.match(html, /value="east" selected/);
  assert.match(html, /data-dashboard-view="details"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(interactionStyles, /var\(--accent/);
});

test("rejects unknown interaction targets, defaults, and persisted values", () => {
  const workspace = structuredClone(fixture.workspace);
  workspace.document.controls = [{
    id: "sales-filters",
    type: "filter-bar",
    props: {
      controls: [{ id: "region", label: "区域", control: "select", field: "region", options: [{ value: "east", label: "华东" }], defaultValue: "missing" }],
      targets: ["unknown-card"]
    }
  }];
  workspace.interactions = { filters: { region: "north" } };
  const result = validateWorkspace(workspace);
  assert.equal(result.valid, false);
  assert(result.issues.some(({ path }) => path.endsWith("/defaultValue")));
  assert(result.issues.some(({ path, code }) => path.endsWith("/targets") && code === "reference"));
  assert(result.issues.some(({ path }) => path === "/interactions/filters/region"));
});

test("generates interaction controls only when natural language asks for them", () => {
  const interactive = createDeterministicDraft({
    id: "request-interactive",
    prompt: "生成销售看板，支持按年份和区域筛选，并可切换概览和明细视图",
    language: "zh",
    pageType: "dashboard",
    dataInputs: []
  }, baseline, { runId: "run-interactive", now: "2026-08-08T00:00:00.000Z" });
  assert.equal(interactive.status, "preview-ready");
  assert.deepEqual(interactive.preview.workspace.document.controls.map(({ type }) => type), ["filter-bar", "view-tabs"]);
  assert.deepEqual(Object.keys(interactive.preview.workspace.interactions.filters), ["year", "region"]);
  assert.equal(interactive.preview.workspace.interactions.activeView, "overview");

  const simple = createDeterministicDraft({ id: "request-simple", prompt: "生成销售看板", language: "zh", pageType: "dashboard", dataInputs: [] }, baseline);
  assert.equal(simple.preview.workspace.document.controls, undefined);
  assert.equal(simple.preview.workspace.interactions, undefined);
});

test("one filter state deterministically updates KPI, chart, table, and rankings", () => {
  const run = createDeterministicDraft({
    id: "request-linked-data",
    prompt: "生成销售看板，支持按区域筛选",
    language: "zh",
    pageType: "dashboard",
    dataInputs: []
  }, baseline, { runId: "run-linked-data", now: "2026-08-08T00:00:00.000Z" });
  const workspace = run.preview.workspace;
  const allKpi = materializeComponent(workspace, "opportunity-value");
  const allChart = materializeComponent(workspace, "opportunity-trend");
  const allTable = materializeComponent(workspace, "customer-health");
  const allRanking = materializeComponent(workspace, "source-ranking");
  workspace.interactions.filters.region = "east";
  const eastKpi = materializeComponent(workspace, "opportunity-value");
  const eastChart = materializeComponent(workspace, "opportunity-trend");
  const eastTable = materializeComponent(workspace, "customer-health");
  const eastRanking = materializeComponent(workspace, "source-ranking");
  assert.notEqual(eastKpi.props.value, allKpi.props.value);
  assert(eastChart.props.values.reduce((sum, value) => sum + value, 0) < allChart.props.values.reduce((sum, value) => sum + value, 0));
  assert(eastTable.props.rows.length < allTable.props.rows.length);
  assert(eastRanking.props.items.reduce((sum, item) => sum + item.value, 0) < allRanking.props.items.reduce((sum, item) => sum + item.value, 0));
  assert.equal(materializeWorkspaceDocument(workspace).sections[1].components[1].props.value, eastKpi.props.value);
});

test("rejects bound components that reference missing datasets or fields", () => {
  const run = createDeterministicDraft({ id: "request-binding", prompt: "生成销售看板，支持区域筛选", language: "zh", pageType: "dashboard", dataInputs: [] }, baseline);
  const missingField = structuredClone(run.preview.workspace);
  missingField.document.sections[1].components[0].binding.field = "missingValue";
  let result = validateWorkspace(missingField);
  assert.equal(result.valid, false);
  assert(result.issues.some(({ code, message }) => code === "reference" && message.includes("missingValue")));
  const missingDataset = structuredClone(run.preview.workspace);
  missingDataset.document.sections[1].components[0].dataRef = "unknown-data";
  result = validateWorkspace(missingDataset);
  assert.equal(result.valid, false);
  assert(result.issues.some(({ path, code }) => path.endsWith("/dataRef") && code === "reference"));
  const missingFilterField = structuredClone(run.preview.workspace);
  missingFilterField.document.controls[0].props.controls[0].field = "missingRegion";
  result = validateWorkspace(missingFilterField);
  assert.equal(result.valid, false);
  assert(result.issues.some(({ path, message }) => path.endsWith("/field") && message.includes("missingRegion")));
  const missingPortablePolicy = structuredClone(run.preview.workspace);
  delete missingPortablePolicy.resources.datasets[Object.keys(missingPortablePolicy.resources.datasets)[0]].portable;
  result = validateWorkspace(missingPortablePolicy);
  assert.equal(result.valid, false);
  assert(result.issues.some(({ path }) => path.startsWith("/resources/datasets/")));
});

test("stores immutable project revisions and restores a selected workspace", () => {
  const project = createProject({ id: "project-sales", name: "销售经营", createdAt: "2026-08-07T00:00:00.000Z" });
  const first = appendProjectRevision(project, {
    id: "revision-1",
    createdAt: "2026-08-07T00:00:01.000Z",
    source: "agent",
    requestId: fixture.request.id,
    batchId: fixture.commands.batchId,
    workspace: fixture.workspace
  });
  const editedWorkspace = structuredClone(fixture.workspace);
  editedWorkspace.theme.accent = "#2563eb";
  const second = appendProjectRevision(first, { id: "revision-2", createdAt: "2026-08-07T00:00:02.000Z", source: "user", workspace: editedWorkspace });
  assert.equal(project.revisions.length, 0);
  assert.equal(first.revisions.length, 1);
  assert.equal(second.currentRevisionId, "revision-2");
  assert.equal(restoreProjectRevision(second, "revision-1").theme.accent, fixture.workspace.theme.accent);
  assert.deepEqual(projectRevisionSummary(second).map(({ id }) => id), ["revision-1", "revision-2"]);
  assert.throws(() => appendProjectRevision(second, second.revisions[0]), /already exists/);
});

test("restores project history by appending a new revision and protects manual drift", () => {
  const project = createProject({ id: "project-history", name: "版本历史", createdAt: "2026-08-11T00:00:00.000Z" });
  const first = appendProjectRevision(project, {
    id: "history-1",
    createdAt: "2026-08-11T00:00:01.000Z",
    source: "agent",
    summary: "生成首稿",
    workspace: fixture.workspace
  });
  const edited = structuredClone(fixture.workspace);
  edited.document.title = "第二版标题";
  const second = appendProjectRevision(first, {
    id: "history-2",
    createdAt: "2026-08-11T00:00:02.000Z",
    source: "agent",
    parentRevisionId: "history-1",
    summary: "修改标题",
    workspace: edited
  });
  const restored = restoreProjectRevisionAsNew(second, {
    revisionId: "history-1",
    currentWorkspace: edited,
    restoreRevisionId: "history-3",
    at: "2026-08-11T00:00:03.000Z"
  });
  assert.equal(restored.workspace.document.title, fixture.workspace.document.title);
  assert.equal(restored.revision.parentRevisionId, "history-2");
  assert.equal(restored.project.revisions.length, 3);
  assert.equal(restored.project.currentRevisionId, "history-3");
  const drifted = structuredClone(edited);
  drifted.theme.accent = "#2563eb";
  assert.throws(() => restoreProjectRevisionAsNew(second, { revisionId: "history-1", currentWorkspace: drifted, restoreRevisionId: "history-drift" }), /changed after/);
});

test("treats JSONB key reordering as the same workspace during undo", () => {
  const workspace = structuredClone(fixture.workspace);
  const reorderKeys = (value) => Array.isArray(value)
    ? value.map(reorderKeys)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorderKeys(item)]))
      : value;
  const reordered = reorderKeys(workspace);
  const project = appendProjectRevision(createProject({ id: "project-jsonb-order", name: "JSONB order" }), {
    id: "revision-jsonb-order",
    createdAt: "2026-08-10T12:00:00.000Z",
    source: "agent",
    workspace,
    inverseCommands: {
      batchId: "batch-jsonb-undo",
      source: "system",
      operations: []
    }
  });
  assert.doesNotThrow(() => undoProjectRevision(project, {
    revisionId: project.currentRevisionId,
    currentWorkspace: reordered,
    undoRevisionId: "revision-jsonb-undo",
    at: "2026-08-10T12:00:01.000Z"
  }));
});

test("persists interaction state and portable datasets through project revisions", () => {
  const run = createDeterministicDraft({
    id: "request-persisted-interactions",
    prompt: "生成销售看板，支持区域筛选和视图切换",
    language: "zh",
    pageType: "dashboard",
    dataInputs: []
  }, baseline, { runId: "run-persisted-interactions", now: "2026-08-08T00:00:00.000Z" });
  const workspace = structuredClone(run.preview.workspace);
  workspace.interactions.filters.region = "south";
  workspace.interactions.activeView = "details";
  const project = appendProjectRevision(createProject({ id: "project-interactions", name: "交互看板" }), {
    id: "revision-interactions",
    createdAt: "2026-08-08T00:00:01.000Z",
    source: "agent",
    workspace
  });
  const restored = restoreProjectRevision(project, "revision-interactions");
  assert.deepEqual(restored.interactions, { filters: { region: "south" }, activeView: "details" });
  assert.equal(restored.resources.datasets["primary-data"].portable, true);
  assert.equal(materializeComponent(restored, "opportunity-value").props.value, "1,250 万");
});

test("serves draft, structural refine, history restore, commit, and undo over HTTP", async (t) => {
  const projectDirectory = await mkdtemp(path.join(tmpdir(), "dashboard-project-http-"));
  const projectRepository = createProjectRepository({ directory: projectDirectory });
  const server = startPreviewServer({ listenPort: 0, silent: true, projectRepository });
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(projectDirectory, { recursive: true, force: true });
  });
  const { port } = server.address();
  const endpoint = `http://127.0.0.1:${port}`;

  const healthResponse = await fetch(`${endpoint}/api/generation/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), {
    status: "ok",
    provider: "organization-profiles",
    mode: "remote",
    configured: true,
    generationVersion: 1,
    workspaceVersion: 2
  });

  const chartCatalogResponse = await fetch(`${endpoint}/api/charts/catalog?q=${encodeURIComponent("占比")}`);
  assert.equal(chartCatalogResponse.status, 200);
  assert.deepEqual((await chartCatalogResponse.json()).charts.map(({ type }) => type), ["pie"]);

  const capabilityResponse = await fetch(`${endpoint}/api/components/catalog`);
  assert.equal(capabilityResponse.status, 200);
  const capabilities = await capabilityResponse.json();
  assert.equal(capabilities.version, 1);
  assert.deepEqual(capabilities.components.map(({ type }) => type), ["summary", "kpi", "chart", "table", "list", "text"]);
  assert.deepEqual(capabilities.controls.map(({ type }) => type), ["filter-bar", "view-tabs"]);
  assert.deepEqual(capabilities.charts.map(({ type }) => type), ["line", "area", "bar", "horizontal-bar", "pie"]);

  const horizontalCatalogResponse = await fetch(`${endpoint}/api/charts/catalog?q=${encodeURIComponent("横向排行")}`);
  assert.equal(horizontalCatalogResponse.status, 200);
  assert.deepEqual((await horizontalCatalogResponse.json()).charts.map(({ type }) => type), ["horizontal-bar"]);

  for (const type of ["line", "area", "bar", "horizontal-bar", "pie"]) {
    const chartResponse = await fetch(`${endpoint}/api/charts/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, labels: ["一月", "二月", "三月"], series: [{ name: "收入", values: [18, 26, 31] }], mode: "dark", width: 480, height: 240 })
    });
    assert.equal(chartResponse.status, 200);
    assert.match((await chartResponse.json()).svg, /^<svg[^>]+>/);
  }

  const draftResponse = await fetch(`${endpoint}/api/generation/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request: { id: "http-sales", prompt: "生成销售收入和客户健康看板", language: "zh", pageType: "auto", dataInputs: [] },
      baseWorkspace: baseline
    })
  });
  assert.equal(draftResponse.status, 200);
  const { run } = await draftResponse.json();
  assert.equal(run.status, "preview-ready");

  const commitResponse = await fetch(`${endpoint}/api/generation/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run, revisionId: "revision-http-sales" })
  });
  assert.equal(commitResponse.status, 200);
  const committed = await commitResponse.json();
  assert.equal(committed.run.status, "committed");
  assert.equal(committed.project.currentRevisionId, "revision-http-sales");
  const storedProjectResponse = await fetch(`${endpoint}/api/projects/${committed.project.id}`);
  assert.equal(storedProjectResponse.status, 200);
  assert.equal((await storedProjectResponse.json()).project.currentRevisionId, "revision-http-sales");

  const exportResponse = await fetch(`${endpoint}/api/projects/${committed.project.id}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revisionId: "revision-http-sales" })
  });
  assert.equal(exportResponse.status, 200);
  assert.equal(exportResponse.headers.get("x-dashboard-revision"), "revision-http-sales");
  assert.match(exportResponse.headers.get("etag"), /^"sha256-[0-9a-f]{64}"$/);
  const exportedHtml = await exportResponse.text();
  assert.match(exportedHtml, /^<!DOCTYPE html>/);
  assert.match(exportedHtml, /销售经营看板/);
  assert.doesNotMatch(exportedHtml, /ai-composer|design-drawer|provider-gateway/);

  const legacyProject = structuredClone(committed.project);
  legacyProject.id = "project-http-legacy";
  const migrateResponse = await fetch(`${endpoint}/api/projects/${legacyProject.id}/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: legacyProject })
  });
  assert.equal(migrateResponse.status, 201);
  assert.equal((await migrateResponse.json()).project.currentRevisionId, "revision-http-sales");
  const repeatedMigration = await fetch(`${endpoint}/api/projects/${legacyProject.id}/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: legacyProject })
  });
  assert.equal(repeatedMigration.status, 409);

  const manualProjectId = "project-http-manual";
  const manualWorkspace = structuredClone(committed.revision.workspace);
  manualWorkspace.interactions = { filters: {} };
  const manualRevisionResponse = await fetch(`${endpoint}/api/projects/${manualProjectId}/revisions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace: manualWorkspace,
      revisionId: "revision-http-manual-1",
      expectedRevisionId: null,
      projectName: "手工项目",
      summary: "创建手工项目"
    })
  });
  assert.equal(manualRevisionResponse.status, 201);
  const manualCommitted = await manualRevisionResponse.json();
  assert.equal(manualCommitted.project.currentRevisionId, "revision-http-manual-1");
  assert.equal(manualCommitted.revision.source, "user");
  const staleManualResponse = await fetch(`${endpoint}/api/projects/${manualProjectId}/revisions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace: manualWorkspace, revisionId: "revision-http-manual-stale", expectedRevisionId: null })
  });
  assert.equal(staleManualResponse.status, 409);

  const staleCommitResponse = await fetch(`${endpoint}/api/generation/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run, revisionId: "revision-http-stale", projectId: committed.project.id, expectedRevisionId: null })
  });
  assert.equal(staleCommitResponse.status, 409);

  const refineResponse = await fetch(`${endpoint}/api/generation/refine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request: { id: "http-refine", prompt: "改成环形图，卡片标题改为“渠道构成”", language: "zh", scope: { kind: "component", id: "opportunity-trend" }, dataInputs: [] },
      baseWorkspace: committed.revision.workspace
    })
  });
  assert.equal(refineResponse.status, 200);
  const refinedPreview = await refineResponse.json();
  assert.equal(refinedPreview.run.request.scope.id, "opportunity-trend");
  assert(refinedPreview.run.preview.diff.some(({ path }) => path.endsWith("/props/chartType")));
  const refineCommitResponse = await fetch(`${endpoint}/api/generation/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run: refinedPreview.run, revisionId: "revision-http-refine", project: committed.project })
  });
  assert.equal(refineCommitResponse.status, 200);
  const refinedCommit = await refineCommitResponse.json();
  assert.equal(refinedCommit.revision.parentRevisionId, "revision-http-sales");
  const undoResponse = await fetch(`${endpoint}/api/generation/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: refinedCommit.project, revisionId: "revision-http-refine", currentWorkspace: refinedCommit.revision.workspace, undoRevisionId: "revision-http-refine-undo" })
  });
  assert.equal(undoResponse.status, 200);
  const undone = await undoResponse.json();
  assert.deepEqual(undone.workspace, committed.revision.workspace);
  assert.equal(undone.project.currentRevisionId, "revision-http-refine-undo");

  const historyResponse = await fetch(`${endpoint}/api/generation/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: undone.project })
  });
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.equal(history.currentRevisionId, "revision-http-refine-undo");
  assert.deepEqual(history.revisions.map(({ id }) => id), ["revision-http-sales", "revision-http-refine", "revision-http-refine-undo"]);

  const restoreResponse = await fetch(`${endpoint}/api/generation/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project: undone.project,
      revisionId: "revision-http-refine",
      currentWorkspace: undone.workspace,
      restoreRevisionId: "revision-http-history-restore"
    })
  });
  assert.equal(restoreResponse.status, 200);
  const historyRestored = await restoreResponse.json();
  assert.deepEqual(historyRestored.workspace, refinedCommit.revision.workspace);
  assert.equal(historyRestored.revision.parentRevisionId, "revision-http-refine-undo");

  const tampered = structuredClone(run);
  tampered.preview.workspace.theme.accent = "#2563eb";
  const tamperedResponse = await fetch(`${endpoint}/api/generation/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run: tampered, revisionId: "revision-tampered" })
  });
  assert.equal(tamperedResponse.status, 422);
  assert.match((await tamperedResponse.json()).error, /changed after validation/);

  const malformedResponse = await fetch(`${endpoint}/api/generation/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  });
  assert.equal(malformedResponse.status, 400);

  const missingResponse = await fetch(`${endpoint}/missing-preview-file.html`);
  assert.equal(missingResponse.status, 404);
});
