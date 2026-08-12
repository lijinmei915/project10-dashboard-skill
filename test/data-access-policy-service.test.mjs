import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createDataAccessPolicyService } from "../.agents/skills/dashboard-html/scripts/data-access-policy-service.mjs";
import { executeDataSourceQuery, parseDataSource, refreshUploadedDataSource } from "../.agents/skills/dashboard-html/scripts/data-source-service.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createSemanticQueryCache } from "../.agents/skills/dashboard-html/scripts/semantic-query-cache.mjs";
import { createStudioAuthService } from "../.agents/skills/dashboard-html/scripts/studio-auth-service.mjs";
import { createDataSourceRepository } from "../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";
import { createJobRepository } from "../.agents/skills/dashboard-html/scripts/studio-job-repository.mjs";
import { createProjectRepository } from "../.agents/skills/dashboard-html/scripts/studio-project-repository.mjs";
import { createRefreshScheduleRepository } from "../.agents/skills/dashboard-html/scripts/studio-refresh-schedule-repository.mjs";

const csv = "区域,收入\n华东,1000\n华南,2000\n华东,3000";
const dimensionId = "dimension-field-1";
const baseline = { version: 2, theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" }, layout: { sections: [] }, logo: null };

function policyService() {
  return createDataAccessPolicyService({ policies: [{
    id: "sales-region-policy",
    organizationId: "org-a",
    datasetId: "sales-secure",
    grants: [
      { id: "east", actorIds: ["east-user"], filters: [{ dimensionId, operator: "equals", value: "华东" }] },
      { id: "admin", actorIds: ["admin-a"], filters: [{ dimensionId, operator: "in", value: ["华东", "华南"] }] }
    ]
  }] });
}

test("data row policies scope records and isolate semantic cache entries", async () => {
  const source = parseDataSource({ id: "sales-secure", name: "受控销售", format: "csv", content: csv });
  source.organizationId = "org-a";
  source.ownerId = "admin-a";
  const service = policyService();
  const east = service.scope(source, { id: "east-user", role: "viewer", organizationId: "org-a", organizationRole: "member" });
  assert.equal(east.access.mode, "row-policy");
  assert.equal(east.source.rowCount, 2);
  const metric = source.semanticModel.metrics[0];
  assert.equal(executeDataSourceQuery(east.source, { metrics: [metric.id] }).rows[0][0], 4000);
  assert.throws(() => service.scope(source, { id: "unmapped", role: "viewer", organizationId: "org-a", organizationRole: "member" }), /forbidden/);
  assert.throws(() => service.scope(source, { id: "other", role: "admin", organizationId: "org-b", organizationRole: "admin" }), /not found/);

  const cache = createSemanticQueryCache();
  assert.equal((await cache.execute(east.source, { metrics: [metric.id] }, { scopeKey: east.access.scopeKey })).cache.status, "miss");
  assert.equal((await cache.execute(east.source, { metrics: [metric.id] }, { scopeKey: east.access.scopeKey })).cache.status, "hit");
  assert.notEqual(east.access.scopeKey, service.scope(source, { id: "admin-a", role: "admin", organizationId: "org-a", organizationRole: "admin" }).access.scopeKey);
  const refreshed = await refreshUploadedDataSource(source, { content: "区域,收入\n华东,5000" });
  assert.equal(refreshed.organizationId, "org-a");
  assert.equal(refreshed.ownerId, "admin-a");
});

test("HTTP data access hides other organizations and grounds AI only on authorized rows", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "dashboard-row-policy-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const users = [
    { id: "admin-a", name: "Admin A", role: "admin", organizationId: "org-a", token: "token-admin-a" },
    { id: "east-user", name: "East User", role: "editor", organizationId: "org-a", token: "token-east" },
    { id: "admin-b", name: "Admin B", role: "admin", organizationId: "org-b", token: "token-admin-b" }
  ];
  const authService = createStudioAuthService({ mode: "token", users });
  const dataSourceRepository = createDataSourceRepository({ directory: path.join(directory, "datasets") });
  const server = startPreviewServer({
    listenPort: 0,
    silent: true,
    authService,
    dataAccessPolicyService: policyService(),
    dataSourceRepository,
    projectRepository: createProjectRepository({ directory: path.join(directory, "projects") }),
    jobRepository: createJobRepository({ directory: path.join(directory, "jobs") }),
    refreshScheduleRepository: createRefreshScheduleRepository({ directory: path.join(directory, "schedules") })
  });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const login = async (token) => {
    const response = await fetch(`${endpoint}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: endpoint }, body: JSON.stringify({ token }) });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  };
  const adminA = await login("token-admin-a");
  const east = await login("token-east");
  const adminB = await login("token-admin-b");
  const request = (url, { cookie, method = "GET", body } = {}) => fetch(`${endpoint}${url}`, {
    method,
    headers: { Cookie: cookie, ...(method === "GET" ? {} : { Origin: endpoint }), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const imported = await request("/api/data-sources/import", { cookie: adminA, method: "POST", body: { id: "sales-secure", name: "受控销售", format: "csv", content: csv, portable: true, organizationId: "org-b" } });
  assert.equal(imported.status, 201);
  const stored = await dataSourceRepository.get("sales-secure");
  assert.equal(stored.organizationId, "org-a");
  assert.equal(stored.ownerId, "admin-a");

  assert.deepEqual((await (await request("/api/data-sources", { cookie: adminB })).json()).dataSources, []);
  assert.equal((await request("/api/data-sources/sales-secure/preview", { cookie: adminB })).status, 404);
  assert.equal((await request("/api/data-sources/sales-secure/query", { cookie: adminB, method: "POST", body: { metrics: [stored.semanticModel.metrics[0].id] } })).status, 404);
  assert.equal((await request("/api/data-sources/import", { cookie: adminB, method: "POST", body: { id: "sales-secure", name: "覆盖尝试", format: "csv", content: "区域,收入\n华北,9999" } })).status, 404);

  const preview = await (await request("/api/data-sources/sales-secure/preview", { cookie: east })).json();
  assert.equal(preview.dataSource.rowCount, 2);
  assert(preview.dataSource.records.every((record) => record["field-1"] === "华东"));
  const query = await (await request("/api/data-sources/sales-secure/query", { cookie: east, method: "POST", body: { metrics: [stored.semanticModel.metrics[0].id] } })).json();
  assert.equal(query.result.rows[0][0], 4000);

  const generated = await request("/api/generation/jobs", { cookie: east, method: "POST", body: { mode: "draft", request: { id: "row-policy-generation", prompt: "根据授权销售数据生成经营看板", language: "zh", pageType: "dashboard", dataInputs: [{ id: "sales-secure", kind: "uploaded", name: "伪造名称" }] }, baseWorkspace: baseline } });
  assert.equal(generated.status, 202);
  const jobId = (await generated.json()).job.id;
  let job;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    job = (await (await request(`/api/generation/jobs/${jobId}`, { cookie: east })).json()).job;
    if (["succeeded", "failed"].includes(job.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(job.status, "succeeded");
  const workspace = job.run.preview.workspace;
  assert.equal(workspace.resources.datasets["sales-secure"].records.length, 2);
  assert(workspace.resources.datasets["sales-secure"].records.every((record) => record["field-1"] === "华东"));
});
