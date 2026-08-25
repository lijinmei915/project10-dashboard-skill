import http from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as echarts from "echarts";
import { chartSpecRenderConfig, createEchartsOption, normalizeChartSpec } from "./chart-spec-runtime.mjs";
import { commitGenerationPreview } from "./generation-pipeline.mjs";
import { createProviderFromEnv, providerHealth, ProviderError, runGenerationWithProvider } from "./provider-gateway.mjs";
import { createOrganizationProviderManager, createProviderProfileRepository } from "./provider-profile-service.mjs";
import { appendProjectRevision, assertProject, createProject, projectRevisionSummary, restoreProjectRevisionAsNew, undoProjectRevision } from "./project-store.mjs";
import { createProjectRepository } from "./studio-project-repository.mjs";
import { exportProjectRevision } from "./revision-exporter.mjs";
import { ContractError } from "./workspace-core.mjs";
import { createDataContext, markDataSourceRefreshFailed, parseUploadedDataSource, refreshUploadedDataSource, summarizeDataSource, updateDataSourceSchema } from "./data-source-service.mjs";
import { createDataSourceRepository } from "./studio-data-source-repository.mjs";
import { approvePublication, authorizePublicationAccess, createPublication, createShareToken, publicationFreshness, publicationSummary, revokePublication } from "./publication-service.mjs";
import { createPublicationApprovalPolicy, publicationApprovalOrganizationsFromEnv } from "./publication-approval-policy.mjs";
import { createPublicationRepository } from "./studio-publication-repository.mjs";
import { createPublicationAccessRepository } from "./studio-publication-access-repository.mjs";
import { createPublicationAuditOutboxDispatcher } from "./studio-publication-audit-outbox.mjs";
import { createPublicationRateLimiter } from "./publication-rate-limiter.mjs";
import { createSemanticQueryCache } from "./semantic-query-cache.mjs";
import { createDataAccessPolicyService, dataAccessPoliciesFromEnv } from "./data-access-policy-service.mjs";
import { createRestConnectorService } from "./rest-connector-service.mjs";
import { createPostgresConnectorService, postgresConnectorsFromEnv } from "./postgres-connector-service.mjs";
import { createJobRepository } from "./studio-job-repository.mjs";
import { createRefreshJobService } from "./refresh-job-service.mjs";
import { createGenerationJobService } from "./generation-job-service.mjs";
import { createRefreshScheduleRepository } from "./studio-refresh-schedule-repository.mjs";
import { createRefreshScheduleService } from "./refresh-schedule-service.mjs";
import { createOrganizationRepository } from "./studio-organization-repository.mjs";
import { createOrganizationService } from "./organization-service.mjs";
import { createOrganizationAuditOutboxDispatcher } from "./studio-organization-audit-outbox.mjs";
import { createOrganizationSessionRevocationOutboxDispatcher } from "./studio-organization-session-revocation-outbox.mjs";
import { createPublicationRenderService } from "./publication-render-service.mjs";
import { AuthError, createStudioAuthService } from "./studio-auth-service.mjs";
import { createAccountRepository } from "./studio-account-repository.mjs";
import { createAuthRateLimiter } from "./auth-rate-limiter.mjs";
import { authorizeProject, projectAccessRole, updateProjectAccess } from "./project-access-service.mjs";
import { copyProject, createReportProjectCopy, updateProjectMetadata } from "./project-management-service.mjs";
import { createAuditEvent, createAuditRepository } from "./studio-audit-repository.mjs";
import { createAuditOutboxDispatcher } from "./studio-audit-outbox.mjs";
import { createAuditAnchorDispatcher } from "./studio-audit-anchor-dispatcher.mjs";
import { createConfiguredAuditAnchorSink } from "./audit-anchor-sink.mjs";
import { createStorageRuntime } from "./studio-storage-runtime.mjs";
import { createPostgresStorage } from "./studio-postgres-storage.mjs";
import { createExternalIdentityRepository } from "./studio-external-identity-repository.mjs";
import { createConfiguredOidcProviderService } from "./oidc-runtime-config.mjs";
import { normalizePublicOrigin } from "./studio-deployment-config.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../../../..");
const iconRoot = path.join(rootDir, "node_modules/@phosphor-icons/core/assets");
const aliasesPath = path.resolve(scriptDir, "../data/icon-aliases.zh.json");
const chartCatalogPath = path.resolve(scriptDir, "../data/chart-catalog.json");
const palettePath = path.resolve(scriptDir, "../assets/palette.v1.json");
const componentRegistryPath = path.resolve(scriptDir, "../data/component-registry.json");
const designStandardsPath = path.resolve(scriptDir, "../data/design-standards.json");
const port = Number(process.env.PORT || 8765);
const host = process.env.HOST || "127.0.0.1";
const fallbackProvider = createProviderFromEnv();
const defaultProviderProfileRepository = createProviderProfileRepository({
  configurationDirectory: process.env.DASHBOARD_PROVIDER_PROFILES_DIR || path.join(rootDir, ".dashboard-provider-profiles"),
  secretDirectory: process.env.DASHBOARD_PROVIDER_SECRETS_DIR || path.join(rootDir, ".dashboard-provider-secrets")
});
const defaultProvider = createOrganizationProviderManager({
  repository: defaultProviderProfileRepository,
  fallbackProvider,
  timeoutMs: Number(process.env.DASHBOARD_AI_TIMEOUT_MS) || 300_000,
  firstByteTimeoutMs: Number(process.env.DASHBOARD_AI_FIRST_BYTE_TIMEOUT_MS) || 120_000,
  idleTimeoutMs: Number(process.env.DASHBOARD_AI_IDLE_TIMEOUT_MS) || 60_000
});
const defaultProjectRepository = createProjectRepository({ directory: process.env.DASHBOARD_PROJECTS_DIR || path.join(rootDir, ".dashboard-projects") });
const defaultDataSourceRepository = createDataSourceRepository({ directory: process.env.DASHBOARD_DATA_SOURCES_DIR || path.join(rootDir, ".dashboard-data-sources") });
const defaultPublicationRepository = createPublicationRepository({ directory: process.env.DASHBOARD_PUBLICATIONS_DIR || path.join(rootDir, ".dashboard-publications") });
const defaultPublicationAccessRepository = createPublicationAccessRepository({ directory: process.env.DASHBOARD_PUBLICATION_ACCESS_DIR || path.join(rootDir, ".dashboard-publication-access") });
const defaultPublicationRateLimiter = createPublicationRateLimiter({ limit: Number(process.env.DASHBOARD_PUBLICATION_RATE_LIMIT) || 120, windowMs: Number(process.env.DASHBOARD_PUBLICATION_RATE_WINDOW_MS) || 60_000 });
const defaultPublicationApprovalPolicy = createPublicationApprovalPolicy({ organizationIds: publicationApprovalOrganizationsFromEnv() });
const defaultJobRepository = createJobRepository({ directory: process.env.DASHBOARD_JOBS_DIR || path.join(rootDir, ".dashboard-jobs") });
const defaultRefreshScheduleRepository = createRefreshScheduleRepository({ directory: process.env.DASHBOARD_REFRESH_SCHEDULES_DIR || path.join(rootDir, ".dashboard-refresh-schedules") });
const defaultOrganizationRepository = createOrganizationRepository({ directory: process.env.DASHBOARD_ORGANIZATIONS_DIR || path.join(rootDir, ".dashboard-organizations") });
const defaultExternalIdentityRepository = createExternalIdentityRepository({ directory: process.env.DASHBOARD_EXTERNAL_IDENTITIES_DIR || path.join(rootDir, ".dashboard-external-identities") });
const defaultAccountRepository = createAccountRepository({ directory: process.env.DASHBOARD_ACCOUNTS_DIR || path.join(rootDir, ".dashboard-accounts") });
const defaultAuthRateLimiter = createAuthRateLimiter({ limit: Number(process.env.DASHBOARD_AUTH_RATE_LIMIT) || 8, windowMs: Number(process.env.DASHBOARD_AUTH_RATE_WINDOW_MS) || 15 * 60 * 1000 });
const defaultAuditRepository = createAuditRepository({ directory: process.env.DASHBOARD_AUDIT_DIR || path.join(rootDir, ".dashboard-audit") });
const defaultAuditOutbox = createAuditOutboxDispatcher({ projectRepository: defaultProjectRepository, auditRepository: defaultAuditRepository });
const defaultPublicationRenderer = createPublicationRenderService({ timeoutMs: Number(process.env.DASHBOARD_RENDER_TIMEOUT_MS) || 30_000 });
function configuredOrganizationIdentities() {
  const mode = process.env.DASHBOARD_AUTH_MODE || "disabled";
  const users = Object.entries(jsonEnvironment("DASHBOARD_AUTH_USERS_JSON")).map(([id, user]) => ({ id, ...user }));
  return mode === "disabled" ? [{ id: "local-admin", name: "Local Admin", role: "admin", organizationId: "local" }] : users;
}
function configuredAuthService(sessionRepository = null, organizationRepository = null, configuredOrganizationService = null) {
  const mode = process.env.DASHBOARD_AUTH_MODE || "disabled";
  const users = Object.entries(jsonEnvironment("DASHBOARD_AUTH_USERS_JSON")).map(([id, user]) => ({ id, ...user }));
  const organizationService = mode === "password" ? null : configuredOrganizationService || (organizationRepository ? createOrganizationService({ repository: organizationRepository, identities: configuredOrganizationIdentities() }) : null);
  return createStudioAuthService({
    mode,
    users,
    accountRepository: mode === "password" ? defaultAccountRepository : null,
    sessionTtlMs: Number(process.env.DASHBOARD_AUTH_SESSION_TTL_MS) || 8 * 60 * 60 * 1000,
    secureCookies: process.env.DASHBOARD_AUTH_SECURE_COOKIE === "true",
    sessionRepository,
    organizationService
  });
}
const defaultOrganizationService = createOrganizationService({ repository: defaultOrganizationRepository, identities: configuredOrganizationIdentities() });
const defaultAuthService = configuredAuthService(null, defaultOrganizationRepository, defaultOrganizationService);
const defaultOrganizationSessionRevocationOutbox = createOrganizationSessionRevocationOutboxDispatcher({ organizationRepository: defaultOrganizationRepository, authService: defaultAuthService });
const defaultOidcProviderService = createConfiguredOidcProviderService({ authService: defaultAuthService, externalIdentityRepository: defaultExternalIdentityRepository, organizationService: defaultOrganizationService });
const defaultQueryCache = createSemanticQueryCache({
  ttlMs: Math.max(1_000, Number(process.env.DASHBOARD_QUERY_CACHE_TTL_MS) || 30_000),
  maxEntries: Math.max(10, Number(process.env.DASHBOARD_QUERY_CACHE_MAX_ENTRIES) || 100)
});
const defaultDataAccessPolicyService = createDataAccessPolicyService({ policies: dataAccessPoliciesFromEnv() });
const providerScope = (actor) => actor?.id === "local-admin" ? "local" : actor?.id || actor?.actorId || actor?.organizationId;
function jsonEnvironment(name) {
  try { return JSON.parse(process.env[name] || "{}"); } catch { return {}; }
}
const defaultRestConnector = createRestConnectorService({
  allowedHosts: (process.env.DASHBOARD_REST_ALLOWED_HOSTS || "").split(",").map((value) => value.trim()).filter(Boolean),
  credentials: jsonEnvironment("DASHBOARD_REST_CREDENTIALS_JSON"),
  timeoutMs: Number(process.env.DASHBOARD_REST_TIMEOUT_MS) || 10_000,
  allowInsecure: process.env.DASHBOARD_REST_ALLOW_INSECURE === "true"
});
const defaultPostgresConnector = createPostgresConnectorService({ connectors: postgresConnectorsFromEnv() });
const weights = new Set(["thin", "regular", "bold", "fill"]);
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"]
]);

