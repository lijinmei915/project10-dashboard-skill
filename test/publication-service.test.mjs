import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseDataSource } from "../.agents/skills/dashboard-html/scripts/data-source-service.mjs";
import { appendProjectRevision, createProject } from "../.agents/skills/dashboard-html/scripts/project-store.mjs";
import { approvePublication, authorizePublicationAccess, createPublication, publicationFreshness, publicationSummary } from "../.agents/skills/dashboard-html/scripts/publication-service.mjs";
import { createPublicationApprovalPolicy } from "../.agents/skills/dashboard-html/scripts/publication-approval-policy.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createDataSourceRepository } from "../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";
import { createProjectRepository } from "../.agents/skills/dashboard-html/scripts/studio-project-repository.mjs";
import { createPublicationRepository } from "../.agents/skills/dashboard-html/scripts/studio-publication-repository.mjs";
import { createPublicationAccessRepository } from "../.agents/skills/dashboard-html/scripts/studio-publication-access-repository.mjs";
import { createPublicationRateLimiter } from "../.agents/skills/dashboard-html/scripts/publication-rate-limiter.mjs";
import { createOrganizationRepository } from "../.agents/skills/dashboard-html/scripts/studio-organization-repository.mjs";
import { createOrganizationService } from "../.agents/skills/dashboard-html/scripts/organization-service.mjs";
import { createStudioAuthService } from "../.agents/skills/dashboard-html/scripts/studio-auth-service.mjs";
import { createAuditRepository } from "../.agents/skills/dashboard-html/scripts/studio-audit-repository.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/sales-dashboard-generation.json", import.meta.url), "utf8"));
const csv = "月份,收入\n2026-01,1200\n2026-02,1800";

test("creates immutable publication metadata without exposing artifact HTML", () => {
  const project = appendProjectRevision(createProject({ id: "publication-project", name: "发布项目", createdAt: "2026-08-10T05:00:00.000Z" }), { id: "revision-published", createdAt: "2026-08-10T05:00:01.000Z", source: "agent", workspace: fixture.workspace });
  const source = parseDataSource({ id: "sample-sales", name: "销售数据", format: "csv", content: csv, now: "2026-08-10T05:00:00.000Z" });
  const publication = createPublication({ id: "publication-fixed", project, dataSources: [source], visibility: "private", renderChartSvg: () => '<svg width="640" height="220"><path d="M0 0H10"/></svg>', now: "2026-08-10T05:00:02.000Z" });
  assert.equal(publication.revisionId, "revision-published");
  assert.equal(publication.dataSnapshots[0].datasetFingerprint, source.fingerprint);
  assert.equal(publication.dataSnapshots[0].querySnapshots.totals.rows[0][0], 3000);
  assert.match(publication.artifact.html, /^<!DOCTYPE html>/);
  assert.match(publication.artifact.html, /data-chart-renderer="echarts-ssr"/);
  const summary = publicationSummary(publication);
  assert.equal(summary.artifact.sha256, publication.artifact.sha256);
  assert.equal(Object.hasOwn(summary.artifact, "html"), false);
  assert.equal(publicationFreshness(publication, [source]).status, "current");
  assert.equal(publicationFreshness(publication, [{ ...source, fingerprint: `${source.fingerprint}-new` }]).status, "stale");
  assert.equal(publicationFreshness(publication, []).status, "missing");
  const unlisted = createPublication({ id: "publication-unlisted", project, dataSources: [source], visibility: "unlisted", shareToken: "one-time-secret", now: "2026-08-10T05:00:03.000Z" });
  assert.equal(authorizePublicationAccess(unlisted, "one-time-secret").allowed, true);
  assert.equal(authorizePublicationAccess(unlisted, "wrong-secret").allowed, false);
  assert.equal(publicationSummary(unlisted).access.protected, true);
  assert.equal(JSON.stringify(publicationSummary(unlisted)).includes("one-time-secret"), false);
  assert.equal(JSON.stringify(publicationSummary(unlisted)).includes("tokenHash"), false);
});

test("keeps pending publications private until an organization admin approves", () => {
  const project = appendProjectRevision(createProject({ id: "pending-publication-project", name: "待审批发布", ownerId: "editor", organizationId: "org-approval", createdAt: "2026-08-11T05:00:00.000Z" }), { id: "revision-pending", createdAt: "2026-08-11T05:00:01.000Z", source: "agent", workspace: fixture.workspace });
  const publication = createPublication({ id: "publication-pending", project, visibility: "public", status: "pending", approval: { requestedAt: "2026-08-11T05:00:02.000Z", requestedBy: "editor" }, now: "2026-08-11T05:00:02.000Z" });
  assert.deepEqual(authorizePublicationAccess(publication), { allowed: false, statusCode: 404, reason: "pending" });
  const summary = publicationSummary(publication);
  assert.equal(summary.approval.requestedAt, "2026-08-11T05:00:02.000Z");
  assert.equal(JSON.stringify(summary).includes("editor"), false);
  const approved = approvePublication(publication, { actorId: "admin", now: "2026-08-11T05:00:03.000Z" });
  assert.equal(approved.status, "published");
  assert.equal(authorizePublicationAccess(approved).allowed, true);
  assert.equal(JSON.stringify(publicationSummary(approved)).includes("admin"), false);
  assert.throws(() => approvePublication(approved, { actorId: "admin" }), /not pending approval/);
});

