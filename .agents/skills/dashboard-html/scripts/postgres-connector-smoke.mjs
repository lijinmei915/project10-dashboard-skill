import { pathToFileURL } from "node:url";
import { createPostgresConnectorService, postgresConnectorsFromEnv } from "./postgres-connector-service.mjs";

function fail(message) {
  throw new Error(message);
}

function summarize(source) {
  return {
    rowCount: source.rowCount,
    columnCount: source.columnCount,
    dimensionCount: source.semanticModel?.dimensions?.length || 0,
    metricCount: source.semanticModel?.metrics?.length || 0,
    refreshStatus: source.refresh?.status || "initial"
  };
}

function selectedRef(connectors, value) {
  const refs = Object.keys(connectors).sort();
  if (!refs.length) fail("Set DASHBOARD_POSTGRES_CONNECTORS_JSON before running the PostgreSQL connector smoke test");
  if (value) {
    if (!Object.hasOwn(connectors, value)) fail("DASHBOARD_POSTGRES_SMOKE_CONNECTION_REF is not a configured connection reference");
    return value;
  }
  if (refs.length !== 1) fail("Set DASHBOARD_POSTGRES_SMOKE_CONNECTION_REF when more than one PostgreSQL connector is configured");
  return refs[0];
}

export async function runPostgresConnectorSmoke(env = process.env, { createConnectorService = createPostgresConnectorService } = {}) {
  const connectors = postgresConnectorsFromEnv(env.DASHBOARD_POSTGRES_CONNECTORS_JSON || "{}");
  const connectionRef = selectedRef(connectors, env.DASHBOARD_POSTGRES_SMOKE_CONNECTION_REF);
  const entry = connectors[connectionRef];
  if (!env[entry.connectionStringEnv]) fail(`Set ${entry.connectionStringEnv} before running the PostgreSQL connector smoke test`);
  const service = createConnectorService({ connectors, environment: env });
  const created = await service.create({ id: "postgres-connector-smoke", name: "PostgreSQL connector smoke", connector: { type: "postgres", connectionRef }, portable: false });
  const refreshed = await service.refresh(created);
  const result = { connector: "postgres", connectionRef, created: summarize(created), refreshed: summarize(refreshed), committed: false };
  const output = JSON.stringify(result);
  for (const secret of [env[entry.connectionStringEnv], entry.query]) if (secret && output.includes(secret)) fail("PostgreSQL connector smoke summary leaked server-only configuration");
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPostgresConnectorSmoke().then((result) => console.log(JSON.stringify(result))).catch((error) => {
    console.error(`PostgreSQL connector smoke failed: ${error.message}`);
    process.exitCode = 1;
  });
}
