import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createPostgresConnectorService } from "../.agents/skills/dashboard-html/scripts/postgres-connector-service.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createDataSourceRepository } from "../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";
import { createJobRepository } from "../.agents/skills/dashboard-html/scripts/studio-job-repository.mjs";
import { createRefreshScheduleRepository } from "../.agents/skills/dashboard-html/scripts/studio-refresh-schedule-repository.mjs";

const connectors = {
  "sales-readonly": { connectionStringEnv: "SALES_ANALYTICS_DATABASE_URL", query: "SELECT region, revenue FROM dashboard_sales" }
};

async function waitFor(read, predicate, timeoutMs = 2_000) {
  const started = Date.now();
  let current;
  while (Date.now() - started < timeoutMs) {
    current = await read();
    if (predicate(current)) return current;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out: ${JSON.stringify(current)}`);
}

test("uses deployment-owned readonly PostgreSQL queries without persisting connection strings", async () => {
  let revenue = 1200;
  const service = createPostgresConnectorService({
    connectors,
    queryImpl: async (entry) => {
      assert.equal(entry.id, "sales-readonly");
      assert.equal(entry.query, "SELECT region, revenue FROM dashboard_sales");
      return [{ region: "east", revenue }, { region: "west", revenue: 800 }];
    }
  });
  const source = await service.create({ id: "postgres-sales", name: "数据库销售", connector: { type: "postgres", connectionRef: "sales-readonly" } });
  assert.equal(source.kind, "postgres");
  assert.equal(source.rowCount, 2);
  assert.deepEqual(source.connector, { type: "postgres", connectionRef: "sales-readonly", queryFingerprint: source.connector.queryFingerprint });
  assert.doesNotMatch(JSON.stringify(source), /DATABASE_URL|dashboard_sales/);
  revenue = 2600;
  const refreshed = await service.refresh(source);
  assert.equal(refreshed.records[0].revenue, 2600);
  assert.equal(refreshed.semanticModel.version, source.semanticModel.version);
  assert.throws(() => createPostgresConnectorService({ connectors: { unsafe: { connectionStringEnv: "DB_URL", query: "DELETE FROM sales" } } }), /只读 SELECT/);
  assert.throws(() => createPostgresConnectorService({ connectors: { unsafe: { connectionStringEnv: "DB_URL", query: "SELECT * FROM sales; DROP TABLE sales" } } }), /只读 SELECT/);
});

test("creates, refreshes, and schedules PostgreSQL datasets through the Data Source API", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-postgres-connector-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let revenue = 1200;
  const postgresConnector = createPostgresConnectorService({ connectors, queryImpl: async () => [{ region: "east", revenue }] });
  const server = startPreviewServer({
    listenPort: 0,
    silent: true,
    postgresConnector,
    dataSourceRepository: createDataSourceRepository({ directory: path.join(root, "datasets") }),
    jobRepository: createJobRepository({ directory: path.join(root, "jobs") }),
    refreshScheduleRepository: createRefreshScheduleRepository({ directory: path.join(root, "schedules") })
  });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const catalog = await (await fetch(`${endpoint}/api/data-connectors`)).json();
  assert.deepEqual(catalog.postgres.connectionRefs, ["sales-readonly"]);
  const connected = await fetch(`${endpoint}/api/data-sources/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "postgres-api", name: "数据库销售", connector: { type: "postgres", connectionRef: "sales-readonly" } }) });
  assert.equal(connected.status, 201);
  const source = (await connected.json()).dataSource;
  assert.equal(source.kind, "postgres");
  revenue = 2600;
  const refresh = await fetch(`${endpoint}/api/data-sources/postgres-api/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: source.updatedAt }) });
  assert.equal(refresh.status, 200);
  const refreshed = (await refresh.json()).dataSource;
  assert.equal(refreshed.records[0].revenue, 2600);
  const queued = await fetch(`${endpoint}/api/data-sources/postgres-api/refresh-jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "postgres-refresh", maxAttempts: 2 }) });
  assert.equal(queued.status, 202);
  const job = await waitFor(async () => (await (await fetch(`${endpoint}/api/jobs/postgres-refresh`)).json()).job, ({ status }) => status === "succeeded");
  assert.equal(job.status, "succeeded");
  const schedule = await fetch(`${endpoint}/api/data-sources/postgres-api/refresh-schedule`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intervalMinutes: 60 }) });
  assert.equal(schedule.status, 200);
  const disabled = await fetch(`${endpoint}/api/refresh-schedules/schedule-postgres-api/disable`, { method: "POST" });
  assert.equal(disabled.status, 200);
});