const aliases = JSON.parse(await readFile(aliasesPath, "utf8"));
const chartCatalog = JSON.parse(await readFile(chartCatalogPath, "utf8"));
const dashboardPalette = JSON.parse(await readFile(palettePath, "utf8"));
const componentRegistry = JSON.parse(await readFile(componentRegistryPath, "utf8"));
const designStandards = JSON.parse(await readFile(designStandardsPath, "utf8"));
const regularFiles = await readdir(path.join(iconRoot, "regular"));
const iconNames = regularFiles
  .filter((file) => file.endsWith(".svg"))
  .map((file) => file.slice(0, -4))
  .sort();

function iconFile(name, weight) {
  const suffix = weight === "regular" ? "" : `-${weight}`;
  return path.join(iconRoot, weight, `${name}${suffix}.svg`);
}

function sanitizeSvg(svg) {
  const match = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  if (!match) throw new Error("Invalid SVG asset");
  const body = match[1]
    .replace(/<(?!\/?(?:path|circle|rect|line|polyline|polygon|g)\b)[^>]*>/gi, "")
    .replace(/\s(?:on\w+|style|href|xlink:href)=(?:"[^"]*"|'[^']*')/gi, "");
  return `<svg viewBox="0 0 256 256" aria-hidden="true">${body}</svg>`;
}

async function resolveIcon(name, weight = "regular") {
  if (!iconNames.includes(name) || !weights.has(weight)) return null;
  try {
    return sanitizeSvg(await readFile(iconFile(name, weight), "utf8"));
  } catch {
    return sanitizeSvg(await readFile(iconFile(name, "regular"), "utf8"));
  }
}

async function searchIcons(query, limit = 48) {
  const normalized = query.trim().toLowerCase();
  const terms = normalized.split(/\s+/).filter(Boolean);
  const ranked = iconNames.map((name) => {
    const aliasText = (aliases[name] || []).join(" ").toLowerCase();
    const searchable = `${name.replaceAll("-", " ")} ${aliasText}`;
    let score = normalized ? 0 : 1;
    for (const term of terms) {
      if (name === term) score += 100;
      else if (name.startsWith(term)) score += 40;
      else if (name.includes(term)) score += 24;
      if (aliasText.includes(term)) score += 36;
      if (!searchable.includes(term)) return null;
    }
    return { name, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);

  return Promise.all(ranked.map(async ({ name }) => ({
    name,
    aliases: aliases[name] || [],
    svg: await resolveIcon(name, "regular")
  })));
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(payload));
}

async function sendGenerationEventStream(request, response, generationJobService, jobId, actor) {
  const requestedCursor = request.headers["last-event-id"] || new URL(request.url, "http://localhost").searchParams.get("after") || 0;
  let cursor = Math.max(0, Number(requestedCursor) || 0);
  const initial = await generationJobService.events(jobId, actor, { after: cursor });
  if (!initial) return sendJson(response, 404, { error: "Generation job not found" });
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  response.flushHeaders?.();
  response.write("retry: 1000\n\n");
  response.write(`event: job.snapshot\ndata: ${JSON.stringify({ status: initial.status, stage: initial.stage, progress: initial.progress, updatedAt: initial.updatedAt, terminal: initial.terminal })}\n\n`);
  let closed = false;
  let lastHeartbeat = Date.now();
  request.once("close", () => { closed = true; });
  let snapshot = initial;
  try {
    while (!closed) {
      for (const event of snapshot.events) {
        cursor = event.id;
        response.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
      if (snapshot.terminal) break;
      if (Date.now() - lastHeartbeat >= 10_000) {
        response.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
        lastHeartbeat = Date.now();
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      snapshot = await generationJobService.events(jobId, actor, { after: cursor });
      if (!snapshot) break;
    }
  } catch {
    // Ending the stream lets EventSource reconnect while the job keeps running.
  } finally {
    if (!closed && !response.writableEnded) response.end();
  }
}

function datasetEvent(source) {
  return {
    id: encodeURIComponent(String(source.updatedAt || "unknown")),
    payload: {
      datasetId: source.id,
      version: Number(source.semanticModel?.version) || 1,
      updatedAt: source.updatedAt || null
    }
  };
}

async function sendDatasetEventStream(request, response, dataSourceRepository, dataAccessPolicyService, datasetId, actor) {
  const initialSource = await dataSourceRepository.get(datasetId);
  if (!initialSource) return sendJson(response, 404, { error: "Data source not found" });
  const initial = datasetEvent(dataAccessPolicyService.scope(initialSource, actor).source);
  const requestedCursor = String(request.headers["last-event-id"] || new URL(request.url, "http://localhost").searchParams.get("after") || "");
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  response.flushHeaders?.();
  response.write("retry: 1000\n\n");
  const initialType = requestedCursor && requestedCursor !== initial.id ? "dataset.updated" : "dataset.snapshot";
  response.write(`id: ${initial.id}\nevent: ${initialType}\ndata: ${JSON.stringify(initial.payload)}\n\n`);
  let cursor = initial.id;
  let closed = false;
  let lastHeartbeat = Date.now();
  request.once("close", () => { closed = true; });
  try {
    while (!closed) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const currentSource = await dataSourceRepository.get(datasetId);
      if (!currentSource) break;
      const current = datasetEvent(dataAccessPolicyService.scope(currentSource, actor).source);
      if (current.id !== cursor) {
        cursor = current.id;
        response.write(`id: ${current.id}\nevent: dataset.updated\ndata: ${JSON.stringify(current.payload)}\n\n`);
      }
      if (Date.now() - lastHeartbeat >= 10_000) {
        response.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
        lastHeartbeat = Date.now();
      }
    }
  } catch {
    // Closing the stream lets the browser reconnect without changing data state.
  } finally {
    if (!closed && !response.writableEnded) response.end();
  }
}

function sendArtifact(response, artifact, { disposition = "attachment", cacheControl = "private, no-cache", headers = {} } = {}) {
  response.writeHead(200, {
    "Content-Type": artifact.mediaType,
    "Content-Disposition": `${disposition}; filename="${artifact.filename}"`,
    "Content-Length": Buffer.byteLength(artifact.html),
    "ETag": `"sha256-${artifact.sha256}"`,
    "X-Dashboard-Project": artifact.projectId,
    "X-Dashboard-Revision": artifact.revisionId,
    "Cache-Control": cacheControl,
    ...headers
  });
  response.end(artifact.html);
}

function sendBinary(response, rendered) {
  response.writeHead(200, {
    "Content-Type": rendered.mediaType,
    "Content-Disposition": `attachment; filename="${rendered.filename}"`,
    "Content-Length": rendered.bytes.length,
    "X-Dashboard-Width": String(rendered.width),
    "X-Dashboard-Height": String(rendered.height),
    ...(rendered.layout ? { "X-Dashboard-Render-Layout": rendered.layout } : {}),
    "Cache-Control": "private, no-store"
  });
  response.end(rendered.bytes);
}

async function readJsonBody(request, maxBytes = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}


function renderChartSvg(input) {
  const spec = normalizeChartSpec(input, { chartTypes: chartCatalog.map(({ type }) => type), defaultPalette: dashboardPalette.categorical });
  const config = chartSpecRenderConfig(spec);
  if (config.type === "data-table") {
    const escapeXml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    const background = config.mode === "dark" ? "#20242c" : "#ffffff"; const text = config.mode === "dark" ? "#f4f6f8" : "#27272a"; const muted = config.mode === "dark" ? "#aeb8c6" : "#71717a"; const line = config.mode === "dark" ? "#343b47" : "#e4e4e7";
    const order = config.labels.map((label, index) => ({ label, index })); if (config.table.sort !== "none") order.sort((left, right) => ((config.series[config.table.sortBy]?.values[left.index] || 0) - (config.series[config.table.sortBy]?.values[right.index] || 0)) * (config.table.sort === "asc" ? 1 : -1));
    const visibleRows = order.slice(0, config.table.limit); const columns = Math.max(1, config.series.length); const labelWidth = Math.min(140, config.width * .3); const columnWidth = (config.width - labelWidth - 24) / columns; const summaryRows = config.table.summary ? 1 : 0; const rowHeight = Math.min(36, (config.height - 46) / Math.max(visibleRows.length + summaryRows, 1));
    const formatted = (value, column) => { const format = config.table.formats[column] || {}; return `${format.prefix || ""}${Number(value || 0).toFixed(format.decimals || 0)}${format.suffix || ""}`; };
    const headers = config.series.map(({ name }, index) => `<text x="${labelWidth + 12 + columnWidth * (index + .5)}" y="27" text-anchor="middle" fill="${muted}" font-size="12">${escapeXml(name)}</text>`).join("");
    const rows = visibleRows.map(({ label, index }, row) => { const y = 42 + row * rowHeight; const values = config.series.map((item, column) => { const value = Number(item.values[index]) || 0; const maximum = Math.max(...item.values.map(Number), 0); const color = config.table.conditional && value === maximum ? (config.palette[column] || "#16a34a") : text; return `<text x="${labelWidth + 12 + columnWidth * (column + .5)}" y="${y + rowHeight / 2 + 4}" text-anchor="middle" fill="${color}" font-size="12" font-weight="${color === text ? 400 : 700}">${escapeXml(formatted(value, column))}</text>`; }).join(""); return `<rect x="12" y="${y}" width="${config.width - 24}" height="${rowHeight}" fill="${row % 2 ? background : config.mode === "dark" ? "#262b34" : "#fafafa"}"/><text x="22" y="${y + rowHeight / 2 + 4}" fill="${text}" font-size="12">${escapeXml(label)}</text>${values}<line x1="12" x2="${config.width - 12}" y1="${y + rowHeight}" y2="${y + rowHeight}" stroke="${line}"/>`; }).join("");
    const summary = config.table.summary ? (() => { const y = 42 + visibleRows.length * rowHeight; return `<text x="22" y="${y + rowHeight / 2 + 4}" fill="${text}" font-size="12" font-weight="700">合计</text>${config.series.map((item, column) => `<text x="${labelWidth + 12 + columnWidth * (column + .5)}" y="${y + rowHeight / 2 + 4}" text-anchor="middle" fill="${text}" font-size="12" font-weight="700">${escapeXml(formatted(visibleRows.reduce((sum, row) => sum + (Number(item.values[row.index]) || 0), 0), column))}</text>`).join("")}`; })() : "";
    return `<svg width="${config.width}" height="${config.height}" viewBox="0 0 ${config.width} ${config.height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="数据表格"><rect width="100%" height="100%" fill="${background}"/><text x="22" y="27" fill="${muted}" font-size="12">分类</text>${headers}<line x1="12" x2="${config.width - 12}" y1="40" y2="40" stroke="${line}"/>${rows}${summary}</svg>`;
  }
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: config.width, height: config.height });
  try {
    chart.setOption(createEchartsOption(spec));
    return chart.renderToSVGString()
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "")
      .replace(/\son\w+=(?:"[^"]*"|'[^']*')/gi, "");
  } finally {
    chart.dispose();
  }
}

function searchCharts(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return chartCatalog;
  return chartCatalog.filter(({ type, name, aliases: chartAliases }) =>
    `${type} ${name} ${chartAliases.join(" ")}`.toLowerCase().includes(normalized)
  );
}

async function serveFile(response, filePath, cacheControl = null) {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new Error("Not found");
  response.writeHead(200, {
    "Content-Type": mimeTypes.get(path.extname(filePath)) || "application/octet-stream",
    ...(cacheControl ? { "Cache-Control": cacheControl } : {})
  });
  response.end(await readFile(filePath));
}

async function serveStatic(response, pathname, studioWebRoot = null) {
  if (pathname === "/vendor/echarts.mjs") {
    const vendorPath = studioWebRoot
      ? path.join(studioWebRoot, "vendor/echarts.mjs")
      : path.join(rootDir, "node_modules/echarts/dist/echarts.esm.min.mjs");
    return serveFile(response, vendorPath, "public, max-age=31536000, immutable");
  }
  if (studioWebRoot && (pathname === "/" || pathname.startsWith("/studio/"))) {
    const decoded = decodeURIComponent(pathname);
    const requested = pathname === "/" ? "/index.html" : pathname === "/studio/resources" ? "/studio/resources.html" : decoded;
    const candidate = path.resolve(studioWebRoot, `.${requested}`);
    if (!candidate.startsWith(`${studioWebRoot}${path.sep}`)) return sendJson(response, 403, { error: "Forbidden" });
    try {
      return await serveFile(response, candidate, "no-cache");
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.message !== "Not found") throw error;
      if (path.extname(decoded)) throw error;
      return serveFile(response, path.join(studioWebRoot, "index.html"), "no-cache");
    }
  }
  const studioShellRoute = pathname === "/studio/projects" || /^\/studio\/projects\/[^/]+$/.test(pathname) || pathname === "/studio/organizations/current" || /^\/studio\/publications\/[^/]+$/.test(pathname);
  const requested = pathname === "/studio/resources" ? "/.studio-resources.html" : pathname === "/" || studioShellRoute ? "/.dashboard-preset-preview.html" : pathname;
  const filePath = path.resolve(rootDir, `.${decodeURIComponent(requested)}`);
  if (!filePath.startsWith(`${rootDir}${path.sep}`) && filePath !== rootDir) return sendJson(response, 403, { error: "Forbidden" });
  return serveFile(response, filePath);
}

