import { createHash } from "node:crypto";
import { parseDataSource, updateDataSourceSchema } from "./data-source-service.mjs";
import { ContractError } from "./workspace-core.mjs";

const MAX_QUERY_ROWS = 10_000;
const MAX_QUERY_MS = 10_000;

function fail(message, path = "/connector", code = "invalid") {
  throw new ContractError(message, [{ path, code, message }]);
}

function configuredEntry(id, connectors) {
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(String(id || ""))) fail("数据库连接引用无效", "/connector/connectionRef", "format");
  const entry = connectors[id];
  if (!entry || typeof entry !== "object") fail(`服务端数据库连接 ${id} 未配置`, "/connector/connectionRef", "unconfigured");
  if (!/^[A-Z][A-Z0-9_]{1,127}$/.test(entry.connectionStringEnv || "")) fail(`数据库连接 ${id} 缺少有效的 connectionStringEnv`, "/connector/connectionRef", "configuration");
  const query = String(entry.query || "").trim().replace(/;\s*$/, "");
  if (!query || query.length > 20_000) fail(`数据库连接 ${id} 缺少受控查询`, "/connector/connectionRef", "configuration");
  if (!/^(select\b|with\b)/i.test(query) || /;|--|\/\*|\*\/|\b(insert|update|delete|drop|alter|create|grant|revoke|copy|call|do|execute|vacuum|truncate|lock)\b|\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b/i.test(query)) {
    fail(`数据库连接 ${id} 的查询必须是单条只读 SELECT`, "/connector/connectionRef", "configuration");
  }
  return { id, connectionStringEnv: entry.connectionStringEnv, query, statementTimeoutMs: Math.max(100, Math.min(MAX_QUERY_MS, Number(entry.statementTimeoutMs) || MAX_QUERY_MS)) };
}

export function postgresConnectorsFromEnv(value = process.env.DASHBOARD_POSTGRES_CONNECTORS_JSON || "{}") {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function createPostgresConnectorService({ connectors = {}, queryImpl = null, environment = process.env } = {}) {
  const entries = Object.fromEntries(Object.keys(connectors).map((id) => [id, configuredEntry(id, connectors)]));
  const execute = queryImpl || (async (entry) => {
    const connectionString = environment[entry.connectionStringEnv];
    if (!connectionString) fail(`数据库连接 ${entry.id} 的服务端连接串未配置`, "/connector/connectionRef", "unavailable");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: entry.statementTimeoutMs });
    try {
      const result = await pool.query({ text: entry.query, query_timeout: entry.statementTimeoutMs, statement_timeout: entry.statementTimeoutMs });
      return result.rows;
    } catch {
      fail("数据库只读查询失败", "/connector/connectionRef", "upstream");
    } finally {
      await pool.end().catch(() => {});
    }
  });
  const recordsFor = async (connectionRef) => {
    const entry = entries[connectionRef] || configuredEntry(connectionRef, connectors);
    const records = await execute(entry);
    if (!Array.isArray(records) || records.some((record) => !record || typeof record !== "object" || Array.isArray(record))) fail("数据库查询必须返回对象行", "/connector/connectionRef", "type");
    if (!records.length) fail("数据库查询没有返回数据", "/connector/connectionRef", "empty");
    if (records.length > MAX_QUERY_ROWS) fail(`数据库查询不能超过 ${MAX_QUERY_ROWS} 行`, "/connector/connectionRef", "limit");
    return { entry, records };
  };
  return {
    configured: Object.keys(entries).length > 0,
    connectionRefs: Object.keys(entries).sort(),
    async create({ id, name, connector, portable = false, now = new Date().toISOString() } = {}) {
      const connectionRef = connector?.connectionRef;
      const { entry, records } = await recordsFor(connectionRef);
      const source = parseDataSource({ id, name, format: "json", content: JSON.stringify(records), portable, now });
      source.kind = "postgres";
      source.connector = { type: "postgres", connectionRef: entry.id, queryFingerprint: `sha256-${createHash("sha256").update(entry.query).digest("hex")}` };
      return source;
    },
    async refresh(source, { now = new Date().toISOString() } = {}) {
      if (source.kind !== "postgres" || source.connector?.type !== "postgres") fail("当前数据源不是 PostgreSQL 连接器", "/id", "compatibility");
      const { entry, records } = await recordsFor(source.connector.connectionRef);
      const parsed = parseDataSource({ id: source.id, name: source.name, format: "json", content: JSON.stringify(records), portable: source.portable, now });
      const nextIds = new Set(parsed.fields.map(({ id }) => id));
      const fieldTypes = Object.fromEntries(source.fields.filter(({ id }) => nextIds.has(id)).map(({ id, type }) => [id, type]));
      const refreshed = updateDataSourceSchema(parsed, { fieldTypes, semanticModel: source.semanticModel, portable: source.portable, now });
      refreshed.semanticModel.version = source.semanticModel?.version || refreshed.semanticModel.version;
      refreshed.kind = "postgres";
      refreshed.connector = { type: "postgres", connectionRef: entry.id, queryFingerprint: `sha256-${createHash("sha256").update(entry.query).digest("hex")}` };
      refreshed.createdAt = source.createdAt;
      if (source.organizationId) refreshed.organizationId = source.organizationId;
      if (source.ownerId) refreshed.ownerId = source.ownerId;
      refreshed.refresh = { status: "ready", attempt: (source.refresh?.attempt || 0) + 1, refreshedAt: now, lastSuccessfulAt: now };
      return refreshed;
    }
  };
}
