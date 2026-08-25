import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createDataAccessPolicyService } from "../.agents/skills/dashboard-html/scripts/data-access-policy-service.mjs";
import { createDataContext, parseDataSource } from "../.agents/skills/dashboard-html/scripts/data-source-service.mjs";
import { createDeterministicDraft } from "../.agents/skills/dashboard-html/scripts/draft-generator.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createReportProjectCopy } from "../.agents/skills/dashboard-html/scripts/project-management-service.mjs";
import { appendProjectRevision, createProject } from "../.agents/skills/dashboard-html/scripts/project-store.mjs";
import { createAuditRepository } from "../.agents/skills/dashboard-html/scripts/studio-audit-repository.mjs";
import { createDataSourceRepository } from "../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";
import { createProjectRepository } from "../.agents/skills/dashboard-html/scripts/studio-project-repository.mjs";

const baseline = {
  version: 2,
  theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" },
  layout: { sections: [] },
  logo: null
};

function salesSource() {
  const source = parseDataSource({
    id: "report-sales",
    name: "报告销售数据",
    format: "csv",
    portable: false,
    content: "区域,省份,城市,收入\n华东,浙江,杭州,100\n华东,江苏,南京,200\n华南,广东,广州,900",
    now: "2026-08-23T08:00:00.000Z"
  });
  source.organizationId = "local";
  source.ownerId = "local-admin";
  source.semanticModel.hierarchies = [{ id: "geo", label: "地域", levels: source.semanticModel.dimensions.map(({ id }) => id) }];
  return source;
}

function dashboardProject(source = salesSource()) {
  const context = createDataContext(source);
  const workspace = createDeterministicDraft({
    id: "report-copy-draft",
    prompt: "生成地域销售 Dashboard，支持区域筛选、图表联动和下钻",
    language: "zh",
    pageType: "dashboard",
    dataInputs: [context.input]
  }, baseline, { dataContexts: [context], runId: "run-report-copy", now: "2026-08-23T08:01:00.000Z" }).preview.workspace;
  workspace.interactions = {
    ...workspace.interactions,
    chartSelections: { "opportunity-trend": "华东" },
    drilldowns: { "opportunity-trend": { path: ["华东", "浙江"] } },
    chartSeriesVisibility: {},
    chartZoom: { "opportunity-trend": { start: 20, end: 80 } }
  };
  const chart = workspace.document.sections.flatMap(({ components }) => components).find(({ id }) => id === "opportunity-trend");
  chart.props.zoom = { enabled: true, mode: "inside" };
  const kpi = workspace.document.sections.flatMap(({ components }) => components).find(({ id }) => id === "priority-customers");
  kpi.trendBinding = { kind: "series", categoryField: "field-2", valueField: "field-4", operation: "sum", limit: 7 };
  return appendProjectRevision(createProject({
    id: "source-dashboard",
    name: "地域销售看板",
    ownerId: "local-admin",
    organizationId: "local",
    createdAt: "2026-08-23T08:01:00.000Z"
  }), {
    id: "source-revision",
    createdAt: "2026-08-23T08:02:00.000Z",
    source: "agent",
    workspace
  });
}

function components(workspace) {
  return workspace.document.sections.flatMap(({ components: items }) => items);
}

test("generates Online Analysis Report bindings without embedding online records", () => {
  const source = salesSource();
  const context = createDataContext(source);
  const workspace = createDeterministicDraft({
    id: "online-analysis-draft",
    prompt: "生成在线销售分析报告，支持区域筛选",
    language: "zh",
    pageType: "analysis-report",
    dataInputs: [context.input]
  }, baseline, { dataContexts: [context] }).preview.workspace;
  assert.equal(workspace.theme.pageType, "analysis-report");
  assert.equal(workspace.resources.datasets[source.id].portable, false);
  assert.equal(workspace.resources.datasets[source.id].records, undefined);
  assert(components(workspace).some(({ binding, dataRef }) => binding && dataRef === source.id));
  assert(components(workspace).some(({ props }) => props.refreshPolicy?.mode === "dataset-event"));
});

test("routes an explicit Online Analysis Report prompt to the live report mode", () => {
  const workspace = createDeterministicDraft({
    id: "online-analysis-route",
    prompt: "生成一份在线分析报告，支持后续刷新",
    language: "zh",
    pageType: "auto",
    dataInputs: []
  }, baseline).preview.workspace;
  assert.equal(workspace.theme.pageType, "analysis-report");
});

