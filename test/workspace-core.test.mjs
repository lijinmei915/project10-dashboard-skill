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
import { createProviderFromEnv } from "../.agents/skills/dashboard-html/scripts/provider-gateway.mjs";

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

test("exports a zero-value gauge as standalone SVG without a legend or chart runtime", () => {
  const gauge = { id: "completion-gauge", type: "chart", title: "目标完成率", props: { chartType: "gauge", labels: ["完成率"], series: [{ name: "目标完成率", values: [0] }, { name: "忽略系列", values: [88] }], gauge: { min: 0, max: 100, unit: "%", precision: 1, thresholds: [60, 85] } } };
  const workspace = {
    ...baseline,
    document: { title: "仪表盘验收", sections: [{ id: "metrics", title: "指标", components: [gauge] }] },
    layout: { sections: [{ id: "metrics", layout: "grid", items: [{ id: gauge.id, span: 6 }] }] }
  };
  const html = renderStandaloneWorkspace(workspace);
  assert.match(html, /0\.0%/);
  assert.match(html, /data-component-id="completion-gauge"[\s\S]*?<svg class="chart"/);
  assert.doesNotMatch(html, /class="chart-legend"/);
  assert.doesNotMatch(html, /echarts|\/api\/charts\/render/);
});

test("validates controlled KPI trend data and bindings", () => {
  const kpi = {
    id: "revenue-kpi", type: "kpi", title: "收入", dataRef: "sales",
    binding: { kind: "aggregate", field: "revenue", operation: "sum" },
    trendBinding: { kind: "series", categoryField: "period", valueField: "revenue", operation: "sum", limit: 7 },
    props: { value: "300", sparkline: { labels: ["一月", "二月"], values: [100, 200], unit: "元" } }
  };
  const workspace = {
    ...baseline,
    document: { title: "趋势合同", sections: [{ id: "metrics", title: "指标", components: [kpi] }] },
    layout: { sections: [{ id: "metrics", layout: "grid", items: [{ id: kpi.id, span: 12 }] }] },
    resources: { datasets: { sales: { portable: true, records: [{ period: "一月", revenue: 100 }, { period: "二月", revenue: 200 }] } } }
  };
  assert.equal(validateWorkspace(workspace).valid, true);

  const malformedSparkline = structuredClone(workspace);
  malformedSparkline.document.sections[0].components[0].props.sparkline.values = [100];
  assert(validateWorkspace(malformedSparkline).issues.some(({ path }) => path.endsWith("/props/sparkline")));

  const missingTrendField = structuredClone(workspace);
  missingTrendField.document.sections[0].components[0].trendBinding.categoryField = "missing-period";
  assert(validateWorkspace(missingTrendField).issues.some(({ path, code }) => path.endsWith("/trendBinding") && code === "reference"));

  const chartWithTrend = structuredClone(workspace);
  chartWithTrend.document.sections[0].components[0].type = "chart";
  assert(validateWorkspace(chartWithTrend).issues.some(({ path }) => path.endsWith("/trendBinding")));
});

test("exports KPI history as static SVG without a client chart runtime", () => {
  const kpi = { id: "revenue-kpi", type: "kpi", title: "收入", props: { value: "300", sparkline: { labels: ["一月", "二月", "三月"], values: [100, 180, 160], unit: "元" } } };
  const workspace = {
    ...baseline,
    theme: { ...baseline.theme, pageType: "report", kpiSparklineDisplay: "show", kpiSparklinePoints: 7, kpiSparklineStyle: "area" },
    document: { title: "指标趋势报告", sections: [{ id: "metrics", title: "指标", components: [kpi] }] },
    layout: { sections: [{ id: "metrics", layout: "grid", items: [{ id: kpi.id, span: 12 }] }] }
  };
  const html = renderStandaloneWorkspace(workspace);
  assert.match(html, /<svg class="kpi-sparkline-static"/);
  assert.match(html, /<linearGradient id="kpi-sparkline-fill-revenue-kpi"/);
  assert.match(html, /class="kpi-sparkline-area-shape" d="M [^"]* Q [^"]* L 176 57 L 4 57 Z"/);
  assert.match(html, /class="kpi-sparkline-line-shape" d="M [^"]* Q /);
  assert.doesNotMatch(html, /kpi-sparkline-runtime|vendor\/echarts|echarts\.init/);
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
    ["用时序图展示服务器监控趋势和阈值", "time-series"],
    ["用面积图展示累计收入变化", "area"],
    ["用柱状图对比不同渠道收入", "bar"],
    ["用分组柱图比较各区域今年和去年收入", "grouped-bar"],
    ["用堆叠柱图展示各渠道总量与构成", "stacked-bar"],
    ["用百分比堆叠柱图比较各区域品类占比", "percent-stacked-bar"],
    ["用直方图展示订单金额分布", "histogram"],
    ["用基础条图展示各产品收入", "horizontal-bar"],
    ["用分组条图比较各部门今年和去年成本", "grouped-horizontal-bar"],
    ["用堆叠条图展示各团队工作量构成", "stacked-horizontal-bar"],
    ["用百分比堆叠条图比较各渠道品类占比", "percent-stacked-horizontal-bar"],
    ["用双向条图比较各年龄段男女用户", "diverging-bar"],
    ["用排名图展示客户贡献 Top 10", "ranking-bar"],
    ["用甘特图展示项目排期", "gantt"],
    ["用饼图展示渠道销售额占比", "sector-pie"],
    ["用环图展示渠道销售额占比", "pie"],
    ["用玫瑰图展示品类规模", "rose"],
    ["用子弹图比较实际收入和目标收入", "bullet"],
    ["用仪表盘展示目标完成率", "gauge"],
    ["用雷达图展示团队能力画像", "radar"],
    ["用漏斗图展示销售转化路径", "funnel"],
    ["用数据表展示区域明细", "data-table"]
  ];
  cases.forEach(([prompt, expected], index) => {
    assert.equal(inferChartType(prompt), expected);
    const run = createDeterministicDraft({ id: `request-chart-${index}`, prompt, language: "zh", pageType: "dashboard", dataInputs: [] }, baseline);
    const chart = run.preview.workspace.document.sections.flatMap(({ components }) => components).find(({ type }) => type === "chart");
    assert.equal(chart.props.chartType, expected);
    if (expected === "pie") assert.equal(run.preview.workspace.theme.cardOverrides[chart.id].chartPalette, "categorical");
  });
  assert.equal(inferChartType("展示客户留存走势"), "line");
  assert.equal(inferChartType("展示客户贡献排行"), "ranking-bar");
  assert.equal(inferChartType("展示渠道贡献构成"), "pie");
});