function errorStatus(error) {
  if (error instanceof AuthError) return error.statusCode;
  if (error instanceof ProviderError) return error.httpStatus;
  if (error instanceof SyntaxError) return 400;
  if (error instanceof ContractError) {
    if (error.issues.some(({ code }) => code === "unconfigured")) return 503;
    return error.issues.some(({ code }) => code === "stale" || code === "conflict") ? 409 : 422;
  }
  if (error?.code === "ENOENT" || error?.message === "Not found") return 404;
  if (error?.message === "Request body too large") return 413;
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 600) return error.statusCode;
  return 500;
}

function isManagementWrite(url, method) {
  if (method === "GET") return false;
  if (method === "POST" && (url.pathname === "/api/charts/render" || url.pathname.endsWith("/query") || url.pathname.endsWith("/export"))) return false;
  return true;
}

async function identityReadiness({ authService, oidcProviderService, externalIdentityRepository }) {
  if (authService.mode !== "oidc") return { status: "not-configured", mode: authService.mode, providerCount: 0 };
  if (!oidcProviderService || !externalIdentityRepository || typeof externalIdentityRepository.probe !== "function") {
    return { status: "error", mode: "oidc", providerCount: 0, error: "configuration-missing" };
  }
  try {
    const providers = oidcProviderService.providers();
    if (!Array.isArray(providers) || !providers.length) throw new Error("OIDC provider is unavailable");
    await externalIdentityRepository.probe();
    return { status: "ok", mode: "oidc", providerCount: providers.length };
  } catch {
    return { status: "error", mode: "oidc", providerCount: 0, error: "probe-failed" };
  }
}

async function resolveGenerationData(request, dataSourceRepository, actor, dataAccessPolicyService = defaultDataAccessPolicyService) {
  const inputs = request?.dataInputs ?? [];
  const contexts = [];
  const normalizedInputs = [];
  for (const input of inputs) {
    if (input.kind !== "uploaded") {
      normalizedInputs.push(input);
      continue;
    }
    const source = await dataSourceRepository.get(input.id);
    if (!source) throw new ContractError("Data source was not found", [{ path: "/request/dataInputs", code: "reference", message: `Data source ${input.id} does not exist` }]);
    const scoped = dataAccessPolicyService.scope(source, actor);
    const resolved = createDataContext(scoped.source);
    normalizedInputs.push(resolved.input);
    contexts.push(resolved);
  }
  return { request: { ...request, dataInputs: normalizedInputs }, dataContexts: contexts };
}

