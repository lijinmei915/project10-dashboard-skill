import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { appendProjectRevision, createProject } from "../.agents/skills/dashboard-html/scripts/project-store.mjs";
import { createAuditEvent } from "../.agents/skills/dashboard-html/scripts/studio-audit-repository.mjs";
import { createAuditOutboxDispatcher } from "../.agents/skills/dashboard-html/scripts/studio-audit-outbox.mjs";
import { createStudioAuthService } from "../.agents/skills/dashboard-html/scripts/studio-auth-service.mjs";
import { parseDataSource } from "../.agents/skills/dashboard-html/scripts/data-source-service.mjs";
import { createRefreshJobService } from "../.agents/skills/dashboard-html/scripts/refresh-job-service.mjs";
import { createGenerationJobService } from "../.agents/skills/dashboard-html/scripts/generation-job-service.mjs";
import { createProviderFromEnv } from "../.agents/skills/dashboard-html/scripts/provider-gateway.mjs";
import { createRefreshScheduleService } from "../.agents/skills/dashboard-html/scripts/refresh-schedule-service.mjs";
import { createSemanticQueryCache } from "../.agents/skills/dashboard-html/scripts/semantic-query-cache.mjs";
import { createPostgresStorage } from "../.agents/skills/dashboard-html/scripts/studio-postgres-storage.mjs";
import { createStorageRuntime } from "../.agents/skills/dashboard-html/scripts/studio-storage-runtime.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createOrganizationService } from "../.agents/skills/dashboard-html/scripts/organization-service.mjs";
import { createOrganizationAuditOutboxDispatcher } from "../.agents/skills/dashboard-html/scripts/studio-organization-audit-outbox.mjs";
import { createAuditAnchorDispatcher } from "../.agents/skills/dashboard-html/scripts/studio-audit-anchor-dispatcher.mjs";

const connectionString = process.env.DASHBOARD_TEST_POSTGRES_URL;
const fixture = JSON.parse(await readFile(new URL("./fixtures/sales-dashboard-generation.json", import.meta.url), "utf8"));

async function clean(storage) {
  await storage.pool.query("TRUNCATE dashboard_entities, dashboard_audit_events, dashboard_audit_anchor_outbox, dashboard_publication_access_events, dashboard_auth_sessions, dashboard_query_cache");
}

async function waitFor(read, predicate, timeoutMs = 2_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for PostgreSQL worker state");
}

function restSource(id) {
  const source = parseDataSource({ id, name: "Shared REST", format: "json", content: JSON.stringify([{ value: 1 }]), now: "2026-08-10T12:00:00.000Z" });
  source.kind = "rest";
  source.connector = { type: "rest", url: "https://api.example.com/data", recordsPath: "" };
  return source;
}

