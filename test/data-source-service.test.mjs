import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createDataContext, executeDataSourceQuery, markDataSourceRefreshFailed, parseDataSource, parseUploadedDataSource, refreshUploadedDataSource, updateDataSourceSchema } from "../.agents/skills/dashboard-html/scripts/data-source-service.mjs";
import { createSemanticQueryCache } from "../.agents/skills/dashboard-html/scripts/semantic-query-cache.mjs";
import { createDataSourceRepository } from "../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";
import { createProjectRepository } from "../.agents/skills/dashboard-html/scripts/studio-project-repository.mjs";
import { createJobRepository } from "../.agents/skills/dashboard-html/scripts/studio-job-repository.mjs";
import { createRefreshScheduleRepository } from "../.agents/skills/dashboard-html/scripts/studio-refresh-schedule-repository.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createProviderFromEnv } from "../.agents/skills/dashboard-html/scripts/provider-gateway.mjs";
import { createXlsxFixture } from "./fixtures/xlsx-fixture.mjs";

const csv = `月份,区域,收入,转化率,备注\n2026-01,华东,"1,200",0.31,"重点, 跟进"\n2026-02,华南,1500,0.35,\n2026-03,华东,1800,0.39,稳定`;
const baseline = { version: 2, theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" }, layout: { sections: [] }, logo: null };

test("parses quoted CSV, infers fields, profiles quality, and creates a bounded context", () => {
  const source = parseDataSource({ id: "sales-csv", name: "销售明细", format: "csv", content: csv, portable: true, now: "2026-08-10T03:00:00.000Z" });
  assert.equal(source.rowCount, 3);
  assert.equal(source.columnCount, 5);
  const revenue = source.fields.find(({ label }) => label === "收入");
  assert.equal(revenue.type, "number");
  assert.equal(source.records[0][revenue.id], 1200);
  assert(source.quality.issues.some(({ code }) => code === "missing-values"));
  const context = createDataContext(source);
  assert.equal(context.context.sampleRecords.length, 3);
  assert.equal(context.context.querySnapshots.totals.rows[0][0], 4500);
  assert.equal(context.portableDataset.records.length, 3);
  assert(!JSON.stringify(context).includes("credential"));
});

test("imports the first valid HTML table without executing embedded content", () => {
  const html = `<!doctype html><html><body><script>throw new Error("must not run")</script><table><tr><th>月份</th><th>收入</th></tr><tr><td>2026-01</td><td><b>1,200</b><script>ignored()</script></td></tr><tr><td>2026-02</td><td>1800</td></tr></table></body></html>`;
  const source = parseDataSource({ id: "sales-html", name: "HTML 销售表", format: "html", content: html, now: "2026-08-18T00:00:00.000Z" });
  assert.equal(source.rowCount, 2);
  assert.equal(source.contentKind, "table");
  assert.deepEqual(source.fields.map(({ label }) => label), ["月份", "收入"]);
  assert.equal(source.records[0][source.fields[1].id], 1200);
  assert(!JSON.stringify(source.records).includes("ignored"));
});

test("imports a generic HTML page as semantic content for restyling", () => {
  const html = `<!doctype html><html><head><title>销售经营简报</title><style>.card{color:red}</style></head><body><script>steal()</script><main><h1>销售经营简报</h1><section><h2>核心指标</h2><p>本月收入 1,200 万元，目标完成率 92%。</p><ul><li>华东区域增长最快</li><li>关注回款风险</li></ul></section></main></body></html>`;
  const source = parseDataSource({ id: "sales-page", name: "销售经营简报", format: "html", content: html, now: "2026-08-18T00:00:00.000Z" });
  assert.equal(source.contentKind, "page");
  assert(source.rowCount >= 4);
  assert.deepEqual(source.fields.map(({ label }) => label), ["内容类型", "分区", "内容"]);
  const serialized = JSON.stringify(source.records);
  assert(serialized.includes("本月收入"));
  assert(!serialized.includes("steal"));
  assert(!serialized.includes("color:red"));
  const context = createDataContext(source);
  assert.equal(context.context.contentKind, "page");
});

test("rejects invalid JSON rows and oversized inputs", () => {
  assert.throws(() => parseDataSource({ name: "bad", format: "json", content: "[1,2]" }), /每一行必须是对象/);
  assert.throws(() => parseDataSource({ name: "large", format: "csv", content: `a\n${"x".repeat(2 * 1024 * 1024)}` }), /不能超过 2 MB/);
});

test("imports Excel, selects the first non-empty data sheet, and preserves available sheets", async () => {
  const workbook = createXlsxFixture();
  const source = await parseUploadedDataSource({ id: "sales-xlsx", name: "销售工作簿", format: "xlsx", contentBase64: Buffer.from(workbook).toString("base64"), portable: false, now: "2026-08-10T03:00:00.000Z" });
  assert.equal(source.sheetName, "销售数据");
  assert.deepEqual(source.availableSheets, ["说明", "销售数据"]);
  assert.equal(source.rowCount, 2);
  assert.deepEqual(source.fields.map(({ label }) => label), ["月份", "收入", "收入 2"]);
  assert.equal(source.fields[1].type, "number");
  assert.equal(source.records[1][source.fields[1].id], 1800);
  await assert.rejects(() => parseUploadedDataSource({ name: "损坏文件", format: "xlsx", contentBase64: Buffer.from("not-xlsx").toString("base64") }), /无法解析/);
});

test("corrects field types from raw values and builds a versioned semantic model", () => {
  const source = parseDataSource({ id: "codes", name: "编码数据", format: "json", content: JSON.stringify([{ code: "001", rate: "0.25", month: "2026-01" }, { code: "002", rate: "0.5", month: "2026-02" }]), now: "2026-08-10T03:00:00.000Z" });
  assert.equal(source.records[0].code, 1);
  const corrected = updateDataSourceSchema(source, { fieldTypes: { code: "string" }, now: "2026-08-10T03:01:00.000Z" });
  assert.equal(corrected.records[0].code, "001");
  assert(corrected.semanticModel.dimensions.some(({ fieldId }) => fieldId === "code"));
  const rate = corrected.semanticModel.metrics.find(({ fieldId }) => fieldId === "rate");
  assert.equal(rate.aggregation, "average");
  assert.equal(rate.format.multiplier, 100);
  assert.equal(rate.format.suffix, "%");
  assert.equal(corrected.semanticModel.version, 2);
});

test("executes bounded semantic queries without accepting physical field names", () => {
  const source = parseDataSource({ id: "query-sales", name: "销售查询", format: "csv", content: csv, now: "2026-08-10T03:00:00.000Z" });
  const region = source.semanticModel.dimensions.find(({ label }) => label === "区域");
  const revenue = source.semanticModel.metrics.find(({ label }) => label === "收入");
  const totals = executeDataSourceQuery(source, { metrics: [revenue.id] });
  assert.equal(totals.rows[0][0], 4500);
  assert.equal(totals.semanticVersion, 1);
  assert.equal(totals.datasetFingerprint, source.fingerprint);
  const grouped = executeDataSourceQuery(source, { dimensions: [region.id], metrics: [revenue.id], filters: [{ dimensionId: region.id, operator: "in", value: ["华东"] }] });
  assert.deepEqual(grouped.rows, [["华东", 3000]]);
  assert.equal(grouped.sourceRowCount, 2);
  assert.throws(() => executeDataSourceQuery(source, { metrics: [revenue.fieldId] }), /指标 .* 不存在/);
});

test("refreshes uploaded data without changing semantic identity and preserves last good data on failure", async () => {
  const source = parseDataSource({ id: "refresh-sales", name: "刷新销售", format: "csv", content: csv, now: "2026-08-10T03:00:00.000Z" });
  const refreshed = await refreshUploadedDataSource(source, { content: "月份,区域,收入,转化率,备注\n2026-04,华东,2200,0.42,新增", now: "2026-08-10T03:10:00.000Z" });
  assert.equal(refreshed.createdAt, source.createdAt);
  assert.equal(refreshed.semanticModel.version, source.semanticModel.version);
  assert.notEqual(refreshed.fingerprint, source.fingerprint);
  assert.equal(refreshed.refresh.status, "ready");
  await assert.rejects(() => refreshUploadedDataSource(refreshed, { content: "月份,区域\n2026-05,华南", now: "2026-08-10T03:20:00.000Z" }), /不存在/);
  const failed = markDataSourceRefreshFailed(refreshed, new Error("测试失败"), { now: "2026-08-10T03:20:00.000Z" });
  assert.equal(failed.fingerprint, refreshed.fingerprint);
  assert.deepEqual(failed.records, refreshed.records);
  assert.equal(failed.updatedAt, refreshed.updatedAt);
  assert.equal(failed.refresh.status, "failed");
});

test("caches semantic queries by dataset fingerprint and semantic version", async () => {
  let now = 0;
  const cache = createSemanticQueryCache({ ttlMs: 1000, maxEntries: 2, clock: () => now });
  const source = parseDataSource({ id: "cache-sales", name: "缓存销售", format: "csv", content: csv, now: "2026-08-10T03:00:00.000Z" });
  const metric = source.semanticModel.metrics.find(({ label }) => label === "收入");
  assert.equal((await cache.execute(source, { metrics: [metric.id] })).cache.status, "miss");
  assert.equal((await cache.execute(source, { metrics: [metric.id] })).cache.status, "hit");
  now = 1001;
  assert.equal((await cache.execute(source, { metrics: [metric.id] })).cache.status, "miss");
  const changed = { ...source, fingerprint: `${source.fingerprint}-changed` };
  assert.equal((await cache.execute(changed, { metrics: [metric.id] })).cache.status, "miss");
});

test("persists imported data and generates a portable bound workspace through the API", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "dashboard-data-source-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataSourceRepository = createDataSourceRepository({ directory: path.join(directory, "datasets") });
  const projectRepository = createProjectRepository({ directory: path.join(directory, "projects") });
  const jobRepository = createJobRepository({ directory: path.join(directory, "jobs") });
  const refreshScheduleRepository = createRefreshScheduleRepository({ directory: path.join(directory, "schedules") });
  const provider = createProviderFromEnv({ DASHBOARD_AI_PROVIDER: "deterministic" });
  const server = startPreviewServer({ listenPort: 0, silent: true, provider, dataSourceRepository, projectRepository, jobRepository, refreshScheduleRepository });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const endpoint = `http://127.0.0.1:${address.port}`;

  const importedResponse = await fetch(`${endpoint}/api/data-sources/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "sales-api", name: "销售数据", format: "csv", content: csv, portable: true }) });
  assert.equal(importedResponse.status, 201);
  const imported = await importedResponse.json();
  assert.equal(imported.dataSource.records.length, 3);
  assert.equal((await dataSourceRepository.get("sales-api")).records.length, 3);

  const workbook = createXlsxFixture();
  const excelResponse = await fetch(`${endpoint}/api/data-sources/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "sales-excel-api", name: "销售工作簿", format: "xlsx", contentBase64: Buffer.from(workbook).toString("base64"), sheetName: "销售数据", portable: false }) });
  assert.equal(excelResponse.status, 201);
  const excel = (await excelResponse.json()).dataSource;
  assert.equal(excel.sheetName, "销售数据");
  assert.deepEqual(excel.availableSheets, ["说明", "销售数据"]);
  assert.equal(excel.rowCount, 2);

  const storedForQuery = await dataSourceRepository.get("sales-api");
  const revenueMetric = storedForQuery.semanticModel.metrics.find(({ label }) => label === "收入");
  const queryResponse = await fetch(`${endpoint}/api/data-sources/sales-api/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metrics: [revenueMetric.id] }) });
  assert.equal(queryResponse.status, 200);
  const queryResult = (await queryResponse.json()).result;
  assert.equal(queryResult.rows[0][0], 4500);
  assert.equal(queryResult.datasetFingerprint, storedForQuery.fingerprint);
  const cachedQueryResponse = await fetch(`${endpoint}/api/data-sources/sales-api/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metrics: [revenueMetric.id] }) });
  assert.equal((await cachedQueryResponse.json()).cache.status, "hit");

  const refreshResponse = await fetch(`${endpoint}/api/data-sources/sales-api/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: storedForQuery.updatedAt, content: "月份,区域,收入,转化率,备注\n2026-04,华东,2200,0.42,新增" }) });
  assert.equal(refreshResponse.status, 200);
  const refreshedSource = (await refreshResponse.json()).dataSource;
  assert.equal(refreshedSource.refresh.status, "ready");
  assert.notEqual(refreshedSource.fingerprint, storedForQuery.fingerprint);
  const refreshedQuery = await fetch(`${endpoint}/api/data-sources/sales-api/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metrics: [revenueMetric.id] }) });
  const refreshedQueryPayload = await refreshedQuery.json();
  assert.equal(refreshedQueryPayload.cache.status, "miss");
  assert.equal(refreshedQueryPayload.result.rows[0][0], 2200);

  const failedRefresh = await fetch(`${endpoint}/api/data-sources/sales-api/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: refreshedSource.updatedAt, content: "月份,区域\n2026-05,华南" }) });
  assert.equal(failedRefresh.status, 422);
  const afterFailure = await dataSourceRepository.get("sales-api");
  assert.equal(afterFailure.refresh.status, "failed");
  assert.equal(afterFailure.fingerprint, refreshedSource.fingerprint);
  assert.equal(afterFailure.records[0][revenueMetric.fieldId], 2200);

  const nonPortableDraftResponse = await fetch(`${endpoint}/api/generation/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: { id: "excel-data-draft", prompt: "根据销售工作簿生成经营看板", language: "zh", pageType: "dashboard", dataInputs: [{ id: "sales-excel-api", kind: "uploaded", name: "销售工作簿" }] }, baseWorkspace: baseline }) });
  assert.equal(nonPortableDraftResponse.status, 200);
  const nonPortableWorkspace = (await nonPortableDraftResponse.json()).run.preview.workspace;
  const nonPortableComponents = nonPortableWorkspace.document.sections.flatMap(({ components }) => components);
  assert.equal(nonPortableWorkspace.resources?.datasets, undefined);
  assert.equal(nonPortableComponents.find(({ id }) => id === "priority-customers").props.value, "3,000");
  assert.equal(nonPortableComponents.find(({ id }) => id === "opportunity-trend").props.labels.length, 2);
  assert.equal(nonPortableComponents.some(({ binding }) => binding), false);

  const draftResponse = await fetch(`${endpoint}/api/generation/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: { id: "data-draft", prompt: "生成销售数据看板", language: "zh", pageType: "dashboard", dataInputs: [{ id: "sales-api", kind: "uploaded", name: "客户端伪造名称" }] }, baseWorkspace: baseline }) });
  assert.equal(draftResponse.status, 200);
  const { run } = await draftResponse.json();
  assert.equal(run.status, "preview-ready");
  assert.equal(run.bundle.request.dataInputs[0].name, "销售数据");
  assert.equal(run.preview.workspace.resources.datasets["sales-api"].portable, true);
  assert.equal(run.preview.workspace.resources.datasets["sales-api"].records.length, 1);
  const components = run.preview.workspace.document.sections.flatMap(({ components: items }) => items);
  assert(components.some(({ binding }) => binding?.kind === "aggregate"));
  assert(components.some(({ binding }) => binding?.kind === "series"));

  const commitResponse = await fetch(`${endpoint}/api/generation/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run, revisionId: "revision-data-refresh-stability" }) });
  assert.equal(commitResponse.status, 200);
  const committedProject = (await commitResponse.json()).project;
  const committedRevision = committedProject.revisions.find(({ id }) => id === committedProject.currentRevisionId);
  const projectIdentity = {
    currentRevisionId: committedProject.currentRevisionId,
    revisionCount: committedProject.revisions.length,
    componentIds: committedRevision.workspace.document.sections.flatMap(({ components: items }) => items.map(({ id }) => id)),
    document: committedRevision.workspace.document,
    layout: committedRevision.workspace.layout
  };
  const sourceBeforeProjectRefresh = await dataSourceRepository.get("sales-api");
  const projectRefreshResponse = await fetch(`${endpoint}/api/data-sources/sales-api/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: sourceBeforeProjectRefresh.updatedAt, content: "月份,区域,收入,转化率,备注\n2026-06,华北,3100,0.48,计划刷新" }) });
  assert.equal(projectRefreshResponse.status, 200);
  const projectAfterRefresh = (await (await fetch(`${endpoint}/api/projects/${committedProject.id}`)).json()).project;
  const revisionAfterRefresh = projectAfterRefresh.revisions.find(({ id }) => id === projectAfterRefresh.currentRevisionId);
  assert.deepEqual({
    currentRevisionId: projectAfterRefresh.currentRevisionId,
    revisionCount: projectAfterRefresh.revisions.length,
    componentIds: revisionAfterRefresh.workspace.document.sections.flatMap(({ components: items }) => items.map(({ id }) => id)),
    document: revisionAfterRefresh.workspace.document,
    layout: revisionAfterRefresh.workspace.layout
  }, projectIdentity);

  const stored = await dataSourceRepository.get("sales-api");
  const schemaResponse = await fetch(`${endpoint}/api/data-sources/sales-api/schema`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: stored.updatedAt, fieldTypes: { "field-2": "string" }, semanticModel: { dimensions: [{ fieldId: "field-1", timeGrain: "month" }, { fieldId: "field-2" }], metrics: [{ fieldId: "field-3", aggregation: "max" }, { fieldId: "field-4", aggregation: "average" }] } }) });
  assert.equal(schemaResponse.status, 200);
  const configured = (await schemaResponse.json()).dataSource;
  assert.equal(configured.semanticModel.metrics[0].aggregation, "max");
  assert.equal(configured.semanticModel.dimensions[0].timeGrain, "month");
  const staleResponse = await fetch(`${endpoint}/api/data-sources/sales-api/schema`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: stored.updatedAt, fieldTypes: {} }) });
  assert.equal(staleResponse.status, 409);
});
