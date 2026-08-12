import { parseDataSource, updateDataSourceSchema } from "./data-source-service.mjs";
import { ContractError } from "./workspace-core.mjs";

const MAX_BYTES = 2 * 1024 * 1024;

function fail(message, path = "/connector", code = "invalid") {
  throw new ContractError(message, [{ path, code, message }]);
}

function safeUrl(value, { allowedHosts, allowInsecure }) {
  let url;
  try { url = new URL(value); } catch { fail("REST 地址无效", "/connector/url", "format"); }
  if (url.username || url.password) fail("REST 地址不能包含用户名或密码", "/connector/url", "credential");
  if (url.protocol !== "https:" && !(allowInsecure && url.protocol === "http:")) fail("REST 连接器只允许 HTTPS", "/connector/url", "protocol");
  if (!allowedHosts.has(url.host)) fail(`REST 主机 ${url.host} 不在服务端白名单`, "/connector/url", "allowlist");
  for (const key of url.searchParams.keys()) if (/token|key|secret|auth|password|signature/i.test(key)) fail("REST 地址不能在查询参数中携带凭证", "/connector/url", "credential");
  url.hash = "";
  return url;
}

function credentialHeaders(ref, credentials) {
  if (!ref) return {};
  const entry = credentials[ref];
  if (!entry || typeof entry !== "object") fail(`服务端凭证 ${ref} 未配置`, "/connector/credentialRef", "credential");
  const allowed = new Set(["authorization", "x-api-key", "accept"]);
  return Object.fromEntries(Object.entries(entry).map(([name, value]) => {
    if (!allowed.has(name.toLowerCase()) || typeof value !== "string" || /[\r\n]/.test(value)) fail(`凭证 ${ref} 包含不受支持的请求头`, "/connector/credentialRef", "credential");
    return [name, value];
  }));
}

function recordsAtPath(value, path) {
  if (!path) return Array.isArray(value) ? value : value?.records;
  if (!/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(path)) fail("recordsPath 无效", "/connector/recordsPath", "format");
  return path.split(".").reduce((current, segment) => current?.[segment], value);
}

async function fetchRecords(connector, options) {
  const url = safeUrl(connector.url, options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  let response;
  try {
    response = await options.fetchImpl(url, { method: "GET", headers: { Accept: "application/json", ...credentialHeaders(connector.credentialRef, options.credentials) }, redirect: "manual", signal: controller.signal });
  } catch (error) {
    fail(error?.name === "AbortError" ? "REST 请求超时" : "REST 请求失败", "/connector/url", error?.name === "AbortError" ? "timeout" : "upstream");
  } finally { clearTimeout(timeout); }
  if (response.status >= 300 && response.status < 400) fail("REST 连接器不允许重定向", "/connector/url", "redirect");
  if (!response.ok) fail(`REST 上游返回 ${response.status}`, "/connector/url", "upstream");
  const contentLength = Number(response.headers.get("content-length"));
  if (contentLength > MAX_BYTES) fail("REST 响应不能超过 2 MB", "/connector/url", "limit");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_BYTES) fail("REST 响应不能超过 2 MB", "/connector/url", "limit");
  let payload;
  try { payload = JSON.parse(text); } catch { fail("REST 响应不是有效 JSON", "/connector/url", "format"); }
  const records = recordsAtPath(payload, connector.recordsPath);
  if (!Array.isArray(records)) fail("REST 响应路径必须指向对象数组", "/connector/recordsPath", "type");
  return records;
}

export function createRestConnectorService({ fetchImpl = fetch, allowedHosts = [], credentials = {}, timeoutMs = 10_000, allowInsecure = false } = {}) {
  const options = { fetchImpl, allowedHosts: new Set(allowedHosts), credentials, timeoutMs: Math.max(100, timeoutMs), allowInsecure };
  return {
    configured: options.allowedHosts.size > 0,
    async create({ id, name, connector, portable = false, now = new Date().toISOString() } = {}) {
      if (!this.configured) fail("REST 连接器未配置服务端主机白名单", "/connector/url", "unconfigured");
      const records = await fetchRecords(connector || {}, options);
      const source = parseDataSource({ id, name, format: "json", content: JSON.stringify(records), portable, now });
      source.kind = "rest";
      source.connector = { type: "rest", url: safeUrl(connector.url, options).toString(), recordsPath: connector.recordsPath || "", ...(connector.credentialRef ? { credentialRef: connector.credentialRef } : {}) };
      return source;
    },
    async refresh(source, { now = new Date().toISOString() } = {}) {
      if (source.kind !== "rest" || !source.connector) fail("当前数据源不是 REST 连接器", "/id", "compatibility");
      const records = await fetchRecords(source.connector, options);
      const parsed = parseDataSource({ id: source.id, name: source.name, format: "json", content: JSON.stringify(records), portable: source.portable, now });
      const nextIds = new Set(parsed.fields.map(({ id }) => id));
      const fieldTypes = Object.fromEntries(source.fields.filter(({ id }) => nextIds.has(id)).map(({ id, type }) => [id, type]));
      const refreshed = updateDataSourceSchema(parsed, { fieldTypes, semanticModel: source.semanticModel, portable: source.portable, now });
      refreshed.semanticModel.version = source.semanticModel?.version || refreshed.semanticModel.version;
      refreshed.kind = "rest";
      refreshed.connector = structuredClone(source.connector);
      refreshed.createdAt = source.createdAt;
      if (source.organizationId) refreshed.organizationId = source.organizationId;
      if (source.ownerId) refreshed.ownerId = source.ownerId;
      refreshed.refresh = { status: "ready", attempt: (source.refresh?.attempt || 0) + 1, refreshedAt: now, lastSuccessfulAt: now };
      return refreshed;
    }
  };
}
