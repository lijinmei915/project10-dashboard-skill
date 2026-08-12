import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "../.agents/skills/dashboard-html/scripts/project-store.mjs";
import { createAuditEvent, createAuditRepository } from "../.agents/skills/dashboard-html/scripts/studio-audit-repository.mjs";
import { createAuditOutboxDispatcher } from "../.agents/skills/dashboard-html/scripts/studio-audit-outbox.mjs";
import { createDataSourceRepository } from "../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";
import { createJobRepository } from "../.agents/skills/dashboard-html/scripts/studio-job-repository.mjs";
import { createProjectRepository } from "../.agents/skills/dashboard-html/scripts/studio-project-repository.mjs";
import { createRefreshScheduleRepository } from "../.agents/skills/dashboard-html/scripts/studio-refresh-schedule-repository.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/sales-dashboard-generation.json", import.meta.url), "utf8"));

async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-audit-outbox-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    projectRepository: createProjectRepository({ directory: path.join(root, "projects") }),
    auditRepository: createAuditRepository({ directory: path.join(root, "audit") })
  };
}

function event(projectId = "outbox-project") {
  return createAuditEvent({ id: "audit-stable", at: "2026-08-10T10:00:00.000Z", action: "project.created", actor: { id: "owner", name: "Owner", role: "editor" }, projectId, organizationId: "default", details: { source: "agent" } });
}

test("commits project state and audit intent in one file while hiding internal outbox state", async (t) => {
  const { projectRepository } = await setup(t);
  const seed = createProject({ id: "outbox-project", name: "Outbox", ownerId: "owner", organizationId: "default" });
  const stored = await projectRepository.update(seed.id, { seed, expectedRevisionId: null, outbox: () => event() }, (project) => ({ ...project, revisions: [{ version: 1, id: "revision-1", createdAt: "2026-08-10T10:00:00.000Z", source: "agent", workspace: fixture.workspace }], currentRevisionId: "revision-1" }));
  assert.equal(Object.hasOwn(stored, "_outbox"), false);
  assert.equal(Object.hasOwn(await projectRepository.get(seed.id), "_outbox"), false);
  assert.deepEqual((await projectRepository.listOutbox()).map(({ event: item }) => item.id), ["audit-stable"]);
});

test("rejects unsafe audit filenames and strips client supplied outbox state", async (t) => {
  const { projectRepository } = await setup(t);
  assert.throws(() => createAuditEvent({ id: "audit-../escape", at: "2026-08-10T10:00:00.000Z", action: "project.created", actor: { id: "owner", name: "Owner" }, projectId: "project", organizationId: "default" }), /id is invalid/);
  assert.throws(() => createAuditEvent({ id: "audit-safe", at: "../../escape", action: "project.created", actor: { id: "owner", name: "Owner" }, projectId: "project", organizationId: "default" }), /time is invalid/);
  const seed = { ...createProject({ id: "seed-clean", name: "Seed", ownerId: "owner", organizationId: "default" }), _outbox: [event("seed-clean")] };
  await projectRepository.update(seed.id, { seed, expectedRevisionId: null }, (project) => project);
  assert.equal((await projectRepository.listOutbox()).length, 0);
});

test("recovers failed audit delivery and clears outbox after a later flush", async (t) => {
  const { projectRepository, auditRepository } = await setup(t);
  const seed = createProject({ id: "outbox-project", name: "Outbox", ownerId: "owner", organizationId: "default" });
  await projectRepository.update(seed.id, { seed, expectedRevisionId: null, outbox: () => event() }, (project) => project);
  let unavailable = true;
  const dispatcher = createAuditOutboxDispatcher({ projectRepository, auditRepository: { append(input) { if (unavailable) throw new Error("offline"); return auditRepository.append(input); } } });
  assert.deepEqual(await dispatcher.flush(), { pending: 1, delivered: 0, failed: 1 });
  assert.equal((await projectRepository.listOutbox()).length, 1);
  unavailable = false;
  assert.deepEqual(await dispatcher.flush(), { pending: 1, delivered: 1, failed: 0 });
  assert.equal((await projectRepository.listOutbox()).length, 0);
  assert.equal((await auditRepository.list({ projectId: seed.id })).length, 1);
});

test("audit append is idempotent when delivery succeeded before acknowledgement", async (t) => {
  const { projectRepository, auditRepository } = await setup(t);
  const seed = createProject({ id: "outbox-project", name: "Outbox", ownerId: "owner", organizationId: "default" });
  await projectRepository.update(seed.id, { seed, expectedRevisionId: null, outbox: () => event() }, (project) => project);
  await auditRepository.append(event());
  const dispatcher = createAuditOutboxDispatcher({ projectRepository, auditRepository });
  assert.deepEqual(await dispatcher.flush(), { pending: 1, delivered: 1, failed: 0 });
  assert.equal((await auditRepository.list({ projectId: seed.id })).length, 1);
});

test("Project API succeeds during an audit outage and recovers the event later", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-audit-api-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRepository = createProjectRepository({ directory: path.join(root, "projects") });
  const durableAudit = createAuditRepository({ directory: path.join(root, "audit") });
  let unavailable = true;
  const auditRepository = {
    append(input) { if (unavailable) throw new Error("audit offline"); return durableAudit.append(input); },
    list: (options) => durableAudit.list(options)
  };
  const server = startPreviewServer({
    listenPort: 0,
    silent: true,
    projectRepository,
    auditRepository,
    dataSourceRepository: createDataSourceRepository({ directory: path.join(root, "datasets") }),
    jobRepository: createJobRepository({ directory: path.join(root, "jobs") }),
    refreshScheduleRepository: createRefreshScheduleRepository({ directory: path.join(root, "schedules") })
  });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${endpoint}/api/projects/api-outbox/revisions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedRevisionId: null, revisionId: "revision-api-outbox", projectName: "API Outbox", workspace: fixture.workspace })
  });
  assert.equal(response.status, 201, await response.text());
  assert.equal((await projectRepository.listOutbox()).length, 1);
  assert.equal((await projectRepository.get("api-outbox")).currentRevisionId, "revision-api-outbox");
  unavailable = false;
  const auditResponse = await fetch(`${endpoint}/api/audit-events?projectId=api-outbox`);
  assert.equal(auditResponse.status, 200);
  const events = (await auditResponse.json()).events;
  assert.deepEqual(events.map(({ action }) => action), ["project.created"]);
  assert.equal((await projectRepository.listOutbox()).length, 0);
});
