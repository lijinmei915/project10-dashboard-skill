import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresConnectorService } from "../.agents/skills/dashboard-html/scripts/postgres-connector-service.mjs";
import { runPostgresConnectorSmoke } from "../.agents/skills/dashboard-html/scripts/postgres-connector-smoke.mjs";

const env = {
  DASHBOARD_POSTGRES_CONNECTORS_JSON: JSON.stringify({
    "sales-readonly": { connectionStringEnv: "SALES_DATABASE_URL", query: "SELECT region, revenue FROM sales_rollup" }
  }),
  SALES_DATABASE_URL: "postgresql://server-only:secret@db.example.test/sales"
};

test("PostgreSQL connector smoke requires explicit configuration", async () => {
  await assert.rejects(() => runPostgresConnectorSmoke({}), /DASHBOARD_POSTGRES_CONNECTORS_JSON/);
  await assert.rejects(() => runPostgresConnectorSmoke({ DASHBOARD_POSTGRES_CONNECTORS_JSON: env.DASHBOARD_POSTGRES_CONNECTORS_JSON }), /SALES_DATABASE_URL/);
  await assert.rejects(() => runPostgresConnectorSmoke({ ...env, DASHBOARD_POSTGRES_SMOKE_CONNECTION_REF: "missing" }), /not a configured connection reference/);
  const multiple = {
    ...env,
    DASHBOARD_POSTGRES_CONNECTORS_JSON: JSON.stringify({
      "sales-readonly": { connectionStringEnv: "SALES_DATABASE_URL", query: "SELECT region FROM sales" },
      "finance-readonly": { connectionStringEnv: "FINANCE_DATABASE_URL", query: "SELECT month FROM finance" }
    }),
    FINANCE_DATABASE_URL: "postgresql://server-only:secret@db.example.test/finance"
  };
  await assert.rejects(() => runPostgresConnectorSmoke(multiple), /more than one PostgreSQL connector/);
});

test("PostgreSQL connector smoke refreshes a configured source without leaking server-only values", async () => {
  const result = await runPostgresConnectorSmoke(env, {
    createConnectorService: ({ connectors, environment }) => createPostgresConnectorService({
      connectors,
      environment,
      queryImpl: async () => [{ region: "east", revenue: 1200 }, { region: "west", revenue: 800 }]
    })
  });
  assert.equal(result.connector, "postgres");
  assert.equal(result.connectionRef, "sales-readonly");
  assert.equal(result.created.rowCount, 2);
  assert.equal(result.created.metricCount, 1);
  assert.equal(result.refreshed.refreshStatus, "ready");
  assert.equal(result.committed, false);
  assert.doesNotMatch(JSON.stringify(result), /server-only|sales_rollup|postgresql:/);
});

test("PostgreSQL connector uses an injected environment rather than process global state", async () => {
  const service = createPostgresConnectorService({
    connectors: { "local-readonly": { connectionStringEnv: "LOCAL_DATABASE_URL", query: "SELECT region FROM sales" } },
    environment: {}
  });
  await assert.rejects(() => service.create({ name: "隔离环境", connector: { type: "postgres", connectionRef: "local-readonly" } }), /服务端连接串未配置/);
});