test("creates an immutable Report snapshot from the current authorized Dashboard state", async () => {
  const sourceData = salesSource();
  const source = dashboardProject(sourceData);
  const before = structuredClone(source);
  const report = await createReportProjectCopy(source, {
    id: "fixed-report",
    name: "华东销售报告",
    ownerId: "report-owner",
    organizationId: "local",
    now: "2026-08-23T08:03:00.000Z",
    resolveDataset: async () => ({ ...sourceData, records: sourceData.records.filter((record) => record["field-1"] === "华东") })
  });

  assert.deepEqual(source, before);
  assert.equal(report.id, "fixed-report");
  assert.equal(report.revisions.length, 1);
  const workspace = report.revisions[0].workspace;
  assert.equal(workspace.theme.pageType, "report");
  assert.equal(workspace.document.controls, undefined);
  assert.equal(workspace.interactions, undefined);
  assert.equal(workspace.resources?.datasets, undefined);
  assert.equal(components(workspace).some(({ binding, trendBinding, dataRef }) => binding || trendBinding || dataRef), false);
  assert.equal(components(workspace).some(({ props }) => props.selection || props.drilldown || props.refreshPolicy || props.zoom), false);
  const priorityCustomers = components(workspace).find(({ id }) => id === "priority-customers");
  assert.equal(priorityCustomers.props.value, "300");
  assert.deepEqual(priorityCustomers.props.sparkline, { labels: ["浙江", "江苏"], values: [100, 200] });
  assert.deepEqual(components(workspace).find(({ id }) => id === "opportunity-trend").props, {
    chartType: "line",
    labels: ["杭州"],
    values: [100],
    empty: false
  });
  assert.deepEqual(components(workspace).find(({ id }) => id === "customer-health").props.rows, [
    ["华东", "浙江", "杭州", 100],
    ["华东", "江苏", "南京", 200]
  ]);
});

test("creates the same immutable snapshot from an Online Analysis Report", async () => {
  const sourceData = salesSource();
  const source = dashboardProject(sourceData);
  source.revisions[0].workspace.theme.pageType = "analysis-report";
  const report = await createReportProjectCopy(source, {
    id: "fixed-analysis-report",
    name: "在线分析快照",
    ownerId: "report-owner",
    organizationId: "local",
    resolveDataset: async () => sourceData
  });
  const workspace = report.revisions[0].workspace;
  assert.equal(workspace.theme.pageType, "report");
  assert.equal(components(workspace).some(({ binding, trendBinding, dataRef }) => binding || trendBinding || dataRef), false);
  assert.equal(workspace.resources?.datasets, undefined);
});

test("rejects non-Dashboard revisions and fails closed when an online Dataset cannot be resolved", async () => {
  const source = dashboardProject();
  const reportSource = structuredClone(source);
  reportSource.revisions[0].workspace.theme.pageType = "report";
  await assert.rejects(() => createReportProjectCopy(reportSource, { id: "nested-report", resolveDataset: async () => salesSource() }), /Only Dashboard or Online Analysis Report/);
  await assert.rejects(() => createReportProjectCopy(source, { id: "missing-data-report", resolveDataset: async () => null }), /dataset was not found/);
  await assert.rejects(() => createReportProjectCopy(source, { id: "forbidden-data-report", resolveDataset: async () => { throw new Error("row-policy-denied"); } }), /row-policy-denied/);
});

test("report-copy HTTP route reapplies row policy, records audit, rejects collisions, and preserves its source", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-report-copy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRepository = createProjectRepository({ directory: path.join(root, "projects") });
  const dataSourceRepository = createDataSourceRepository({ directory: path.join(root, "datasets") });
  const auditRepository = createAuditRepository({ directory: path.join(root, "audit") });
  const sourceData = salesSource();
  const source = dashboardProject(sourceData);
  await dataSourceRepository.put(sourceData);
  await projectRepository.update(source.id, { expectedRevisionId: null, seed: source }, (project) => project);
  const dataAccessPolicyService = createDataAccessPolicyService({ policies: [{
    id: "report-east-only",
    organizationId: "local",
    datasetId: sourceData.id,
    grants: [{ id: "local-east", actorIds: ["local-admin"], filters: [{ dimensionId: "dimension-field-1", operator: "equals", value: "华东" }] }]
  }] });
  const server = startPreviewServer({ listenPort: 0, silent: true, projectRepository, dataSourceRepository, auditRepository, dataAccessPolicyService });
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const request = (id) => fetch(`${endpoint}/api/projects/${source.id}/report-copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name: "受控华东报告" })
  });

  const response = await request("http-fixed-report");
  assert.equal(response.status, 201);
  const report = (await response.json()).project;
  assert.equal(report.revisions[0].workspace.theme.pageType, "report");
  assert.equal(components(report.revisions[0].workspace).find(({ id }) => id === "priority-customers").props.value, "300");
  assert.deepEqual(await projectRepository.get(source.id), source);
  assert.equal((await request("http-fixed-report")).status, 409);
  const events = await auditRepository.list({ organizationId: "local", projectId: "http-fixed-report" });
  assert.equal(events[0].action, "project.report-created");
  assert.deepEqual(events[0].details, { sourceProjectId: source.id, sourceRevisionId: source.currentRevisionId });
  const list = await (await fetch(`${endpoint}/api/projects`)).json();
  assert.equal(list.projects.find(({ id }) => id === source.id).pageType, "dashboard");
  assert.equal(list.projects.find(({ id }) => id === report.id).pageType, "report");
  assert.equal(JSON.stringify(list).includes("records"), false);
});