export async function handlePreviewRequest(request, response, { provider = defaultProvider, projectRepository = defaultProjectRepository, dataSourceRepository = defaultDataSourceRepository, publicationRepository = defaultPublicationRepository, publicationAccessRepository = defaultPublicationAccessRepository, publicationRateLimiter = defaultPublicationRateLimiter, publicationApprovalPolicy = defaultPublicationApprovalPolicy, publicationRenderer = defaultPublicationRenderer, authService = defaultAuthService, oidcProviderService = null, externalIdentityRepository = null, organizationService = null, auditRepository = defaultAuditRepository, auditOutbox = defaultAuditOutbox, publicationAuditOutbox = null, auditAnchorDispatcher = null, organizationAuditOutbox = null, organizationSessionRevocationOutbox = null, storageRuntime, queryCache = defaultQueryCache, dataAccessPolicyService = defaultDataAccessPolicyService, restConnector = defaultRestConnector, postgresConnector = defaultPostgresConnector, dataConnector = null, jobService, generationJobService, refreshScheduleService, studioWebRoot = null, publicOrigin = null } = {}) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
    const expectedOrigin = publicOrigin || `${url.protocol}//${url.host}`;
    if (url.pathname === "/api/auth/status" && request.method === "GET") return sendJson(response, 200, await authService.status(request));
    if (url.pathname === "/api/auth/oidc/providers" && request.method === "GET") return sendJson(response, 200, { providers: oidcProviderService ? oidcProviderService.providers() : [] });
    const oidcRoute = url.pathname.match(/^\/api\/auth\/oidc\/([^/]+)\/(start|callback)$/);
    if (oidcRoute) {
      if (!oidcProviderService) return sendJson(response, 404, { error: "OIDC is not configured" });
      const providerId = decodeURIComponent(oidcRoute[1]);
      if (oidcRoute[2] === "start" && request.method === "GET") {
        const started = oidcProviderService.start({ providerId, returnTo: url.searchParams.get("returnTo") || undefined });
        response.writeHead(302, { Location: started.redirectUrl, "Cache-Control": "no-store" });
        return response.end();
      }
      if (oidcRoute[2] === "callback" && request.method === "GET") {
        const completed = await oidcProviderService.complete({ providerId, state: url.searchParams.get("state"), code: url.searchParams.get("code") });
        const session = await authService.loginActor(completed.actor);
        response.writeHead(302, { Location: completed.returnTo, "Cache-Control": "no-store", "Set-Cookie": session.cookie });
        return response.end();
      }
      return sendJson(response, 405, { error: "Method not allowed" });
    }
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const body = await readJsonBody(request);
      const authSource = request.socket?.remoteAddress || "unknown";
      if (authService.mode === "password") {
        const attempt = defaultAuthRateLimiter.consume(authSource, body.email);
        if (!attempt.allowed) return sendJson(response, 429, { error: "登录尝试过多，请稍后重试", code: "rate-limited" }, { "Retry-After": String(attempt.retryAfter), "Cache-Control": "no-store" });
      }
      const session = authService.mode === "password" ? await authService.loginWithPassword(body) : await authService.login(body.token);
      if (authService.mode === "password") defaultAuthRateLimiter.reset(authSource, body.email);
      return sendJson(response, 200, { authenticated: true, actor: session.actor, expiresAt: session.expiresAt }, { "Set-Cookie": session.cookie });
    }
    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      const body = await readJsonBody(request); const authSource = request.socket?.remoteAddress || "unknown"; const attempt = defaultAuthRateLimiter.consume(authSource, body.email);
      if (!attempt.allowed) return sendJson(response, 429, { error: "注册尝试过多，请稍后重试", code: "rate-limited" }, { "Retry-After": String(attempt.retryAfter), "Cache-Control": "no-store" });
      const session = await authService.register(body); defaultAuthRateLimiter.reset(authSource, body.email);
      return sendJson(response, 201, { authenticated: true, actor: session.actor, expiresAt: session.expiresAt }, { "Set-Cookie": session.cookie });
    }
    const invitationStart = url.pathname.match(/^\/api\/auth\/oidc\/([a-zA-Z0-9._-]{1,128})\/invitation-start$/);
    if (invitationStart && request.method === "POST") {
      if (!oidcProviderService || !organizationService) return sendJson(response, 503, { error: "OIDC invitation is unavailable" });
      const body = await readJsonBody(request);
      const invitation = await organizationService.startInvitationAcceptance({ providerId: invitationStart[1], acceptanceToken: body.acceptanceToken });
      const started = oidcProviderService.start({ providerId: invitationStart[1], returnTo: body.returnTo, invitation });
      return sendJson(response, 200, { redirectUrl: started.redirectUrl, expiresAt: started.expiresAt });
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      await authService.authorize(request, { write: false, expectedOrigin });
      return sendJson(response, 200, { authenticated: false }, { "Set-Cookie": await authService.logout(request) });
    }
    let actor = null;
    if (url.pathname.startsWith("/api/") && !["/api/generation/health", "/api/platform/readiness"].includes(url.pathname)) {
      actor = await authService.authorize(request, { write: isManagementWrite(url, request.method), expectedOrigin });
    }
    if (url.pathname === "/api/platform/readiness" && request.method === "GET") {
      const [readiness, authentication, identity, cacheProbe] = await Promise.all([storageRuntime.readiness(), authService.readiness(), identityReadiness({ authService, oidcProviderService, externalIdentityRepository }), queryCache.probe().then(() => ({ status: "ok" })).catch(() => ({ status: "error" }))]);
      const status = readiness.status === "ok" && authentication.status === "ok" && identity.status !== "error" && cacheProbe.status === "ok" ? "ok" : "error";
      const execution = {
        distributed: Boolean(readiness.capabilities.shared && jobService?.capabilities?.leasing && refreshScheduleService?.capabilities?.leasing),
        refreshJobs: jobService?.capabilities || { leasing: false },
        refreshSchedules: refreshScheduleService?.capabilities || { leasing: false }
      };
      const auditIntegrity = auditRepository.integrity || { appendOnly: false, hashChain: false, sealed: false };
      const queryCacheStatus = { status: cacheProbe.status, ...(queryCache.capabilities || { shared: false, persistent: false }) };
      const auditAnchor = { status: auditAnchorDispatcher ? "configured" : "unavailable" };
      const dataAccessPolicy = { status: dataAccessPolicyService.configured ? "configured" : "not-configured", policyCount: dataAccessPolicyService.policyCount };
      return sendJson(response, status === "ok" ? 200 : 503, { ...readiness, status, authentication, identity, execution, auditIntegrity, auditAnchor, dataAccessPolicy, queryCache: queryCacheStatus });
    }
    if (url.pathname === "/api/generation/metrics" && request.method === "GET") {
      return sendJson(response, 200, { metrics: await generationJobService.metrics(actor, { since: url.searchParams.get("since") }) });
    }
    if (url.pathname === "/api/ai-providers" && request.method === "GET") {
      if (!providerScope(actor)) throw new AuthError("Login is required", 401, "login-required");
      const profiles = typeof provider.profiles === "function" ? await provider.profiles(providerScope(actor)) : [{
        id: provider.profileId || provider.id,
        name: provider.id === "deterministic-local" ? "本地演示模式" : provider.id,
        provider: provider.id,
        model: provider.model || null,
        active: true,
        credentialConfigured: Boolean(provider.configured)
      }];
      return sendJson(response, 200, { profiles, managed: typeof provider.activate === "function" });
    }
    if (url.pathname === "/api/ai-providers/activate" && request.method === "POST") {
      if (!providerScope(actor)) throw new AuthError("Login is required", 401, "login-required");
      if (typeof provider.activate !== "function") return sendJson(response, 409, { error: "Provider profiles are not managed by Studio" });
      const profileId = (await readJsonBody(request)).profileId;
      const profiles = await (provider.organizations ? provider.activate(providerScope(actor), profileId) : provider.activate(profileId));
      return sendJson(response, 200, { profiles });
    }
    if (url.pathname === "/api/ai-providers/deactivate" && request.method === "POST") {
      if (!providerScope(actor)) throw new AuthError("Login is required", 401, "login-required");
      if (typeof provider.deactivate !== "function") return sendJson(response, 409, { error: "Provider profiles are not managed by Studio" });
      const profiles = await (provider.organizations ? provider.deactivate(providerScope(actor)) : provider.deactivate());
      return sendJson(response, 200, { profiles });
    }
    if (url.pathname === "/api/ai-providers" && request.method === "PUT") {
      if (!providerScope(actor)) throw new AuthError("Login is required", 401, "login-required");
      if (typeof provider.upsert !== "function") return sendJson(response, 409, { error: "Provider profiles are not managed by Studio" });
      return sendJson(response, 200, { profiles: await provider.upsert(providerScope(actor), await readJsonBody(request)) });
    }
    const providerProfileRoute = url.pathname.match(/^\/api\/ai-providers\/([^/]+)$/);
    if (providerProfileRoute && request.method === "DELETE") {
      if (!providerScope(actor)) throw new AuthError("Login is required", 401, "login-required");
      if (typeof provider.remove !== "function") return sendJson(response, 409, { error: "Provider profiles are not managed by Studio" });
      return sendJson(response, 200, { profiles: await provider.remove(providerScope(actor), decodeURIComponent(providerProfileRoute[1])) });
    }
    if (url.pathname === "/api/ai-providers/test" && request.method === "POST") {
      if (!providerScope(actor)) throw new AuthError("Login is required", 401, "login-required");
      if (typeof provider.testConnection !== "function") return sendJson(response, 409, { error: "Connection testing is unavailable for this provider" });
      const profileId = (await readJsonBody(request)).profileId;
      return sendJson(response, 200, { result: await (provider.organizations ? provider.testConnection(providerScope(actor), profileId) : provider.testConnection(profileId)) });
    }
    if (url.pathname === "/api/ai-providers/models" && request.method === "GET") {
      if (!providerScope(actor)) throw new AuthError("Login is required", 401, "login-required");
      if (typeof provider.discoverModels !== "function") return sendJson(response, 409, { error: "Model discovery is unavailable for this provider" });
      const profileId = url.searchParams.get("profileId") || undefined;
      return sendJson(response, 200, { models: await (provider.organizations ? provider.discoverModels(providerScope(actor), profileId) : provider.discoverModels(profileId)) });
    }
    if (url.pathname === "/api/ai-providers/models/probe" && request.method === "POST") {
      if (!providerScope(actor)) throw new AuthError("Login is required", 401, "login-required");
      if (typeof provider.probeModels !== "function") return sendJson(response, 409, { error: "Model discovery is unavailable for this provider" });
      return sendJson(response, 200, { models: await provider.probeModels(providerScope(actor), await readJsonBody(request)) });
    }
    if (url.pathname === "/api/auth/actors" && request.method === "GET") return sendJson(response, 200, { actors: await authService.directory(actor) });
    if (url.pathname === "/api/organizations/current" && request.method === "GET") {
      if (!organizationService) return sendJson(response, 501, { error: "Organization control requires an organization repository" });
      return sendJson(response, 200, { organization: await organizationService.current(actor, { includeMembers: actor.organizationRole === "admin" }) });
    }
    if (url.pathname === "/api/organizations/current" && request.method === "PATCH") {
      if (!organizationService) return sendJson(response, 501, { error: "Organization control requires an organization repository" });
      const organization = await organizationService.update(actor, await readJsonBody(request));
      await organizationAuditOutbox?.flush().catch(() => {});
      return sendJson(response, 200, { organization });
    }
    if (url.pathname === "/api/organizations/current/members" && request.method === "PUT") {
      if (!organizationService) return sendJson(response, 501, { error: "Organization control requires an organization repository" });
      const organization = await organizationService.updateMembers(actor, await readJsonBody(request));
      await organizationAuditOutbox?.flush().catch(() => {});
      await organizationSessionRevocationOutbox?.flush().catch(() => {});
      return sendJson(response, 200, { organization });
    }
    if (url.pathname === "/api/organizations/current/invitations" && request.method === "POST") {
      if (!organizationService) return sendJson(response, 501, { error: "Organization control requires an organization repository" });
      const created = await organizationService.createInvitation(actor, await readJsonBody(request));
      await organizationAuditOutbox?.flush().catch(() => {});
      return sendJson(response, 201, created);
    }
    if (url.pathname === "/api/audit-events/verify" && request.method === "GET") {
      if (typeof auditRepository.verify !== "function") return sendJson(response, 501, { error: "Audit integrity verification requires PostgreSQL storage" });
      await auditOutbox.flush().catch(() => {});
      await publicationAuditOutbox?.flush().catch(() => {});
      const verification = await auditRepository.verify({ organizationId: actor.organizationId });
      return sendJson(response, verification.status === "ok" ? 200 : 409, verification);
    }
    if (url.pathname === "/api/audit-events/anchor-status" && request.method === "GET") {
      if (actor.organizationRole !== "admin") throw new AuthError("Organization admin role is required", 403, "organization-admin-required");
      if (typeof auditRepository.anchorStatus !== "function") return sendJson(response, 501, { error: "Audit anchor status requires PostgreSQL storage" });
      await auditOutbox.flush().catch(() => {});
      await publicationAuditOutbox?.flush().catch(() => {});
      return sendJson(response, 200, await auditRepository.anchorStatus({ organizationId: actor.organizationId }));
    }
    if (url.pathname === "/api/audit-events" && request.method === "GET") {
      await auditOutbox.flush().catch(() => {});
      await publicationAuditOutbox?.flush().catch(() => {});
      await organizationAuditOutbox?.flush().catch(() => {});
      if (url.searchParams.get("scope") === "organization") {
        if (actor.organizationRole !== "admin") throw new AuthError("Organization admin role is required", 403, "organization-admin-required");
        const events = (await auditRepository.list({ organizationId: actor.organizationId, limit: url.searchParams.get("limit") })).filter((event) => event.scope === "organization");
        return sendJson(response, 200, { events });
      }
      const projectId = url.searchParams.get("projectId") || null;
      if (projectId) {
        const project = await projectRepository.get(projectId);
        if (!project) return sendJson(response, 404, { error: "Project not found" });
        authorizeProject(project, actor, "read");
        return sendJson(response, 200, { events: await auditRepository.list({ organizationId: actor.organizationId, projectId, limit: url.searchParams.get("limit") }) });
      }
      const visibleProjectIds = new Set((await projectRepository.list()).filter((project) => projectAccessRole(project, actor)).map(({ id }) => id));
      const events = (await auditRepository.list({ organizationId: actor.organizationId, limit: url.searchParams.get("limit") })).filter(({ projectId: id }) => visibleProjectIds.has(id));
      return sendJson(response, 200, { events });
    }
    if (url.pathname === "/api/icons/search") {
      const limit = Math.max(1, Math.min(80, Number(url.searchParams.get("limit")) || 48));
      return sendJson(response, 200, { icons: await searchIcons(url.searchParams.get("q") || "", limit) });
    }
    if (url.pathname.startsWith("/api/icons/phosphor/")) {
      const name = decodeURIComponent(url.pathname.slice("/api/icons/phosphor/".length));
      const weight = url.searchParams.get("weight") || "regular";
      const svg = await resolveIcon(name, weight);
      return svg ? sendJson(response, 200, { name, weight, svg }) : sendJson(response, 404, { error: "Icon not found" });
    }
    if (url.pathname === "/api/charts/catalog") {
      return sendJson(response, 200, {
        charts: searchCharts(url.searchParams.get("q") || ""),
        palette: {
          version: dashboardPalette.version,
          categorical: dashboardPalette.categorical
        }
      });
    }
    if (url.pathname === "/api/components/catalog" && request.method === "GET") {
      return sendJson(response, 200, {
        version: 1,
        components: componentRegistry.filter(({ role }) => role !== "page-control"),
        controls: componentRegistry.filter(({ role }) => role === "page-control"),
        charts: chartCatalog
      });
    }
    if (url.pathname === "/api/design/standards" && request.method === "GET") {
      return sendJson(response, 200, designStandards);
    }
    if (url.pathname === "/api/charts/render" && request.method === "POST") {
      return sendJson(response, 200, { svg: renderChartSvg(await readJsonBody(request)) });
    }
    if (url.pathname === "/api/generation/health" && request.method === "GET") {
      const health = providerHealth(provider);
      return sendJson(response, health.status === "ok" ? 200 : 503, health);
    }
    if (url.pathname === "/api/generation/jobs" && request.method === "POST") {
      const body = await readJsonBody(request);
      const job = await generationJobService.create({ mode: body.mode, request: body.request, baseWorkspace: body.baseWorkspace, actor });
      return sendJson(response, 202, { job });
    }
    const generationJobCancel = url.pathname.match(/^\/api\/generation\/jobs\/([^/]+)\/cancel$/);
    if (generationJobCancel && request.method === "POST") {
      const job = await generationJobService.cancel(decodeURIComponent(generationJobCancel[1]), actor);
      return job ? sendJson(response, 200, { job }) : sendJson(response, 404, { error: "Generation job not found" });
    }
    const generationJobFeedback = url.pathname.match(/^\/api\/generation\/jobs\/([^/]+)\/feedback$/);
    if (generationJobFeedback && request.method === "POST") {
      const feedback = await generationJobService.feedback(decodeURIComponent(generationJobFeedback[1]), actor, await readJsonBody(request));
      return feedback ? sendJson(response, 200, { feedback }) : sendJson(response, 404, { error: "Generation job not found" });
    }
    const generationJobEvents = url.pathname.match(/^\/api\/generation\/jobs\/([^/]+)\/events$/);
    if (generationJobEvents && request.method === "GET") {
      return sendGenerationEventStream(request, response, generationJobService, decodeURIComponent(generationJobEvents[1]), actor);
    }
    const generationJobRead = url.pathname.match(/^\/api\/generation\/jobs\/([^/]+)$/);
    if (generationJobRead && request.method === "GET") {
      const job = await generationJobService.get(decodeURIComponent(generationJobRead[1]), actor);
      return job ? sendJson(response, 200, { job }) : sendJson(response, 404, { error: "Generation job not found" });
    }
    if (url.pathname === "/api/data-sources" && request.method === "GET") {
      const sources = (await dataSourceRepository.list()).filter((source) => {
        try { dataAccessPolicyService.scope(source, actor); return true; } catch { return false; }
      });
      return sendJson(response, 200, { dataSources: sources.map((source) => summarizeDataSource(source)) });
    }
    if (url.pathname === "/api/data-connectors" && request.method === "GET") {
      return sendJson(response, 200, { postgres: { configured: postgresConnector.configured, connectionRefs: postgresConnector.connectionRefs || [] } });
    }
    if (url.pathname === "/api/data-access-policies/status" && request.method === "GET") return sendJson(response, 200, dataAccessPolicyService.status(actor));
    if (url.pathname === "/api/jobs" && request.method === "GET") {
      const jobs = [];
      for (const job of await jobService.list()) {
        const source = await dataSourceRepository.get(job.datasetId);
        try { if (source) dataAccessPolicyService.scope(source, actor); else continue; } catch { continue; }
        jobs.push(job);
      }
      return sendJson(response, 200, { jobs });
    }
    if (url.pathname.startsWith("/api/jobs/") && url.pathname.endsWith("/cancel") && request.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/api/jobs/".length, -"/cancel".length));
      const current = await jobService.get(id);
      if (!current) return sendJson(response, 404, { error: "Job not found" });
      const source = await dataSourceRepository.get(current.datasetId);
      if (!source) return sendJson(response, 404, { error: "Job not found" });
      dataAccessPolicyService.scope(source, actor);
      const job = await jobService.cancel(id);
      return job ? sendJson(response, 200, { job }) : sendJson(response, 404, { error: "Job not found" });
    }
    if (url.pathname.startsWith("/api/jobs/") && request.method === "GET") {
      const job = await jobService.get(decodeURIComponent(url.pathname.slice("/api/jobs/".length)));
      if (job) {
        const source = await dataSourceRepository.get(job.datasetId);
        if (!source) return sendJson(response, 404, { error: "Job not found" });
        dataAccessPolicyService.scope(source, actor);
      }
      return job ? sendJson(response, 200, { job }) : sendJson(response, 404, { error: "Job not found" });
    }
    if (url.pathname === "/api/refresh-schedules" && request.method === "GET") {
      const schedules = [];
      for (const schedule of await refreshScheduleService.list()) {
        const source = await dataSourceRepository.get(schedule.datasetId);
        try { if (source) dataAccessPolicyService.scope(source, actor); else continue; } catch { continue; }
        schedules.push(schedule);
      }
      return sendJson(response, 200, { schedules });
    }
    if (url.pathname.startsWith("/api/refresh-schedules/") && url.pathname.endsWith("/disable") && request.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/api/refresh-schedules/".length, -"/disable".length));
      const current = (await refreshScheduleService.list()).find((schedule) => schedule.id === id);
      if (!current) return sendJson(response, 404, { error: "Refresh schedule not found" });
      const source = await dataSourceRepository.get(current.datasetId);
      if (!source) return sendJson(response, 404, { error: "Refresh schedule not found" });
      dataAccessPolicyService.scope(source, actor);
      const schedule = await refreshScheduleService.disable(id);
      return schedule ? sendJson(response, 200, { schedule }) : sendJson(response, 404, { error: "Refresh schedule not found" });
    }
    if (url.pathname === "/api/publications" && request.method === "GET") {
      const publications = await publicationRepository.list();
      const visible = [];
      for (const publication of publications) {
        const project = await projectRepository.get(publication.projectId);
        if (project && projectAccessRole(project, actor)) visible.push(publicationSummary(publication));
      }
      return sendJson(response, 200, { publications: visible });
    }
    if (url.pathname === "/api/publications" && request.method === "POST") {
      const body = await readJsonBody(request);
      const project = await projectRepository.get(body.projectId);
      if (!project) return sendJson(response, 404, { error: "Project not found" });
      authorizeProject(project, actor, "write");
      const revisionId = body.revisionId || project.currentRevisionId;
      const revision = project.revisions.find(({ id }) => id === revisionId);
      if (!revision) return sendJson(response, 404, { error: "Project revision not found" });
      const dataRefs = [...new Set(revision.workspace.document.sections.flatMap(({ components }) => components.map(({ dataRef }) => dataRef).filter(Boolean)))];
      const dataSources = (await Promise.all(dataRefs.map((id) => dataSourceRepository.get(id)))).filter(Boolean);
      const shareToken = body.visibility === "unlisted" ? createShareToken() : null;
      const now = new Date().toISOString();
      const requiresApproval = publicationApprovalPolicy.requiresApproval(actor);
      const publication = createPublication({ id: body.id, project, revisionId, dataSources, visibility: body.visibility, shareToken, status: requiresApproval ? "pending" : "published", approval: requiresApproval ? { requestedAt: now, requestedBy: actor.id } : null, renderChartSvg, now });
      await publicationRepository.put(publication, { outbox: ({ next }) => createAuditEvent({ action: requiresApproval ? "publication.submitted" : "publication.published", actor, projectId: next.projectId, organizationId: project.organizationId || actor.organizationId, details: { publicationId: next.id, revisionId: next.revisionId, visibility: next.access.visibility } }) });
      await publicationAuditOutbox?.flush().catch(() => {});
      const sharePath = body.visibility === "private" ? null : `/p/${encodeURIComponent(publication.id)}${shareToken ? `?token=${encodeURIComponent(shareToken)}` : ""}`;
      return sendJson(response, 201, { publication: publicationSummary(publication), freshness: publicationFreshness(publication, dataSources), ...(sharePath ? { share: { path: sharePath } } : {}) });
    }
    if (url.pathname === "/api/publication-access" && request.method === "GET") {
      const publicationId = url.searchParams.get("publicationId") || undefined;
      if (publicationId) {
        const publication = await publicationRepository.get(publicationId);
        if (!publication) return sendJson(response, 404, { error: "Publication not found" });
        authorizeProject(await projectRepository.get(publication.projectId), actor, "read");
        return sendJson(response, 200, { events: await publicationAccessRepository.list({ publicationId }) });
      }
      const visibleIds = new Set();
      for (const publication of await publicationRepository.list()) {
        const project = await projectRepository.get(publication.projectId);
        if (project && projectAccessRole(project, actor)) visibleIds.add(publication.id);
      }
      return sendJson(response, 200, { events: (await publicationAccessRepository.list()).filter(({ publicationId: id }) => visibleIds.has(id)) });
    }
    if (url.pathname.startsWith("/api/publications/") && url.pathname.endsWith("/artifact") && request.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/api/publications/".length, -"/artifact".length));
      const publication = await publicationRepository.get(id);
      if (!publication) return sendJson(response, 404, { error: "Publication not found" });
      authorizeProject(await projectRepository.get(publication.projectId), actor, "read");
      return publication.status === "revoked" ? sendJson(response, 410, { error: "Publication was revoked" }) : sendArtifact(response, publication.artifact);
    }
    if (url.pathname.startsWith("/api/publications/") && url.pathname.endsWith("/render") && request.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/api/publications/".length, -"/render".length));
      const publication = await publicationRepository.get(id);
      if (!publication) return sendJson(response, 404, { error: "Publication not found" });
      authorizeProject(await projectRepository.get(publication.projectId), actor, "read");
      if (publication.status === "revoked") return sendJson(response, 410, { error: "Publication was revoked" });
      return sendBinary(response, await publicationRenderer.render(publication.artifact, { format: url.searchParams.get("format") || "png", width: Number(url.searchParams.get("width")) || 1440 }));
    }
    if (url.pathname.startsWith("/api/publications/") && url.pathname.endsWith("/revoke") && request.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/api/publications/".length, -"/revoke".length));
      const current = await publicationRepository.get(id);
      if (!current) return sendJson(response, 404, { error: "Publication not found" });
      const project = await projectRepository.get(current.projectId);
      authorizeProject(project, actor, "write");
      const publication = await publicationRepository.update(id, { outbox: ({ next }) => createAuditEvent({ action: "publication.revoked", actor, projectId: next.projectId, organizationId: project.organizationId || actor.organizationId, details: { publicationId: next.id, revisionId: next.revisionId, visibility: next.access.visibility } }) }, (current) => revokePublication(current));
      await publicationAuditOutbox?.flush().catch(() => {});
      return sendJson(response, 200, { publication: publicationSummary(publication) });
    }
    if (url.pathname.startsWith("/api/publications/") && url.pathname.endsWith("/approve") && request.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/api/publications/".length, -"/approve".length));
      const current = await publicationRepository.get(id);
      if (!current) return sendJson(response, 404, { error: "Publication not found" });
      const project = await projectRepository.get(current.projectId);
      authorizeProject(project, actor, "read");
      if (actor.organizationRole !== "admin") throw new AuthError("Organization admin role is required", 403, "organization-admin-required");
      const publication = await publicationRepository.update(id, { outbox: ({ next }) => createAuditEvent({ action: "publication.approved", actor, projectId: next.projectId, organizationId: project.organizationId || actor.organizationId, details: { publicationId: next.id, revisionId: next.revisionId, visibility: next.access.visibility } }) }, (pending) => approvePublication(pending, { actorId: actor.id }));
      await publicationAuditOutbox?.flush().catch(() => {});
      const sources = (await Promise.all(publication.dataSnapshots.map(({ datasetId }) => dataSourceRepository.get(datasetId)))).filter(Boolean);
      return sendJson(response, 200, { publication: publicationSummary(publication), freshness: publicationFreshness(publication, sources) });
    }
    if (url.pathname.startsWith("/api/publications/") && request.method === "GET") {
      const publication = await publicationRepository.get(decodeURIComponent(url.pathname.slice("/api/publications/".length)));
      if (!publication) return sendJson(response, 404, { error: "Publication not found" });
      authorizeProject(await projectRepository.get(publication.projectId), actor, "read");
      const sources = (await Promise.all(publication.dataSnapshots.map(({ datasetId }) => dataSourceRepository.get(datasetId)))).filter(Boolean);
      return sendJson(response, 200, { publication: publicationSummary(publication), freshness: publicationFreshness(publication, sources) });
    }
    if (url.pathname.startsWith("/p/") && request.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/p/".length));
      const publication = await publicationRepository.get(id);
      if (!publication) return sendJson(response, 404, { error: "Publication not found" });
      const authorization = authorizePublicationAccess(publication, url.searchParams.get("token") || "");
      await publicationAccessRepository.append({ publicationId: publication.id, decision: authorization.allowed ? "allowed" : "denied", reason: authorization.reason, visibility: publication.access.visibility });
      if (!authorization.allowed) return sendJson(response, authorization.statusCode, { error: authorization.statusCode === 410 ? "Publication was revoked" : "Publication not found" });
      const rate = publicationRateLimiter.consume({ publicationId: publication.id, clientKey: request.socket.remoteAddress || "unknown" });
      if (!rate.allowed) {
        if (rate.shouldLog) await publicationAccessRepository.append({ publicationId: publication.id, decision: "denied", reason: "rate_limited", visibility: publication.access.visibility });
        return sendJson(response, 429, { error: "Too many publication requests" }, { "Retry-After": String(rate.retryAfterSeconds) });
      }
      return sendArtifact(response, publication.artifact, { disposition: "inline", cacheControl: publication.access.visibility === "public" ? "public, max-age=60" : "private, no-store" });
    }
    if (url.pathname.startsWith("/embed/") && request.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/embed/".length));
      const publication = await publicationRepository.get(id);
      if (!publication) return sendJson(response, 404, { error: "Publication not found" });
      const authorization = authorizePublicationAccess(publication, url.searchParams.get("token") || "");
      await publicationAccessRepository.append({ publicationId: publication.id, decision: authorization.allowed ? "allowed" : "denied", reason: authorization.reason, visibility: publication.access.visibility, channel: "embed" });
      if (!authorization.allowed) return sendJson(response, authorization.statusCode, { error: authorization.statusCode === 410 ? "Publication was revoked" : "Publication not found" });
      const rate = publicationRateLimiter.consume({ publicationId: publication.id, clientKey: request.socket.remoteAddress || "unknown" });
      if (!rate.allowed) {
        if (rate.shouldLog) await publicationAccessRepository.append({ publicationId: publication.id, decision: "denied", reason: "rate_limited", visibility: publication.access.visibility, channel: "embed" });
        return sendJson(response, 429, { error: "Too many publication requests" }, { "Retry-After": String(rate.retryAfterSeconds) });
      }
      return sendArtifact(response, publication.artifact, { disposition: "inline", cacheControl: "private, no-store", headers: { "Content-Security-Policy": "frame-ancestors *", "X-Content-Type-Options": "nosniff" } });
    }
    if (url.pathname === "/api/data-sources/import" && request.method === "POST") {
      const body = await readJsonBody(request, 4 * 1024 * 1024);
      const source = await parseUploadedDataSource(body);
      source.organizationId = actor.organizationId;
      source.ownerId = actor.id;
      const existing = await dataSourceRepository.get(source.id);
      if (existing) {
        dataAccessPolicyService.scope(existing, actor);
        throw new ContractError("Data source already exists", [{ path: "/id", code: "conflict", message: "Choose a new data source id" }]);
      }
      await dataSourceRepository.put(source);
      return sendJson(response, 201, { dataSource: summarizeDataSource(source, { includePreview: true }) });
    }
    if (url.pathname === "/api/data-sources/connect" && request.method === "POST") {
      const body = await readJsonBody(request);
      const source = body.connector?.type === "postgres"
        ? await postgresConnector.create({ ...body, now: new Date().toISOString() })
        : await restConnector.create({ ...body, now: new Date().toISOString() });
      source.organizationId = actor.organizationId;
      source.ownerId = actor.id;
      const existing = await dataSourceRepository.get(source.id);
      if (existing) {
        dataAccessPolicyService.scope(existing, actor);
        throw new ContractError("Data source already exists", [{ path: "/id", code: "conflict", message: "Choose a new data source id" }]);
      }
      await dataSourceRepository.put(source);
      return sendJson(response, 201, { dataSource: summarizeDataSource(source, { includePreview: true }) });
    }
    if (url.pathname.startsWith("/api/data-sources/") && url.pathname.endsWith("/schema") && request.method === "PATCH") {
      const id = decodeURIComponent(url.pathname.slice("/api/data-sources/".length, -"/schema".length));
      const body = await readJsonBody(request);
      if (!Object.hasOwn(body, "expectedUpdatedAt")) throw new ContractError("expectedUpdatedAt is required", [{ path: "/expectedUpdatedAt", code: "required", message: "Schema updates require optimistic concurrency" }]);
      const source = await dataSourceRepository.update(id, { expectedUpdatedAt: body.expectedUpdatedAt }, (current) => {
        dataAccessPolicyService.scope(current, actor);
        return updateDataSourceSchema(current, { ...body, now: new Date().toISOString() });
      });
      if (source) await queryCache.invalidateDataset(id);
      return source ? sendJson(response, 200, { dataSource: summarizeDataSource(source, { includePreview: true }) }) : sendJson(response, 404, { error: "Data source not found" });
    }
    if (url.pathname.startsWith("/api/data-sources/") && url.pathname.endsWith("/refresh") && request.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/api/data-sources/".length, -"/refresh".length));
      const body = await readJsonBody(request, 4 * 1024 * 1024);
      if (!Object.hasOwn(body, "expectedUpdatedAt")) throw new ContractError("expectedUpdatedAt is required", [{ path: "/expectedUpdatedAt", code: "required", message: "Refresh requires optimistic concurrency" }]);
      try {
        const source = await dataSourceRepository.update(id, { expectedUpdatedAt: body.expectedUpdatedAt }, (current) => {
          dataAccessPolicyService.scope(current, actor);
          return ["rest", "postgres"].includes(current.kind)
            ? (dataConnector || { refresh: (dataset, options) => dataset.kind === "postgres" ? postgresConnector.refresh(dataset, options) : restConnector.refresh(dataset, options) }).refresh(current, { now: new Date().toISOString() })
            : refreshUploadedDataSource(current, { ...body, now: new Date().toISOString() });
        });
        if (source) await queryCache.invalidateDataset(id);
        return source ? sendJson(response, 200, { dataSource: summarizeDataSource(source, { includePreview: true }) }) : sendJson(response, 404, { error: "Data source not found" });
      } catch (error) {
        if (error instanceof AuthError) throw error;
        if (!(error instanceof ContractError) || !error.issues.some(({ code }) => code === "stale")) {
          await dataSourceRepository.update(id, { expectedUpdatedAt: body.expectedUpdatedAt }, (current) => {
            dataAccessPolicyService.scope(current, actor);
            return markDataSourceRefreshFailed(current, error);
          }).catch(() => {});
        }
        throw error;
      }
    }
    if (url.pathname.startsWith("/api/data-sources/") && url.pathname.endsWith("/refresh-jobs") && request.method === "POST") {
      const datasetId = decodeURIComponent(url.pathname.slice("/api/data-sources/".length, -"/refresh-jobs".length));
      const source = await dataSourceRepository.get(datasetId);
      if (!source) return sendJson(response, 404, { error: "Data source not found" });
      dataAccessPolicyService.scope(source, actor);
      const body = await readJsonBody(request);
      return sendJson(response, 202, { job: await jobService.enqueue({ ...body, datasetId }) });
    }
    if (url.pathname.startsWith("/api/data-sources/") && url.pathname.endsWith("/refresh-schedule") && request.method === "PUT") {
      const datasetId = decodeURIComponent(url.pathname.slice("/api/data-sources/".length, -"/refresh-schedule".length));
      const source = await dataSourceRepository.get(datasetId);
      if (!source) return sendJson(response, 404, { error: "Data source not found" });
      dataAccessPolicyService.scope(source, actor);
      return sendJson(response, 200, { schedule: await refreshScheduleService.upsert({ ...(await readJsonBody(request)), datasetId }) });
    }
    if (url.pathname.startsWith("/api/data-sources/") && url.pathname.endsWith("/events") && request.method === "GET") {
      const datasetId = decodeURIComponent(url.pathname.slice("/api/data-sources/".length, -"/events".length));
      return sendDatasetEventStream(request, response, dataSourceRepository, dataAccessPolicyService, datasetId, actor);
    }
    if (url.pathname.startsWith("/api/data-sources/") && url.pathname.endsWith("/query") && request.method === "POST") {
      const id = decodeURIComponent(url.pathname.slice("/api/data-sources/".length, -"/query".length));
      const source = await dataSourceRepository.get(id);
      if (!source) return sendJson(response, 404, { error: "Data source not found" });
      const scoped = dataAccessPolicyService.scope(source, actor);
      return sendJson(response, 200, await queryCache.execute(scoped.source, await readJsonBody(request), { scopeKey: scoped.access.scopeKey }));
    }
    if (url.pathname.startsWith("/api/data-sources/") && request.method === "GET") {
      const suffix = decodeURIComponent(url.pathname.slice("/api/data-sources/".length));
      const preview = suffix.endsWith("/preview");
      const id = preview ? suffix.slice(0, -"/preview".length) : suffix;
      const source = await dataSourceRepository.get(id);
      if (!source) return sendJson(response, 404, { error: "Data source not found" });
      const scoped = dataAccessPolicyService.scope(source, actor);
      return sendJson(response, 200, { dataSource: summarizeDataSource(scoped.source, { includePreview: preview }) });
    }
    if (url.pathname === "/api/projects" && request.method === "GET") {
      const includeArchived = url.searchParams.get("includeArchived") === "true";
      const projects = (await projectRepository.list()).filter((project) => projectAccessRole(project, actor) && (includeArchived || project.status !== "archived"));
      return sendJson(response, 200, { projects: projects.map(({ access, ...project }) => ({ ...project, accessRole: projectAccessRole({ ...project, access }, actor) })) });
    }
    if (url.pathname.startsWith("/api/projects/") && url.pathname.endsWith("/copy") && request.method === "POST") {
      const sourceId = decodeURIComponent(url.pathname.slice("/api/projects/".length, -"/copy".length));
      const source = await projectRepository.get(sourceId);
      if (!source) return sendJson(response, 404, { error: "Project not found" });
      authorizeProject(source, actor, "read");
      const body = await readJsonBody(request);
      if (await projectRepository.get(body.id)) throw new ContractError("Project id already exists", [{ path: "/id", code: "conflict", message: "Choose another project id" }]);
      const project = copyProject(source, { id: body.id, name: body.name, ownerId: actor.id, organizationId: actor.organizationId, revisionId: body.revisionId });
      const stored = await projectRepository.update(project.id, {
        expectedRevisionId: null,
        seed: project,
        uniqueName: { organizationId: actor.organizationId },
        outbox: ({ next }) => createAuditEvent({ action: "project.copied", actor, projectId: next.id, organizationId: next.organizationId, details: { sourceProjectId: source.id, sourceRevisionId: body.revisionId || source.currentRevisionId } })
      }, (seed) => seed);
      await auditOutbox.flush().catch(() => {});
      return sendJson(response, 201, { project: stored, accessRole: projectAccessRole(stored, actor) });
    }
    if (url.pathname.startsWith("/api/projects/") && url.pathname.endsWith("/report-copy") && request.method === "POST") {
      const sourceId = decodeURIComponent(url.pathname.slice("/api/projects/".length, -"/report-copy".length));
      const source = await projectRepository.get(sourceId);
      if (!source) return sendJson(response, 404, { error: "Project not found" });
      authorizeProject(source, actor, "read");
      const body = await readJsonBody(request);
      if (await projectRepository.get(body.id)) throw new ContractError("Project id already exists", [{ path: "/id", code: "conflict", message: "Choose another project id" }]);
      const project = await createReportProjectCopy(source, {
        id: body.id,
        name: body.name,
        ownerId: actor.id,
        organizationId: actor.organizationId,
        revisionId: body.revisionId,
        resolveDataset: async (datasetId) => {
          const dataset = await dataSourceRepository.get(datasetId);
          return dataset ? dataAccessPolicyService.scope(dataset, actor).source : null;
        }
      });
      const stored = await projectRepository.update(project.id, {
        expectedRevisionId: null,
        seed: project,
        uniqueName: { organizationId: actor.organizationId },
        outbox: ({ next }) => createAuditEvent({ action: "project.report-created", actor, projectId: next.id, organizationId: next.organizationId, details: { sourceProjectId: source.id, sourceRevisionId: body.revisionId || source.currentRevisionId } })
      }, (seed) => seed);
      await auditOutbox.flush().catch(() => {});
      return sendJson(response, 201, { project: stored, accessRole: projectAccessRole(stored, actor) });
    }
    if (url.pathname.startsWith("/api/projects/") && url.pathname.endsWith("/access") && request.method === "PUT") {
      const projectId = decodeURIComponent(url.pathname.slice("/api/projects/".length, -"/access".length));
      const existing = await projectRepository.get(projectId);
      if (!existing) return sendJson(response, 404, { error: "Project not found" });
      authorizeProject(existing, actor, "manage");
      const body = await readJsonBody(request);
      if (!body.expectedUpdatedAt) throw new ContractError("expectedUpdatedAt is required", [{ path: "/expectedUpdatedAt", code: "required", message: "Access updates require optimistic concurrency" }]);
      const directoryIds = new Set((await authService.directory(actor)).map(({ id }) => id));
      const requestedIds = [body.ownerId, ...(body.members || []).map(({ actorId }) => actorId)].filter(Boolean);
      if (requestedIds.some((id) => !directoryIds.has(id))) throw new ContractError("Project member is outside the organization", [{ path: "/members", code: "reference", message: "Choose identities from the current organization" }]);
      const project = await projectRepository.update(projectId, {
        expectedUpdatedAt: body.expectedUpdatedAt,
        outbox: ({ next }) => createAuditEvent({ action: "project.access.updated", actor, projectId: next.id, organizationId: next.organizationId || actor.organizationId, details: { ownerId: next.access.ownerId, members: next.access.members.map(({ actorId, role }) => ({ actorId, role })) } })
      }, (current) => updateProjectAccess(current, body));
      await auditOutbox.flush().catch(() => {});
      return sendJson(response, 200, { project, accessRole: projectAccessRole(project, actor) });
    }
    if (url.pathname.startsWith("/api/projects/") && request.method === "DELETE") {
      const projectId = decodeURIComponent(url.pathname.slice("/api/projects/".length));
      const existing = await projectRepository.get(projectId);
      if (!existing) return sendJson(response, 404, { error: "Project not found" });
      authorizeProject(existing, actor, "manage");
      const body = await readJsonBody(request);
      for (const publication of (await publicationRepository.list()).filter((item) => item.projectId === projectId && item.status !== "revoked")) {
        await publicationRepository.update(publication.id, {
          outbox: ({ next }) => createAuditEvent({ action: "publication.revoked", actor, projectId, organizationId: existing.organizationId || actor.organizationId, details: { publicationId: next.id, reason: "project-deleted" } })
        }, (current) => revokePublication(current));
      }
      const deleted = await projectRepository.remove(projectId, { expectedUpdatedAt: body.expectedUpdatedAt });
      await auditRepository.append(createAuditEvent({ action: "project.deleted", actor, projectId: deleted.id, organizationId: deleted.organizationId || actor.organizationId, details: { name: deleted.name } })).catch(() => {});
      return sendJson(response, 200, { deleted: { id: deleted.id, name: deleted.name } });
    }
    if (url.pathname.startsWith("/api/projects/") && request.method === "PATCH") {
      const projectId = decodeURIComponent(url.pathname.slice("/api/projects/".length));
      const existing = await projectRepository.get(projectId);
      if (!existing) return sendJson(response, 404, { error: "Project not found" });
      const body = await readJsonBody(request);
      authorizeProject(existing, actor, body.status !== undefined ? "manage" : "write");
      if (!body.expectedUpdatedAt) throw new ContractError("expectedUpdatedAt is required", [{ path: "/expectedUpdatedAt", code: "required", message: "Metadata updates require optimistic concurrency" }]);
      const action = body.status === "archived" ? "project.archived" : body.status === "active" ? "project.restored" : "project.renamed";
      const project = await projectRepository.update(projectId, {
        expectedUpdatedAt: body.expectedUpdatedAt,
        uniqueName: body.name !== undefined ? { organizationId: existing.organizationId || actor.organizationId } : null,
        outbox: ({ next }) => createAuditEvent({ action, actor, projectId: next.id, organizationId: next.organizationId || actor.organizationId, details: body.name !== undefined ? { name: next.name } : { status: next.status } })
      }, (current) => updateProjectMetadata(current, body));
      await auditOutbox.flush().catch(() => {});
      return sendJson(response, 200, { project, accessRole: projectAccessRole(project, actor) });
    }
    if (url.pathname.startsWith("/api/projects/") && url.pathname.endsWith("/revisions") && request.method === "POST") {
      const projectId = decodeURIComponent(url.pathname.slice("/api/projects/".length, -"/revisions".length));
      const body = await readJsonBody(request);
      if (!Object.hasOwn(body, "expectedRevisionId")) throw new ContractError("expectedRevisionId is required", [{ path: "/expectedRevisionId", code: "required", message: "Manual revision writes require optimistic concurrency" }]);
      const existing = await projectRepository.get(projectId);
      if (existing) authorizeProject(existing, actor, "write");
      const seed = existing || (body.expectedRevisionId === null ? createProject({ id: projectId, name: body.projectName || body.workspace?.document?.title || "未命名项目", ownerId: actor.id, organizationId: actor.organizationId }) : null);
      if (!seed) return sendJson(response, 404, { error: "Project not found" });
      const project = await projectRepository.update(projectId, {
        expectedRevisionId: body.expectedRevisionId,
        seed,
        uniqueName: !existing ? { organizationId: actor.organizationId } : null,
        outbox: !existing ? ({ next }) => createAuditEvent({ action: "project.created", actor, projectId: next.id, organizationId: next.organizationId || actor.organizationId, details: { source: "manual" } }) : null
      }, (projectBase) => appendProjectRevision(projectBase, {
        id: body.revisionId,
        createdAt: new Date().toISOString(),
        source: "user",
        parentRevisionId: projectBase.currentRevisionId || undefined,
        summary: body.summary || "保存手工修改",
        workspace: body.workspace
      }));
      if (!existing) await auditOutbox.flush().catch(() => {});
      return sendJson(response, 201, { project, revision: project.revisions.at(-1) });
    }
    if (url.pathname.startsWith("/api/projects/") && url.pathname.endsWith("/migrate") && request.method === "POST") {
      const projectId = decodeURIComponent(url.pathname.slice("/api/projects/".length, -"/migrate".length));
      const { project } = await readJsonBody(request);
      assertProject(project);
      if (project.id !== projectId) throw new ContractError("Project identity does not match migration target");
      const existing = await projectRepository.get(projectId);
      if (existing) authorizeProject(existing, actor, "write");
      else {
        project.access = { ownerId: actor.id, members: [] };
        project.organizationId = actor.organizationId;
      }
      const stored = await projectRepository.update(projectId, {
        expectedRevisionId: null,
        seed: project,
        outbox: !existing ? ({ next }) => createAuditEvent({ action: "project.created", actor, projectId: next.id, organizationId: next.organizationId || actor.organizationId, details: { source: "migration" } }) : null
      }, (seed) => seed);
      if (!existing) await auditOutbox.flush().catch(() => {});
      return sendJson(response, 201, { project: stored, migrated: true });
    }
    if (url.pathname.startsWith("/api/projects/") && url.pathname.endsWith("/export") && request.method === "POST") {
      const projectId = decodeURIComponent(url.pathname.slice("/api/projects/".length, -"/export".length));
      const project = await projectRepository.get(projectId);
      if (!project) return sendJson(response, 404, { error: "Project not found" });
      authorizeProject(project, actor, "read");
      const { revisionId } = await readJsonBody(request);
      return sendArtifact(response, exportProjectRevision(project, revisionId || project.currentRevisionId, { renderChartSvg }));
    }
    if (url.pathname.startsWith("/api/projects/") && request.method === "GET") {
      const project = await projectRepository.get(decodeURIComponent(url.pathname.slice("/api/projects/".length)));
      if (!project) return sendJson(response, 404, { error: "Project not found" });
      return sendJson(response, 200, { project: (authorizeProject(project, actor, "read"), project), accessRole: projectAccessRole(project, actor) });
    }
    if (url.pathname === "/api/generation/draft" && request.method === "POST") {
      const { request: generationRequest, baseWorkspace } = await readJsonBody(request);
      const resolved = await resolveGenerationData(generationRequest, dataSourceRepository, actor, dataAccessPolicyService);
      const run = await runGenerationWithProvider(provider, { mode: "draft", request: resolved.request, baseWorkspace, dataContexts: resolved.dataContexts, providerContext: { organizationId: actor.organizationId } });
      return sendJson(response, run.status === "preview-ready" ? 200 : run.error?.httpStatus || 422, { run });
    }
    if (url.pathname === "/api/generation/refine" && request.method === "POST") {
      const { request: generationRequest, baseWorkspace } = await readJsonBody(request);
      const run = await runGenerationWithProvider(provider, { mode: "refine", request: generationRequest, baseWorkspace, providerContext: { organizationId: actor.organizationId } });
      return sendJson(response, run.status === "preview-ready" ? 200 : run.error?.httpStatus || 422, { run });
    }
    if (url.pathname === "/api/generation/commit" && request.method === "POST") {
      const body = await readJsonBody(request);
      const { run, revisionId, project: existingProject } = body;
      if (existingProject) assertProject(existingProject);
      const id = body.projectId || existingProject?.id || `project-${run.request.id}`;
      const storedProject = await projectRepository.get(id);
      if (storedProject) authorizeProject(storedProject, actor, "write");
      const seed = storedProject || existingProject || createProject({ id, name: run.bundle.plan.title, ownerId: actor.id, organizationId: actor.organizationId, createdAt: new Date().toISOString() });
      if (!storedProject && !seed.access?.ownerId) seed.access = { ownerId: actor.id, members: [] };
      if (!storedProject && !seed.organizationId) seed.organizationId = actor.organizationId;
      const committed = commitGenerationPreview(run, { revisionId });
      const expectedRevisionId = Object.hasOwn(body, "expectedRevisionId") ? body.expectedRevisionId : existingProject?.currentRevisionId ?? null;
      const project = await projectRepository.update(id, {
        expectedRevisionId,
        seed,
        uniqueName: !storedProject ? { organizationId: actor.organizationId } : null,
        outbox: !storedProject ? ({ next }) => createAuditEvent({ action: "project.created", actor, projectId: next.id, organizationId: next.organizationId || actor.organizationId, details: { source: "agent" } }) : null
      }, (projectBase) => {
        if (projectBase.currentRevisionId) committed.revision.parentRevisionId = projectBase.currentRevisionId;
        return appendProjectRevision(projectBase, committed.revision);
      });
      if (!storedProject) await auditOutbox.flush().catch(() => {});
      return sendJson(response, 200, { run: committed, revision: committed.revision, project });
    }
    if (url.pathname === "/api/generation/undo" && request.method === "POST") {
      const { project, projectId: requestedId, revisionId, currentWorkspace, undoRevisionId } = await readJsonBody(request);
      if (project) assertProject(project);
      const id = requestedId || project?.id;
      const existing = await projectRepository.get(id);
      if (existing) authorizeProject(existing, actor, "write");
      const result = await projectRepository.update(id, { expectedRevisionId: revisionId, seed: project }, (stored) =>
        undoProjectRevision(stored, { revisionId, currentWorkspace, undoRevisionId }).project
      );
      return sendJson(response, 200, { project: result, revision: result.revisions.at(-1), workspace: result.revisions.at(-1).workspace });
    }
    if (url.pathname === "/api/generation/history" && request.method === "POST") {
      const { project, projectId: requestedId } = await readJsonBody(request);
      const stored = requestedId || project?.id ? await projectRepository.get(requestedId || project.id) : null;
      const source = stored || project;
      assertProject(source);
      authorizeProject(source, actor, "read");
      return sendJson(response, 200, { projectId: source.id, currentRevisionId: source.currentRevisionId, revisions: projectRevisionSummary(source) });
    }
    if (url.pathname === "/api/generation/restore" && request.method === "POST") {
      const { project, projectId: requestedId, revisionId, currentWorkspace, restoreRevisionId } = await readJsonBody(request);
      if (project) assertProject(project);
      const id = requestedId || project?.id;
      const existing = await projectRepository.get(id);
      if (existing) authorizeProject(existing, actor, "write");
      const expectedRevisionId = project?.currentRevisionId;
      const result = await projectRepository.update(id, { expectedRevisionId, seed: project }, (stored) =>
        restoreProjectRevisionAsNew(stored, { revisionId, currentWorkspace, restoreRevisionId }).project
      );
      return sendJson(response, 200, { project: result, revision: result.revisions.at(-1), workspace: result.revisions.at(-1).workspace });
    }
    await serveStatic(response, url.pathname, studioWebRoot);
  } catch (error) {
    sendJson(response, errorStatus(error), {
      error: error.message || "Internal server error",
      ...((error instanceof AuthError || error instanceof ProviderError) && error.code ? { code: error.code } : {}),
      ...(error instanceof ContractError && error.issues.length ? { issues: error.issues } : {})
    });
  }
}