test("rejects chart types outside the controlled catalog", () => {
  const invalid = structuredClone(fixture.workspace);
  const chart = invalid.document.sections.flatMap(({ components }) => components).find(({ type }) => type === "chart");
  chart.props.chartType = "scatter";
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

test("places an explicitly chart-scoped filter in the chart header", () => {
  const run = createDeterministicDraft({
    id: "request-chart-filter",
    prompt: "生成销售看板，这个图表右上角增加区域筛选，只控制当前图表",
    language: "zh",
    pageType: "dashboard",
    dataInputs: []
  }, baseline, { runId: "run-chart-filter", now: "2026-08-08T00:00:00.000Z" });
  const filter = run.preview.workspace.document.controls.find(({ type }) => type === "filter-bar");
  assert.deepEqual(filter.props.targets, ["opportunity-trend"]);
  assert.deepEqual(filter.props.placement, { kind: "component-header", targetId: "opportunity-trend" });
  assert.equal(validateWorkspace(run.preview.workspace).valid, true);
});

test("validates persisted chart legend visibility state", () => {
  const workspace = structuredClone(fixture.workspace);
  workspace.interactions = { filters: {}, chartSeriesVisibility: { "opportunity-trend": { 收入: false } } };
  assert.equal(validateWorkspace(workspace).valid, true);
  workspace.interactions.chartSeriesVisibility.unknown = { 收入: true };
  const result = validateWorkspace(workspace);
  assert.equal(result.valid, false);
  assert(result.issues.some(({ path }) => path === "/interactions/chartSeriesVisibility/unknown"));
});

test("generates and validates controlled chart selection state", () => {
  const run = createDeterministicDraft({
    id: "request-cross-filter",
    prompt: "生成销售看板，点击趋势图后整页图表联动",
    language: "zh",
    pageType: "dashboard",
    dataInputs: []
  }, baseline, { runId: "run-cross-filter", now: "2026-08-23T00:00:00.000Z" });
  const workspace = run.preview.workspace;
  const chart = workspace.document.sections.flatMap(({ components }) => components).find(({ type }) => type === "chart");
  assert.deepEqual(chart.props.selection, { enabled: true, targetScope: "page" });
  workspace.interactions = { chartSelections: { [chart.id]: chart.props.labels[0] } };
  assert.equal(validateWorkspace(workspace).valid, true);
  workspace.interactions.chartSelections.unknown = "华东";
  const result = validateWorkspace(workspace);
  assert.equal(result.valid, false);
  assert(result.issues.some(({ path }) => path === "/interactions/chartSelections/unknown"));
});

test("validates bounded refresh policies only on bound components", () => {
  const workspace = structuredClone(createDeterministicDraft({
    id: "request-refresh-policy", prompt: "生成销售看板", language: "zh", pageType: "dashboard", dataInputs: []
  }, baseline).preview.workspace);
  const component = workspace.document.sections.flatMap(({ components }) => components).find(({ binding }) => binding);
  component.props.refreshPolicy = { mode: "poll", intervalMs: 30_000, pauseWhenHidden: true };
  assert.equal(validateWorkspace(workspace).valid, true);
  component.props.refreshPolicy.intervalMs = 100;
  let result = validateWorkspace(workspace);
  assert.equal(result.valid, false);
  assert(result.issues.some(({ path }) => path.endsWith("/props/refreshPolicy")));
  component.props.refreshPolicy = { mode: "dataset-event", intervalMs: 30_000, pauseWhenHidden: true };
  result = validateWorkspace(workspace);
  assert.equal(result.valid, false);
  assert(result.issues.some(({ path }) => path.endsWith("/props/refreshPolicy")));
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
  assert(allKpi.props.sparkline.values.length >= 2);
  assert(eastKpi.props.sparkline.values.reduce((sum, value) => sum + value, 0) < allKpi.props.sparkline.values.reduce((sum, value) => sum + value, 0));
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
  const server = startPreviewServer({ listenPort: 0, silent: true, projectRepository, provider: createProviderFromEnv({}) });
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
    provider: "deterministic-local",
    mode: "deterministic",
    configured: true,
    generationVersion: 1,
    workspaceVersion: 2
  });

  const chartCatalogResponse = await fetch(`${endpoint}/api/charts/catalog?q=${encodeURIComponent("占比")}`);
  assert.equal(chartCatalogResponse.status, 200);
  const chartCatalogPayload = await chartCatalogResponse.json();
  assert.deepEqual(chartCatalogPayload.charts.map(({ type }) => type), ["percent-stacked-bar", "sector-pie"]);
  assert.deepEqual(chartCatalogPayload.palette, {
    version: "1.2.0",
    categorical: ["#5b8ff9", "#45b8d8", "#43c59e", "#96bf45", "#f3a83b", "#f06b72", "#de72b4", "#9270e8"]
  });

  const capabilityResponse = await fetch(`${endpoint}/api/components/catalog`);
  assert.equal(capabilityResponse.status, 200);
  const capabilities = await capabilityResponse.json();
  assert.equal(capabilities.version, 1);
  assert.deepEqual(capabilities.components.map(({ type }) => type), ["summary", "kpi", "chart", "table", "list", "text"]);
  assert.deepEqual(capabilities.controls.map(({ type }) => type), ["filter-bar", "view-tabs"]);
  assert.deepEqual(capabilities.charts.map(({ type }) => type), ["line", "combo-bar-line", "time-series", "area", "bar", "grouped-bar", "stacked-bar", "percent-stacked-bar", "histogram", "horizontal-bar", "grouped-horizontal-bar", "stacked-horizontal-bar", "percent-stacked-horizontal-bar", "diverging-bar", "ranking-bar", "gantt", "sector-pie", "pie", "rose", "bullet", "gauge", "radar", "funnel", "data-table"]);

  const horizontalCatalogResponse = await fetch(`${endpoint}/api/charts/catalog?q=${encodeURIComponent("排行图")}`);
  assert.equal(horizontalCatalogResponse.status, 200);
  assert((await horizontalCatalogResponse.json()).charts.some(({ type }) => type === "ranking-bar"));

  for (const type of ["line", "combo-bar-line", "time-series", "area", "bar", "grouped-bar", "stacked-bar", "percent-stacked-bar", "histogram", "horizontal-bar", "grouped-horizontal-bar", "stacked-horizontal-bar", "percent-stacked-horizontal-bar", "diverging-bar", "ranking-bar", "gantt", "sector-pie", "pie", "rose", "bullet", "gauge", "radar", "funnel", "data-table"]) {
    const chartResponse = await fetch(`${endpoint}/api/charts/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, labels: type === "time-series" ? ["2026-01-01", "2026-02-01", "2026-03-01"] : type === "gauge" ? ["完成率"] : ["一月", "二月", "三月"], series: type === "histogram" ? [{ name: "订单金额", values: [18, 26, 31, 22, 19, 35, 28] }] : type === "gauge" ? [{ name: "目标完成率", values: [76.8] }] : [{ name: "今年", values: [18, 26, 31] }, { name: "去年", values: [14, 21, 25] }], thresholds: type === "time-series" ? [20, 30] : [], gauge: type === "gauge" ? { min: 0, max: 100, unit: "%", precision: 1, thresholds: [60, 85] } : {}, bullet: type === "bullet" ? { min: 0, max: 120, unit: "%", precision: 0, ranges: [60, 85, 100] } : {}, mode: "dark", width: 480, height: 240 })
    });
    assert.equal(chartResponse.status, 200);
    assert.match((await chartResponse.json()).svg, /^<svg[^>]+>/);
  }

  const tableResponse = await fetch(`${endpoint}/api/charts/render`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "data-table", labels: ["华南", "华东", "西部"], series: [{ name: "收入", values: [96, 128, 71] }], table: { sort: "desc", sortBy: 0, limit: 2, summary: true, formats: [{ prefix: "¥", suffix: "万" }], conditional: true }, width: 480, height: 240 })
  });
  const tableSvg = (await tableResponse.json()).svg;
  assert.equal(tableResponse.status, 200);
  assert(tableSvg.indexOf("华东") < tableSvg.indexOf("华南"));
  assert(!tableSvg.includes("西部"));
  assert.match(tableSvg, /¥128万/);
  assert.match(tableSvg, /合计/);

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