test("requires organization-admin approval before configured publications can be shared", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-publication-approval-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRepository = createProjectRepository({ directory: path.join(root, "projects") });
  const dataSourceRepository = createDataSourceRepository({ directory: path.join(root, "datasets") });
  const publicationRepository = createPublicationRepository({ directory: path.join(root, "publications") });
  const publicationAccessRepository = createPublicationAccessRepository({ directory: path.join(root, "publication-access") });
  const auditRepository = createAuditRepository({ directory: path.join(root, "audit") });
  const identities = [
    { id: "approval-admin", name: "Approval Admin", role: "admin", token: "approval-admin-token", organizationId: "org-approval" },
    { id: "approval-editor", name: "Approval Editor", role: "editor", token: "approval-editor-token", organizationId: "org-approval" },
    { id: "other-admin", name: "Other Admin", role: "admin", token: "other-admin-token", organizationId: "org-other" }
  ];
  const organizationRepository = createOrganizationRepository({ directory: path.join(root, "organizations") });
  const organizationService = createOrganizationService({ repository: organizationRepository, identities });
  const authService = createStudioAuthService({ mode: "token", users: identities, organizationService });
  const seed = createProject({ id: "approval-http-project", name: "审批 HTTP 发布", ownerId: "approval-editor", organizationId: "org-approval", createdAt: "2026-08-11T05:00:00.000Z" });
  await projectRepository.update(seed.id, { expectedRevisionId: null, seed }, (project) => appendProjectRevision(project, { id: "revision-approval-http", createdAt: "2026-08-11T05:00:01.000Z", source: "agent", workspace: fixture.workspace }));
  const server = startPreviewServer({ listenPort: 0, silent: true, projectRepository, dataSourceRepository, publicationRepository, publicationAccessRepository, auditRepository, organizationRepository, organizationService, authService, publicationApprovalPolicy: createPublicationApprovalPolicy({ organizationIds: ["org-approval"] }) });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const login = async (token) => (await fetch(`${endpoint}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })).headers.get("set-cookie").split(";", 1)[0];
  const editorCookie = await login("approval-editor-token");
  const adminCookie = await login("approval-admin-token");
  const otherCookie = await login("other-admin-token");
  const writeHeaders = (cookie) => ({ "Content-Type": "application/json", Origin: endpoint, Cookie: cookie });
  const create = await fetch(`${endpoint}/api/publications`, { method: "POST", headers: writeHeaders(editorCookie), body: JSON.stringify({ id: "approval-release", projectId: seed.id, revisionId: "revision-approval-http", visibility: "unlisted" }) });
  assert.equal(create.status, 201);
  const payload = await create.json();
  assert.equal(payload.publication.status, "pending");
  assert.equal((await fetch(`${endpoint}${payload.share.path}`)).status, 404);
  assert.equal((await fetch(`${endpoint}${payload.share.path.replace("/p/", "/embed/")}`)).status, 404);
  assert.equal((await fetch(`${endpoint}/api/publications/approval-release/approve`, { method: "POST", headers: { Origin: endpoint, Cookie: editorCookie } })).status, 403);
  assert.equal((await fetch(`${endpoint}/api/publications/approval-release/approve`, { method: "POST", headers: { Origin: endpoint, Cookie: otherCookie } })).status, 403);
  const approved = await fetch(`${endpoint}/api/publications/approval-release/approve`, { method: "POST", headers: { Origin: endpoint, Cookie: adminCookie } });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).publication.status, "published");
  assert.equal((await fetch(`${endpoint}${payload.share.path}`)).status, 200);
  const audit = await fetch(`${endpoint}/api/audit-events?projectId=${seed.id}`, { headers: { Cookie: adminCookie } });
  assert.equal(audit.status, 200);
  const events = (await audit.json()).events;
  assert.deepEqual(events.map(({ action }) => action).sort(), ["publication.approved", "publication.submitted"]);
  assert.equal(JSON.stringify(events).includes("token="), false);
  assert.equal(JSON.stringify(events).includes("_auditOutbox"), false);
  assert.equal(Object.hasOwn(await publicationRepository.get("approval-release"), "_auditOutbox"), false);
});

test("keeps publication audit intent until an unavailable audit service recovers", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-publication-audit-recovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRepository = createProjectRepository({ directory: path.join(root, "projects") });
  const dataSourceRepository = createDataSourceRepository({ directory: path.join(root, "datasets") });
  const publicationRepository = createPublicationRepository({ directory: path.join(root, "publications") });
  const publicationAccessRepository = createPublicationAccessRepository({ directory: path.join(root, "publication-access") });
  const durableAudit = createAuditRepository({ directory: path.join(root, "audit") });
  let unavailable = true;
  const auditRepository = { append(input) { if (unavailable) throw new Error("audit offline"); return durableAudit.append(input); }, list: (options) => durableAudit.list(options) };
  const seed = createProject({ id: "publication-audit-project", name: "发布审计恢复", ownerId: "local-admin", organizationId: "local", createdAt: "2026-08-11T07:00:00.000Z" });
  await projectRepository.update(seed.id, { expectedRevisionId: null, seed }, (project) => appendProjectRevision(project, { id: "revision-publication-audit", createdAt: "2026-08-11T07:00:01.000Z", source: "agent", workspace: fixture.workspace }));
  const server = startPreviewServer({ listenPort: 0, silent: true, projectRepository, dataSourceRepository, publicationRepository, publicationAccessRepository, auditRepository });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const created = await fetch(`${endpoint}/api/publications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "publication-audit-release", projectId: seed.id, revisionId: "revision-publication-audit", visibility: "private" }) });
  assert.equal(created.status, 201);
  assert.equal((await publicationRepository.listOutbox()).length, 1);
  unavailable = false;
  const audit = await fetch(`${endpoint}/api/audit-events?projectId=${seed.id}`);
  assert.equal(audit.status, 200);
  assert.deepEqual((await audit.json()).events.map(({ action }) => action), ["publication.published"]);
  assert.equal((await publicationRepository.listOutbox()).length, 0);
});