test("PostgreSQL adapter satisfies all ports with shared transactions and adapter restart persistence", { skip: !connectionString }, async (t) => {
  const first = await createPostgresStorage({ connectionString, max: 4 });
  const second = await createPostgresStorage({ connectionString, max: 4 });
  t.after(async () => { await Promise.all([first.close(), second.close()]); });
  await clean(first);
  const runtime = createStorageRuntime({ provider: first.provider, repositories: first.repositories, capabilities: first.capabilities });
  const readiness = await runtime.readiness();
  assert.equal(readiness.status, "ok");
  assert.equal(readiness.deployment, "managed");
  assert.equal(readiness.capabilities.productionReady, true);

  const actor = { id: "owner", name: "Owner", role: "editor" };
  const seed = createProject({ id: "pg-project", name: "PostgreSQL", ownerId: actor.id, organizationId: "default", createdAt: "2026-08-10T12:00:00.000Z" });
  const created = await first.repositories.projects.update(seed.id, {
    expectedRevisionId: null,
    seed,
    outbox: ({ next }) => createAuditEvent({ id: "audit-pg-created", at: "2026-08-10T12:00:01.000Z", action: "project.created", actor, projectId: next.id, organizationId: "default" })
  }, (project) => appendProjectRevision(project, { id: "revision-pg-1", createdAt: "2026-08-10T12:00:01.000Z", source: "agent", workspace: fixture.workspace }));
  assert.equal(created.currentRevisionId, "revision-pg-1");
  assert.equal(Object.hasOwn(created, "_outbox"), false);
  assert.equal((await second.repositories.projects.listOutbox()).length, 1);
  const dispatcher = createAuditOutboxDispatcher({ projectRepository: second.repositories.projects, auditRepository: second.repositories.audit });
  assert.deepEqual(await dispatcher.flush(), { pending: 1, delivered: 1, failed: 0 });
  assert.equal((await first.repositories.audit.list({ projectId: seed.id })).length, 1);

  const concurrent = (repository, id, at) => repository.update(seed.id, { expectedRevisionId: "revision-pg-1" }, (project) => appendProjectRevision(project, { id, createdAt: at, source: "user", workspace: fixture.workspace }));
  const writes = await Promise.allSettled([
    concurrent(first.repositories.projects, "revision-pg-2", "2026-08-10T12:00:02.000Z"),
    concurrent(second.repositories.projects, "revision-pg-3", "2026-08-10T12:00:03.000Z")
  ]);
  assert.equal(writes.filter(({ status }) => status === "fulfilled").length, 1);
  assert.match(writes.find(({ status }) => status === "rejected").reason.message, /stale/);
  assert.equal((await first.repositories.projects.get(seed.id)).revisions.length, 2);

  const source = { id: "pg-data", updatedAt: "2026-08-10T12:00:00.000Z", records: [{ value: 1 }] };
  await first.repositories.dataSources.put(source);
  await second.repositories.dataSources.update(source.id, { expectedUpdatedAt: source.updatedAt }, (current) => ({ ...current, updatedAt: "2026-08-10T12:00:01.000Z" }));
  await assert.rejects(() => first.repositories.dataSources.update(source.id, { expectedUpdatedAt: source.updatedAt }, (current) => current), /stale/);

  await first.repositories.publications.put({ id: "pg-publication", status: "active" });
  await assert.rejects(() => second.repositories.publications.put({ id: "pg-publication", status: "active" }), /already exists/);
  await second.repositories.publications.update("pg-publication", (publication) => ({ ...publication, status: "revoked" }));
  await first.repositories.jobs.put({ id: "pg-job", status: "queued" });
  await second.repositories.jobs.update("pg-job", (job) => ({ ...job, status: "succeeded" }));
  await first.repositories.refreshSchedules.put({ id: "pg-schedule", enabled: true });
  await second.repositories.refreshSchedules.update("pg-schedule", (schedule) => ({ ...schedule, enabled: false }));
  await first.repositories.publicationAccess.append({ id: "access-pg", publicationId: "pg-publication", decision: "allowed", reason: "public", visibility: "public", now: "2026-08-10T12:00:04.000Z" });
  assert.equal((await second.repositories.publicationAccess.list({ publicationId: "pg-publication" })).length, 1);
  assert.equal((await second.repositories.publications.get("pg-publication")).status, "revoked");
  assert.equal((await first.repositories.jobs.get("pg-job")).status, "succeeded");
  assert.equal((await first.repositories.refreshSchedules.get("pg-schedule")).enabled, false);

  const users = [{ id: "shared-editor", name: "Shared Editor", role: "editor", token: "shared-secret", organizationId: "shared-org" }];
  const firstAuth = createStudioAuthService({ mode: "token", users, sessionRepository: first.repositories.sessions });
  const secondAuth = createStudioAuthService({ mode: "token", users, sessionRepository: second.repositories.sessions });
  const login = await firstAuth.login("shared-secret");
  const cookie = login.cookie.split(";", 1)[0];
  assert.deepEqual((await secondAuth.status({ headers: { cookie } })).actor, { id: "shared-editor", name: "Shared Editor", role: "editor", organizationId: "shared-org" });
  const persisted = await first.pool.query("SELECT id, actor_id FROM dashboard_auth_sessions");
  assert.equal(persisted.rows.length, 1);
  assert.match(persisted.rows[0].id, /^[a-f0-9]{64}$/);
  assert.equal(persisted.rows[0].actor_id, "shared-editor");
  assert.equal(JSON.stringify(persisted.rows).includes(cookie.split("=")[1]), false);
  await secondAuth.logout({ headers: { cookie } });
  assert.equal((await firstAuth.status({ headers: { cookie } })).authenticated, false);
  const revocationLogin = await firstAuth.login("shared-secret");
  const revocationCookie = revocationLogin.cookie.split(";", 1)[0];
  assert.equal(await second.repositories.sessions.deleteByActor("shared-editor", "shared-org"), 1);
  assert.equal((await firstAuth.status({ headers: { cookie: revocationCookie } })).authenticated, false);

  const identity = await first.repositories.externalIdentities.bind({
    providerId: "acme-oidc",
    issuer: "https://login.example.test",
    subject: "external-member-42",
    organizationId: "shared-org",
    actorId: "shared-editor"
  });
  assert.match(identity.id, /^[a-f0-9]{64}$/);
  assert.equal((await second.repositories.externalIdentities.get({ providerId: "acme-oidc", issuer: "https://login.example.test", subject: "external-member-42" })).actorId, "shared-editor");
  await assert.rejects(() => second.repositories.externalIdentities.bind({ ...identity, actorId: "other-member" }), (error) => error?.issues?.[0]?.code === "immutable");
  assert.equal(await second.repositories.externalIdentities.unbind({ providerId: "acme-oidc", issuer: "https://login.example.test", subject: "external-member-42", organizationId: "shared-org", actorId: "shared-editor" }), true);
  assert.equal((await first.repositories.externalIdentities.get({ providerId: "acme-oidc", issuer: "https://login.example.test", subject: "external-member-42" })).status, "unbound");
  const storedIdentity = (await first.pool.query("SELECT payload::text FROM dashboard_entities WHERE kind = 'external-identity' AND id = $1", [identity.id])).rows[0].payload;
  assert.equal(/email|token|assertion/i.test(storedIdentity), false);

  const serverOptions = (storage, authService) => ({
    listenPort: 0,
    silent: true,
    authService,
    storageProvider: storage.provider,
    storageCapabilities: storage.capabilities,
    projectRepository: storage.repositories.projects,
    dataSourceRepository: storage.repositories.dataSources,
    publicationRepository: storage.repositories.publications,
    publicationAccessRepository: storage.repositories.publicationAccess,
    jobRepository: storage.repositories.jobs,
    refreshScheduleRepository: storage.repositories.refreshSchedules,
    auditRepository: storage.repositories.audit,
    queryCache: createSemanticQueryCache({ store: storage.queryCache })
  });
  const firstServer = startPreviewServer(serverOptions(first, firstAuth));
  const secondServer = startPreviewServer(serverOptions(second, secondAuth));
  await Promise.all([firstServer, secondServer].map((server) => new Promise((resolve) => server.once("listening", resolve))));
  const firstEndpoint = `http://127.0.0.1:${firstServer.address().port}`;
  const secondEndpoint = `http://127.0.0.1:${secondServer.address().port}`;
  try {
    const httpLogin = await fetch(`${firstEndpoint}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "shared-secret" }) });
    const sharedCookie = httpLogin.headers.get("set-cookie").split(";", 1)[0];
    const crossInstanceStatus = await fetch(`${secondEndpoint}/api/auth/status`, { headers: { Cookie: sharedCookie } });
    assert.equal((await crossInstanceStatus.json()).actor.id, "shared-editor");
    const readiness = await (await fetch(`${secondEndpoint}/api/platform/readiness`)).json();
    assert.deepEqual(readiness.authentication, { status: "ok", mode: "token", provider: "postgresql", capabilities: { durable: true, shared: true, multiInstance: true } });
    assert.equal(readiness.execution.distributed, true);
    assert.deepEqual(readiness.execution.refreshJobs, { leasing: true, heartbeat: true, fencing: true, delivery: "at-least-once" });
    assert.deepEqual(readiness.auditIntegrity, { appendOnly: true, hashChain: true, sealed: false });
    assert.deepEqual(readiness.queryCache, { status: "ok", shared: true, persistent: true });
    assert.equal((await fetch(`${secondEndpoint}/api/audit-events/verify`, { headers: { Cookie: sharedCookie } })).status, 200);
    assert.equal((await fetch(`${secondEndpoint}/api/projects`, { headers: { Cookie: sharedCookie } })).status, 200);
    assert.equal((await fetch(`${secondEndpoint}/api/auth/logout`, { method: "POST", headers: { Cookie: sharedCookie, Origin: secondEndpoint } })).status, 200);
    assert.equal((await fetch(`${firstEndpoint}/api/projects`, { headers: { Cookie: sharedCookie } })).status, 401);
  } finally {
    await Promise.all([firstServer, secondServer].map((server) => new Promise((resolve) => server.close(resolve))));
  }

  const restarted = await createPostgresStorage({ connectionString, max: 2 });
  assert.equal((await restarted.repositories.projects.get(seed.id)).revisions.length, 2);
  assert.equal((await restarted.repositories.dataSources.get(source.id)).updatedAt, "2026-08-10T12:00:01.000Z");
  await restarted.close();
  await clean(first);
});

test("PostgreSQL organization audit outbox shares governance events with the organization hash chain", { skip: !connectionString }, async (t) => {
  const first = await createPostgresStorage({ connectionString, max: 2 });
  const second = await createPostgresStorage({ connectionString, max: 2 });
  t.after(async () => { await Promise.all([first.close(), second.close()]); });
  await clean(first);
  const identities = [{ id: "org-owner", name: "Org Owner", role: "admin", organizationId: "org-audit" }];
  const service = createOrganizationService({ repository: first.repositories.organizations, identities });
  const actor = await service.resolveActor(identities[0]);
  const current = await service.current(actor, { includeMembers: true });
  await service.update(actor, { expectedUpdatedAt: current.updatedAt, name: "Audited Organization" });
  assert.equal((await second.repositories.organizations.listOutbox()).length, 1);
  const dispatcher = createOrganizationAuditOutboxDispatcher({ organizationRepository: second.repositories.organizations, auditRepository: second.repositories.audit });
  assert.deepEqual(await dispatcher.flush(), { pending: 1, delivered: 1, failed: 0 });
  const events = await first.repositories.audit.list({ organizationId: "org-audit" });
  assert.equal(events[0].scope, "organization");
  assert.equal(events[0].projectId, undefined);
  assert.equal(events[0].action, "organization.updated");
  assert.equal((await first.repositories.audit.verify({ organizationId: "org-audit" })).status, "ok");
});

test("PostgreSQL audit sink chains events, blocks ordinary mutations, and detects sealed tampering", { skip: !connectionString }, async (t) => {
  const auditHmacKey = "audit-integrity-key-with-at-least-32-characters";
  const first = await createPostgresStorage({ connectionString, max: 4, auditHmacKey });
  const second = await createPostgresStorage({ connectionString, max: 4, auditHmacKey });
  t.after(async () => { await clean(first); await Promise.all([first.close(), second.close()]); });
  await clean(first);
  const actor = { id: "auditor", name: "Auditor", role: "admin" };
  await Promise.all([
    first.repositories.audit.append(createAuditEvent({ id: "audit-chain-a", at: "2026-08-11T01:00:00.000Z", action: "project.created", actor, projectId: "audit-project-a", organizationId: "audit-org" })),
    second.repositories.audit.append(createAuditEvent({ id: "audit-chain-b", at: "2026-08-11T01:00:01.000Z", action: "project.renamed", actor, projectId: "audit-project-b", organizationId: "audit-org" }))
  ]);
  const verified = await second.repositories.audit.verify({ organizationId: "audit-org" });
  assert.deepEqual(verified, { status: "ok", sealed: true, organizations: [{ organizationId: "audit-org", status: "ok", eventCount: 2, headHash: verified.organizations[0].headHash }] });
  assert.match(verified.organizations[0].headHash, /^[a-f0-9]{64}$/);
  const anchors = [];
  const anchorDispatcher = createAuditAnchorDispatcher({ auditRepository: first.repositories.audit, sink: { async append(anchor) { anchors.push(anchor); return { receiptReference: `receipt-${anchor.headSequence}` }; } } });
  assert.deepEqual(await anchorDispatcher.flush(), { pending: 2, delivered: 2, failed: 0 });
  assert.equal(anchors.every((anchor) => anchor.schemaVersion === 1 && anchor.chainAlgorithm === "sha256-v1" && /^[a-f0-9]{64}$/.test(anchor.headHash) && !Object.hasOwn(anchor, "payload")), true);
  const anchorStatus = await second.repositories.audit.anchorStatus({ organizationId: "audit-org" });
  assert.equal(anchorStatus.status, "current");
  assert.equal(anchorStatus.pending, 0);
  assert.equal(anchorStatus.failed, 0);
  assert.equal(anchorStatus.headHash, verified.organizations[0].headHash);
  await assert.rejects(() => first.pool.query("UPDATE dashboard_audit_events SET payload = payload WHERE id = 'audit-chain-a'"), /append-only/);
  await assert.rejects(() => first.pool.query("DELETE FROM dashboard_audit_events WHERE id = 'audit-chain-a'"), /append-only/);
  await first.pool.query("ALTER TABLE dashboard_audit_events DISABLE TRIGGER dashboard_audit_events_no_mutation");
  await first.pool.query("UPDATE dashboard_audit_events SET payload = jsonb_set(payload, '{action}', '\"project.deleted\"') WHERE id = 'audit-chain-a'");
  await first.pool.query("ALTER TABLE dashboard_audit_events ENABLE TRIGGER dashboard_audit_events_no_mutation");
  const tampered = await second.repositories.audit.verify({ organizationId: "audit-org" });
  assert.equal(tampered.status, "error");
  assert.deepEqual({ organizationId: tampered.organizations[0].organizationId, status: tampered.organizations[0].status, eventCount: tampered.organizations[0].eventCount, error: tampered.organizations[0].error }, { organizationId: "audit-org", status: "error", eventCount: 2, error: "integrity-failed" });
  assert.match(tampered.organizations[0].headHash, /^[a-f0-9]{64}$/);
});

test("PostgreSQL query cache shares bounded query results and invalidates by dataset", { skip: !connectionString }, async (t) => {
  const first = await createPostgresStorage({ connectionString, max: 3 });
  const second = await createPostgresStorage({ connectionString, max: 3 });
  t.after(async () => { await clean(first); await Promise.all([first.close(), second.close()]); });
  await clean(first);
  let now = Date.now();
  const firstCache = createSemanticQueryCache({ store: first.queryCache, ttlMs: 1_000, clock: () => now });
  const secondCache = createSemanticQueryCache({ store: second.queryCache, ttlMs: 1_000, clock: () => now });
  const source = restSource("shared-query-cache");
  const metric = source.semanticModel.metrics[0];
  const input = { metrics: [metric.id] };
  assert.equal((await firstCache.execute(source, input)).cache.status, "miss");
  assert.equal((await secondCache.execute(source, input)).cache.status, "hit");
  const stored = (await first.pool.query("SELECT dataset_id, result::text FROM dashboard_query_cache")).rows[0];
  assert.equal(stored.dataset_id, source.id);
  assert.equal(stored.result.includes("connector"), false);
  assert.equal(stored.result.includes("records"), false);
  await first.pool.query("UPDATE dashboard_query_cache SET expires_at = NOW() - interval '1 second'");
  assert.equal((await secondCache.execute(source, input)).cache.status, "miss");
  await firstCache.invalidateDataset(source.id);
  assert.equal((await secondCache.execute(source, input)).cache.status, "miss");
  assert.deepEqual(secondCache.capabilities, { shared: true, persistent: true });
});

test("PostgreSQL leases fence stale refresh workers and trigger each schedule occurrence once", { skip: !connectionString }, async (t) => {
  const first = await createPostgresStorage({ connectionString, max: 6 });
  const second = await createPostgresStorage({ connectionString, max: 6 });
  t.after(async () => { await clean(first); await Promise.all([first.close(), second.close()]); });
  await clean(first);
  await first.repositories.dataSources.put(restSource("lease-data"));
  await first.repositories.jobs.put({ version: 1, id: "lease-job", type: "dataset-refresh", datasetId: "lease-data", status: "queued", attempts: 0, maxAttempts: 3, createdAt: "2026-08-10T12:00:00.000Z", updatedAt: "2026-08-10T12:00:00.000Z", nextAttemptAt: "2026-08-10T12:00:00.000Z", lastError: null, lease: null });

  let now = Date.parse("2026-08-10T12:00:01.000Z");
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let firstCalls = 0;
  let secondCalls = 0;
  const noTimer = () => 1;
  const firstWorker = createRefreshJobService({
    jobRepository: first.repositories.jobs,
    dataSourceRepository: first.repositories.dataSources,
    restConnector: { async refresh(source, { now: at }) { firstCalls += 1; await firstGate; return { ...source, updatedAt: at, fingerprint: `${source.fingerprint}-stale` }; } },
    workerId: "worker-a", leaseDurationMs: 1_000, clock: () => now, timer: noTimer, clearTimer() {}
  });
  const secondWorker = createRefreshJobService({
    jobRepository: second.repositories.jobs,
    dataSourceRepository: second.repositories.dataSources,
    restConnector: { async refresh(source, { now: at }) { secondCalls += 1; return { ...source, updatedAt: at, fingerprint: `${source.fingerprint}-winner`, records: [{ value: 2 }] }; } },
    workerId: "worker-b", leaseDurationMs: 1_000, clock: () => now, timer: noTimer, clearTimer() {}
  });

  const staleRun = firstWorker.run("lease-job");
  await waitFor(() => first.repositories.jobs.get("lease-job"), (job) => job.lease?.ownerId === "worker-a");
  now += 1_001;
  const winningRun = secondWorker.run("lease-job");
  await waitFor(() => first.repositories.jobs.get("lease-job"), (job) => job.lease?.ownerId === "worker-b");
  releaseFirst();
  await Promise.all([staleRun, winningRun]);
  const completed = await first.repositories.jobs.get("lease-job");
  assert.equal(completed.status, "succeeded");
  assert.equal(completed.attempts, 2);
  assert.equal(completed.lease, null);
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 1);
  assert.match((await first.repositories.dataSources.get("lease-data")).fingerprint, /-winner$/);

  await first.repositories.dataSources.put(restSource("schedule-data"));
  const scheduledFor = "2026-08-10T11:59:00.000Z";
  await first.repositories.refreshSchedules.put({ version: 1, id: "schedule-schedule-data", datasetId: "schedule-data", enabled: true, intervalMinutes: 60, maxAttempts: 3, createdAt: scheduledFor, updatedAt: scheduledFor, nextRunAt: scheduledFor, lastRunAt: null, lastJobId: null, lastError: null, lease: null });
  const enqueued = [];
  const jobService = { async enqueue(input) { enqueued.push(input); return { id: input.id }; } };
  const firstScheduler = createRefreshScheduleService({ scheduleRepository: first.repositories.refreshSchedules, dataSourceRepository: first.repositories.dataSources, jobService, workerId: "scheduler-a", clock: () => now, timer: noTimer, clearTimer() {} });
  const secondScheduler = createRefreshScheduleService({ scheduleRepository: second.repositories.refreshSchedules, dataSourceRepository: second.repositories.dataSources, jobService, workerId: "scheduler-b", clock: () => now, timer: noTimer, clearTimer() {} });
  await Promise.all([firstScheduler.trigger("schedule-schedule-data"), secondScheduler.trigger("schedule-schedule-data")]);
  assert.equal(enqueued.length, 1);
  const expectedJobId = `job-schedule-${createHash("sha256").update(`schedule-schedule-data:${scheduledFor}`).digest("hex").slice(0, 24)}`;
  assert.equal(enqueued[0].id, expectedJobId);
  const schedule = await first.repositories.refreshSchedules.get("schedule-schedule-data");
  assert.equal(schedule.lastJobId, expectedJobId);
  assert.equal(schedule.lease, null);

  await first.repositories.dataSources.put(restSource("schedule-recovery-data"));
  const recoveryScheduleId = "schedule-schedule-recovery-data";
  const recoveryFor = "2026-08-10T11:58:00.000Z";
  const recoveryJobId = `job-schedule-${createHash("sha256").update(`${recoveryScheduleId}:${recoveryFor}`).digest("hex").slice(0, 24)}`;
  await first.repositories.refreshSchedules.put({ version: 1, id: recoveryScheduleId, datasetId: "schedule-recovery-data", enabled: true, intervalMinutes: 60, maxAttempts: 3, createdAt: recoveryFor, updatedAt: recoveryFor, nextRunAt: recoveryFor, lastRunAt: null, lastJobId: null, lastError: null, lease: { ownerId: "dead-scheduler", token: "dead-token", scheduledFor: recoveryFor, acquiredAt: recoveryFor, expiresAt: recoveryFor } });
  await first.repositories.jobs.put({ version: 1, id: recoveryJobId, type: "dataset-refresh", datasetId: "schedule-recovery-data", status: "queued", attempts: 0, maxAttempts: 3, createdAt: recoveryFor, updatedAt: recoveryFor, nextAttemptAt: recoveryFor, lastError: null, lease: null });
  const recoveryScheduler = createRefreshScheduleService({ scheduleRepository: second.repositories.refreshSchedules, dataSourceRepository: second.repositories.dataSources, jobService: secondWorker, workerId: "scheduler-recovery", clock: () => now, timer: noTimer, clearTimer() {} });
  await recoveryScheduler.trigger(recoveryScheduleId);
  const recoveredSchedule = await first.repositories.refreshSchedules.get(recoveryScheduleId);
  assert.equal(recoveredSchedule.lastJobId, recoveryJobId);
  assert.equal(recoveredSchedule.lease, null);
  assert.equal((await first.repositories.jobs.list()).filter(({ id }) => id === recoveryJobId).length, 1);

  await assert.rejects(() => Promise.all([
    first.repositories.jobs.put({ version: 1, id: "dataset-single-a", type: "dataset-refresh", datasetId: "schedule-data", status: "queued" }),
    second.repositories.jobs.put({ version: 1, id: "dataset-single-b", type: "dataset-refresh", datasetId: "schedule-data", status: "queued" })
  ]));
  assert.equal((await first.repositories.jobs.list()).filter((job) => job.datasetId === "schedule-data" && ["queued", "running", "retrying"].includes(job.status)).length, 1);
});

test("PostgreSQL generation jobs fence competing workers, recover expired leases, and preserve cancellation", { skip: !connectionString }, async (t) => {
  const first = await createPostgresStorage({ connectionString, max: 6 });
  const second = await createPostgresStorage({ connectionString, max: 6 });
  t.after(async () => { await clean(first); await Promise.all([first.close(), second.close()]); });
  await clean(first);

  const actor = { id: "generation-editor", role: "editor", organizationId: "generation-org" };
  const baseline = {
    version: 2,
    theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" },
    layout: { sections: [] },
    logo: null
  };
  const request = { id: "postgres-generation", prompt: "生成销售经营看板", language: "zh", pageType: "dashboard", dataInputs: [] };
  const baseProvider = createProviderFromEnv({});
  let providerCalls = 0;
  const provider = {
    ...baseProvider,
    async generateCandidate(context) {
      providerCalls += 1;
      return baseProvider.generateCandidate(context);
    }
  };
  const deferredTimer = () => ({ deferred: true });
  const options = {
    provider,
    resolveData: async (candidate) => ({ request: candidate, dataContexts: [] }),
    timer: deferredTimer,
    clearTimer() {},
    leaseDurationMs: 1_000
  };
  const firstWorker = createGenerationJobService({ ...options, jobRepository: first.repositories.jobs, workerId: "generation-worker-a" });
  const secondWorker = createGenerationJobService({ ...options, jobRepository: second.repositories.jobs, workerId: "generation-worker-b" });

  await firstWorker.create({ id: "generation-race-postgres", mode: "draft", request, baseWorkspace: baseline, actor });
  await Promise.all([firstWorker.run("generation-race-postgres"), secondWorker.run("generation-race-postgres")]);
  assert.equal(providerCalls, 1);
  assert.equal((await secondWorker.get("generation-race-postgres", actor)).status, "succeeded");

  let now = Date.parse("2026-08-11T08:00:02.000Z");
  await first.repositories.jobs.put({
    version: 1,
    id: "generation-expired-postgres",
    type: "dashboard-generation",
    mode: "draft",
    status: "running",
    actorId: actor.id,
    organizationId: actor.organizationId,
    createdAt: "2026-08-11T08:00:00.000Z",
    updatedAt: "2026-08-11T08:00:00.000Z",
    startedAt: "2026-08-11T08:00:00.000Z",
    input: { request, baseWorkspace: baseline },
    result: null,
    error: null,
    lease: { ownerId: "dead-worker", token: "dead-token", acquiredAt: "2026-08-11T08:00:00.000Z", expiresAt: "2026-08-11T08:00:01.000Z" }
  });
  const recoveryWorker = createGenerationJobService({ ...options, jobRepository: second.repositories.jobs, workerId: "generation-worker-recovery", clock: () => now });
  await recoveryWorker.resume();
  assert.equal((await first.repositories.jobs.get("generation-expired-postgres")).status, "queued");
  await recoveryWorker.run("generation-expired-postgres");
  assert.equal((await firstWorker.get("generation-expired-postgres", actor)).status, "succeeded");

  let releaseProvider;
  const delayedProvider = {
    id: "postgres-delayed-provider",
    kind: "remote",
    configured: true,
    generateCandidate: () => new Promise((resolve) => { releaseProvider = resolve; }),
    repairCandidate: async ({ candidate }) => candidate
  };
  const delayedWorker = createGenerationJobService({ ...options, jobRepository: first.repositories.jobs, provider: delayedProvider, workerId: "generation-worker-delayed" });
  await delayedWorker.create({ id: "generation-cancel-postgres", mode: "draft", request, baseWorkspace: baseline, actor });
  const delayedRun = delayedWorker.run("generation-cancel-postgres");
  await waitFor(() => second.repositories.jobs.get("generation-cancel-postgres"), (job) => job.lease?.ownerId === "generation-worker-delayed");
  const canceled = await secondWorker.cancel("generation-cancel-postgres", actor);
  assert.equal(canceled.status, "canceled");
  releaseProvider(structuredClone(fixture));
  await delayedRun;
  const final = await firstWorker.get("generation-cancel-postgres", actor);
  assert.equal(final.status, "canceled");
  assert.equal(final.run, undefined);

  const metrics = await secondWorker.metrics({ ...actor, organizationRole: "admin" }, { since: "2026-08-11T00:00:00.000Z" });
  assert.equal(metrics.totals.created, 3);
  assert.equal(metrics.totals.succeeded, 2);
  assert.equal(metrics.totals.canceled, 1);
  assert.equal(/生成销售经营看板|generation-race-postgres|actorId|workspace/i.test(JSON.stringify(metrics)), false);

  const stored = await first.pool.query("SELECT payload::text FROM dashboard_entities WHERE kind = 'job' AND id LIKE 'generation-%-postgres' ORDER BY id");
  const persistedPayload = stored.rows.map(({ payload }) => payload).join("\n");
  assert.equal(persistedPayload.includes("dataContexts"), false);
  assert.equal(persistedPayload.includes("records"), false);
  assert.equal(/credential|authorization|apiKey|accessToken/i.test(persistedPayload), false);
});