export function createPreviewServer({ provider = defaultProvider, projectRepository = defaultProjectRepository, dataSourceRepository = defaultDataSourceRepository, publicationRepository = defaultPublicationRepository, publicationAccessRepository = defaultPublicationAccessRepository, publicationRateLimiter = defaultPublicationRateLimiter, publicationApprovalPolicy = defaultPublicationApprovalPolicy, publicationRenderer = defaultPublicationRenderer, authService = defaultAuthService, oidcProviderService = authService === defaultAuthService ? defaultOidcProviderService : null, externalIdentityRepository = authService === defaultAuthService ? defaultExternalIdentityRepository : null, organizationRepository = defaultOrganizationRepository, organizationService = authService === defaultAuthService ? defaultOrganizationService : null, auditRepository = null, auditAnchorDispatcher = null, storageProvider = "file", storageCapabilities, queryCache = defaultQueryCache, dataAccessPolicyService = defaultDataAccessPolicyService, restConnector = defaultRestConnector, postgresConnector = defaultPostgresConnector, dataConnector = null, jobRepository = defaultJobRepository, jobService, generationJobService, refreshScheduleRepository = defaultRefreshScheduleRepository, refreshScheduleService, studioWebRoot = null, publicOrigin = null } = {}) {
  const activeOrganizationService = organizationService || (authService === defaultAuthService ? defaultOrganizationService : null);
  const leaseDurationMs = Math.max(5_000, Number(process.env.DASHBOARD_REFRESH_LEASE_MS) || 30_000);
  const activeDataConnector = dataConnector || { refresh(source, options) { return source.kind === "postgres" ? postgresConnector.refresh(source, options) : restConnector.refresh(source, options); } };
  const activeJobService = jobService || createRefreshJobService({ jobRepository, dataSourceRepository, restConnector: activeDataConnector, queryCache, baseDelayMs: Number(process.env.DASHBOARD_REFRESH_RETRY_BASE_MS) || 1_000, leaseDurationMs });
  const activeGenerationJobService = generationJobService || createGenerationJobService({
    jobRepository,
    provider,
    resolveData: (request, actor) => resolveGenerationData(request, dataSourceRepository, actor, dataAccessPolicyService),
    maximumDurationMs: Number(process.env.DASHBOARD_AI_TIMEOUT_MS) || 300_000
  });
  const activeRefreshScheduleService = refreshScheduleService || createRefreshScheduleService({ scheduleRepository: refreshScheduleRepository, dataSourceRepository, jobService: activeJobService, leaseDurationMs });
  const activeAuditRepository = auditRepository || (projectRepository === defaultProjectRepository ? defaultAuditRepository : createAuditRepository({ directory: path.join(path.dirname(projectRepository.directory), "audit") }));
  const baseAuditOutbox = projectRepository === defaultProjectRepository && activeAuditRepository === defaultAuditRepository ? defaultAuditOutbox : createAuditOutboxDispatcher({ projectRepository, auditRepository: activeAuditRepository });
  const activeAuditOutbox = auditAnchorDispatcher ? Object.freeze({ async flush() { const result = await baseAuditOutbox.flush(); await auditAnchorDispatcher.flush().catch(() => {}); return result; } }) : baseAuditOutbox;
  const publicationAuditRepository = auditAnchorDispatcher ? Object.freeze({
    async append(event) {
      const stored = await activeAuditRepository.append(event);
      await auditAnchorDispatcher.flush().catch(() => {});
      return stored;
    }
  }) : activeAuditRepository;
  const activePublicationAuditOutbox = createPublicationAuditOutboxDispatcher({ publicationRepository, auditRepository: publicationAuditRepository });
  const activeOrganizationAuditOutbox = organizationRepository?.listOutbox ? createOrganizationAuditOutboxDispatcher({ organizationRepository, auditRepository: activeAuditRepository }) : null;
  const activeOrganizationSessionRevocationOutbox = organizationRepository?.listSessionRevocations ? (authService === defaultAuthService && organizationRepository === defaultOrganizationRepository ? defaultOrganizationSessionRevocationOutbox : createOrganizationSessionRevocationOutboxDispatcher({ organizationRepository, authService })) : null;
  const storageRuntime = createStorageRuntime({
    provider: storageProvider,
    capabilities: storageCapabilities,
    repositories: { projects: projectRepository, dataSources: dataSourceRepository, publications: publicationRepository, publicationAccess: publicationAccessRepository, jobs: jobRepository, refreshSchedules: refreshScheduleRepository, organizations: organizationRepository, audit: activeAuditRepository }
  });
  activeJobService.resume().catch(() => {});
  activeGenerationJobService.resume().catch(() => {});
  activeRefreshScheduleService.resume().catch(() => {});
  activeAuditOutbox.flush().catch(() => {});
  activePublicationAuditOutbox.flush().catch(() => {});
  activeOrganizationAuditOutbox?.flush().catch(() => {});
  activeOrganizationSessionRevocationOutbox?.flush().catch(() => {});
  const resolvedStudioWebRoot = studioWebRoot ? path.resolve(studioWebRoot) : null;
  const resolvedPublicOrigin = normalizePublicOrigin(publicOrigin);
  return http.createServer((request, response) => handlePreviewRequest(request, response, { provider, projectRepository, dataSourceRepository, publicationRepository, publicationAccessRepository, publicationRateLimiter, publicationApprovalPolicy, publicationRenderer, authService, oidcProviderService, externalIdentityRepository, organizationService: activeOrganizationService, auditRepository: activeAuditRepository, auditOutbox: activeAuditOutbox, publicationAuditOutbox: activePublicationAuditOutbox, auditAnchorDispatcher, organizationAuditOutbox: activeOrganizationAuditOutbox, organizationSessionRevocationOutbox: activeOrganizationSessionRevocationOutbox, storageRuntime, queryCache, dataAccessPolicyService, restConnector, postgresConnector, dataConnector: activeDataConnector, jobService: activeJobService, generationJobService: activeGenerationJobService, refreshScheduleService: activeRefreshScheduleService, studioWebRoot: resolvedStudioWebRoot, publicOrigin: resolvedPublicOrigin }));
}