test("flushes a configured audit anchor after publication audit delivery", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-publication-audit-anchor-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRepository = createProjectRepository({ directory: path.join(root, "projects") });
  const dataSourceRepository = createDataSourceRepository({ directory: path.join(root, "datasets") });
  const publicationRepository = createPublicationRepository({ directory: path.join(root, "publications") });
  const publicationAccessRepository = createPublicationAccessRepository({ directory: path.join(root, "publication-access") });
  const auditRepository = createAuditRepository({ directory: path.join(root, "audit") });
  const seed = createProject({ id: "publication-anchor-project", name: "发布审计锚定", ownerId: "local-admin", organizationId: "local", createdAt: "2026-08-11T08:00:00.000Z" });
  await projectRepository.update(seed.id, { expectedRevisionId: null, seed }, (project) => appendProjectRevision(project, { id: "revision-publication-anchor", createdAt: "2026-08-11T08:00:01.000Z", source: "agent", workspace: fixture.workspace }));
  let flushes = 0;
  const server = startPreviewServer({
    listenPort: 0,
    silent: true,
    projectRepository,
    dataSourceRepository,
    publicationRepository,
    publicationAccessRepository,
    auditRepository,
    auditAnchorDispatcher: { async flush() { flushes += 1; return { delivered: 0 }; } }
  });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const beforePublication = flushes;
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const created = await fetch(`${endpoint}/api/publications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "publication-anchor-release", projectId: seed.id, revisionId: "revision-publication-anchor", visibility: "private" }) });
  assert.equal(created.status, 201);
  assert.ok(flushes > beforePublication);
});

test("persists publications and serves metadata separately from artifacts", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-publication-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRepository = createProjectRepository({ directory: path.join(root, "projects") });
  const dataSourceRepository = createDataSourceRepository({ directory: path.join(root, "datasets") });
  const publicationRepository = createPublicationRepository({ directory: path.join(root, "publications") });
  const publicationAccessRepository = createPublicationAccessRepository({ directory: path.join(root, "publication-access") });
  const renderCalls = [];
  const publicationRenderer = { async render(artifact, options) { renderCalls.push({ artifact, options }); return { bytes: Buffer.from("rendered-png"), mediaType: "image/png", filename: "release.png", width: options.width, height: 900 }; } };
  const seed = createProject({ id: "http-publication", name: "HTTP 发布", createdAt: "2026-08-10T05:00:00.000Z" });
  await projectRepository.update(seed.id, { expectedRevisionId: null, seed }, (project) => appendProjectRevision(project, { id: "revision-http-publication", createdAt: "2026-08-10T05:00:01.000Z", source: "agent", workspace: fixture.workspace }));
  await dataSourceRepository.put(parseDataSource({ id: "sample-sales", name: "销售数据", format: "csv", content: csv, now: "2026-08-10T05:00:00.000Z" }));
  const server = startPreviewServer({ listenPort: 0, silent: true, projectRepository, dataSourceRepository, publicationRepository, publicationAccessRepository, publicationRateLimiter: createPublicationRateLimiter({ limit: 2 }), publicationRenderer });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const createResponse = await fetch(`${endpoint}/api/publications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "release-1", projectId: seed.id, revisionId: "revision-http-publication", visibility: "unlisted" }) });
  assert.equal(createResponse.status, 201);
  const createPayload = await createResponse.json();
  const created = createPayload.publication;
  assert.equal(created.access.visibility, "unlisted");
  assert.equal(created.access.protected, true);
  assert.match(createPayload.share.path, /^\/p\/release-1\?token=/);
  assert.equal(JSON.stringify(createPayload).includes("tokenHash"), false);
  assert.equal(Object.hasOwn(created.artifact, "html"), false);
  assert.equal((await fetch(`${endpoint}/p/release-1`)).status, 404);
  assert.equal((await fetch(`${endpoint}/p/release-1?token=wrong`)).status, 404);
  const sharedResponse = await fetch(`${endpoint}${createPayload.share.path}`);
  assert.equal(sharedResponse.status, 200);
  assert.match(sharedResponse.headers.get("content-disposition"), /^inline/);
  assert.match(await sharedResponse.text(), /^<!DOCTYPE html>/);
  const embedPath = createPayload.share.path.replace("/p/", "/embed/");
  const embedResponse = await fetch(`${endpoint}${embedPath}`);
  assert.equal(embedResponse.status, 200);
  assert.equal(embedResponse.headers.get("content-security-policy"), "frame-ancestors *");
  const limitedResponse = await fetch(`${endpoint}${createPayload.share.path}`);
  assert.equal(limitedResponse.status, 429);
  assert.equal(limitedResponse.headers.get("retry-after"), "60");
  const renderedResponse = await fetch(`${endpoint}/api/publications/release-1/render?format=png&width=1200`);
  assert.equal(renderedResponse.status, 200);
  assert.equal(renderedResponse.headers.get("content-type"), "image/png");
  assert.equal(await renderedResponse.text(), "rendered-png");
  assert.deepEqual(renderCalls[0].options, { format: "png", width: 1200 });
  const artifactResponse = await fetch(`${endpoint}/api/publications/release-1/artifact`);
  assert.equal(artifactResponse.status, 200);
  assert.match(await artifactResponse.text(), /^<!DOCTYPE html>/);
  assert.equal(artifactResponse.headers.get("etag"), `"sha256-${created.artifact.sha256}"`);
  const currentSource = await dataSourceRepository.get("sample-sales");
  const refreshResponse = await fetch(`${endpoint}/api/data-sources/sample-sales/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: currentSource.updatedAt, content: "月份,收入\n2026-03,2400" }) });
  assert.equal(refreshResponse.status, 200);
  const detailResponse = await fetch(`${endpoint}/api/publications/release-1`);
  assert.equal(detailResponse.status, 200);
  assert.equal((await detailResponse.json()).freshness.status, "stale");
  const duplicate = await fetch(`${endpoint}/api/publications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "release-1", projectId: seed.id }) });
  assert.equal(duplicate.status, 409);
  const list = await fetch(`${endpoint}/api/publications`);
  assert.equal((await list.json()).publications.length, 1);
  const revoke = await fetch(`${endpoint}/api/publications/release-1/revoke`, { method: "POST" });
  assert.equal(revoke.status, 200);
  assert.equal((await revoke.json()).publication.status, "revoked");
  const revokedArtifact = await fetch(`${endpoint}/api/publications/release-1/artifact`);
  assert.equal(revokedArtifact.status, 410);
  assert.equal((await fetch(`${endpoint}${createPayload.share.path}`)).status, 410);
  assert.equal((await fetch(`${endpoint}${embedPath}`)).status, 410);
  assert.equal((await fetch(`${endpoint}/api/publications/release-1/render?format=pdf`)).status, 410);
  const repeatedRevoke = await fetch(`${endpoint}/api/publications/release-1/revoke`, { method: "POST" });
  assert.equal(repeatedRevoke.status, 409);
  const accessEvents = (await (await fetch(`${endpoint}/api/publication-access?publicationId=release-1`)).json()).events;
  assert.deepEqual(accessEvents.map(({ decision }) => decision).sort(), ["allowed", "allowed", "allowed", "denied", "denied", "denied", "denied", "denied"].sort());
  assert.equal(accessEvents.filter(({ reason }) => reason === "rate_limited").length, 1);
  assert.equal(accessEvents.some(({ channel }) => channel === "embed"), true);
  assert.equal(accessEvents.some((event) => Object.hasOwn(event, "shareToken") || Object.hasOwn(event, "tokenHash") || Object.hasOwn(event, "url")), false);
});