export function startPreviewServer({ listenPort = port, listenHost = host, silent = false, provider = defaultProvider, projectRepository = defaultProjectRepository, dataSourceRepository = defaultDataSourceRepository, publicationRepository = defaultPublicationRepository, publicationAccessRepository = defaultPublicationAccessRepository, publicationRateLimiter = defaultPublicationRateLimiter, publicationApprovalPolicy = defaultPublicationApprovalPolicy, publicationRenderer = defaultPublicationRenderer, authService = defaultAuthService, oidcProviderService = authService === defaultAuthService ? defaultOidcProviderService : null, externalIdentityRepository = authService === defaultAuthService ? defaultExternalIdentityRepository : null, organizationRepository = defaultOrganizationRepository, organizationService = null, auditRepository = null, auditAnchorDispatcher = null, storageProvider = "file", storageCapabilities, queryCache = defaultQueryCache, dataAccessPolicyService = defaultDataAccessPolicyService, restConnector = defaultRestConnector, postgresConnector = defaultPostgresConnector, dataConnector = null, jobRepository = defaultJobRepository, jobService, generationJobService, refreshScheduleRepository = defaultRefreshScheduleRepository, refreshScheduleService, studioWebRoot = null, publicOrigin = null } = {}) {
  const server = createPreviewServer({ provider, projectRepository, dataSourceRepository, publicationRepository, publicationAccessRepository, publicationRateLimiter, publicationApprovalPolicy, publicationRenderer, authService, oidcProviderService, externalIdentityRepository, organizationRepository, organizationService, auditRepository, auditAnchorDispatcher, storageProvider, storageCapabilities, queryCache, dataAccessPolicyService, restConnector, postgresConnector, dataConnector, jobRepository, jobService, generationJobService, refreshScheduleRepository, refreshScheduleService, studioWebRoot, publicOrigin });
  server.listen(listenPort, listenHost, () => {
    if (silent) return;
    const address = server.address();
    const activePort = typeof address === "object" && address ? address.port : listenPort;
    console.log(`Dashboard Studio: http://${listenHost}:${activePort}/studio/projects?design=1`);
    console.log(`Phosphor icons indexed: ${iconNames.length}`);
    console.log(`ECharts render types: ${chartCatalog.map(({ type }) => type).join(", ")}`);
    const health = providerHealth(provider);
    console.log(`AI provider: ${health.provider}${health.model ? ` (${health.model})` : ""}${health.configured ? "" : " [not configured]"}`);
  });
  return server;
}

async function startConfiguredPreviewServer() {
  const storageProvider = process.env.DASHBOARD_STORAGE_PROVIDER || "file";
  const studioWebRoot = process.env.DASHBOARD_STUDIO_WEB_ROOT || null;
  const publicOrigin = normalizePublicOrigin(process.env.DASHBOARD_PUBLIC_ORIGIN);
  if (storageProvider === "file") return startPreviewServer({ studioWebRoot, publicOrigin });
  if (storageProvider !== "postgresql") throw new Error(`Unsupported storage provider: ${storageProvider}`);
  const storage = await createPostgresStorage({ connectionString: process.env.DASHBOARD_DATABASE_URL, max: Math.max(2, Number(process.env.DASHBOARD_DATABASE_POOL_MAX) || 10), auditHmacKey: process.env.DASHBOARD_AUDIT_HMAC_KEY || null });
  const organizationService = createOrganizationService({ repository: storage.repositories.organizations, identities: configuredOrganizationIdentities() });
  const authService = configuredAuthService(storage.repositories.sessions, storage.repositories.organizations, organizationService);
  const oidcProviderService = createConfiguredOidcProviderService({ authService, externalIdentityRepository: storage.repositories.externalIdentities, organizationService });
  const auditAnchorSink = createConfiguredAuditAnchorSink();
  const auditAnchorDispatcher = auditAnchorSink ? createAuditAnchorDispatcher({ auditRepository: storage.repositories.audit, sink: auditAnchorSink, maxAttempts: Number(process.env.DASHBOARD_AUDIT_ANCHOR_MAX_ATTEMPTS) || 8 }) : null;
  const server = startPreviewServer({
    storageProvider: storage.provider,
    storageCapabilities: storage.capabilities,
    projectRepository: storage.repositories.projects,
    dataSourceRepository: storage.repositories.dataSources,
    publicationRepository: storage.repositories.publications,
    publicationAccessRepository: storage.repositories.publicationAccess,
    jobRepository: storage.repositories.jobs,
    refreshScheduleRepository: storage.repositories.refreshSchedules,
    organizationRepository: storage.repositories.organizations,
    auditRepository: storage.repositories.audit,
    auditAnchorDispatcher,
    authService,
    oidcProviderService,
    externalIdentityRepository: storage.repositories.externalIdentities,
    organizationService,
    queryCache: createSemanticQueryCache({ ttlMs: Math.max(1_000, Number(process.env.DASHBOARD_QUERY_CACHE_TTL_MS) || 30_000), maxEntries: Math.max(10, Number(process.env.DASHBOARD_QUERY_CACHE_MAX_ENTRIES) || 100), store: storage.queryCache }),
    studioWebRoot,
    publicOrigin
  });
  server.once("close", () => storage.close().catch(() => {}));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await startConfiguredPreviewServer();
