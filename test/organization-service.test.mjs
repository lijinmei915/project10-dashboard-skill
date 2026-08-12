import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AuthError } from "../.agents/skills/dashboard-html/scripts/studio-auth-service.mjs";
import { createOrganizationService } from "../.agents/skills/dashboard-html/scripts/organization-service.mjs";
import { createOrganizationRepository } from "../.agents/skills/dashboard-html/scripts/studio-organization-repository.mjs";
import { createStudioAuthService } from "../.agents/skills/dashboard-html/scripts/studio-auth-service.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createProjectRepository } from "../.agents/skills/dashboard-html/scripts/studio-project-repository.mjs";
import { createDataSourceRepository } from "../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";
import { createJobRepository } from "../.agents/skills/dashboard-html/scripts/studio-job-repository.mjs";
import { createRefreshScheduleRepository } from "../.agents/skills/dashboard-html/scripts/studio-refresh-schedule-repository.mjs";

const identities = [
  { id: "org-admin", name: "Organization Admin", role: "admin", organizationId: "acme" },
  { id: "org-editor", name: "Organization Editor", role: "editor", organizationId: "acme" },
  { id: "other-admin", name: "Other Admin", role: "admin", organizationId: "other" }
];

test("organization control bootstraps configured members, enforces admin updates, and revokes suspended members", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-organizations-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let now = Date.parse("2026-08-11T08:00:00.000Z");
  const service = createOrganizationService({ repository: createOrganizationRepository({ directory: root }), identities, clock: () => now });
  const admin = { ...identities[0] };
  const editor = { ...identities[1] };

  const current = await service.current(admin, { includeMembers: true });
  assert.equal(current.id, "acme");
  assert.equal(current.members.length, 2);
  assert.deepEqual((await service.directory(editor)).map(({ id }) => id), ["org-admin", "org-editor"]);
  await assert.rejects(() => service.update(editor, { expectedUpdatedAt: current.updatedAt, name: "Blocked" }), (error) => error instanceof AuthError && error.code === "organization-admin-required");

  now += 1_000;
  const renamed = await service.update(admin, { expectedUpdatedAt: current.updatedAt, name: "Acme Analytics" });
  assert.equal(renamed.name, "Acme Analytics");
  await assert.rejects(() => service.update(admin, { expectedUpdatedAt: current.updatedAt, name: "Stale" }), (error) => error?.issues?.[0]?.code === "stale");
  await assert.rejects(() => service.updateMembers(admin, {
    expectedUpdatedAt: renamed.updatedAt,
    members: [{ actorId: "org-admin", role: "admin", status: "suspended" }, { actorId: "org-editor", role: "member", status: "active" }]
  }), (error) => error?.issues?.[0]?.code === "invariant");

  now += 1_000;
  const changed = await service.updateMembers(admin, {
    expectedUpdatedAt: renamed.updatedAt,
    members: [{ actorId: "org-admin", role: "admin", status: "active" }, { actorId: "org-editor", role: "member", status: "suspended" }]
  });
  assert.equal(changed.members.find(({ actorId }) => actorId === "org-editor").status, "suspended");
  await assert.rejects(() => service.resolveActor(editor), (error) => error instanceof AuthError && error.code === "organization-forbidden");
  assert.deepEqual((await service.directory(admin)).map(({ id }) => id), ["org-admin"]);
});

test("organization HTTP control persists admin changes and invalidates an existing suspended session", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-organization-http-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const organizationRepository = createOrganizationRepository({ directory: path.join(root, "organizations") });
  const organizationService = createOrganizationService({ repository: organizationRepository, identities });
  const authService = createStudioAuthService({
    mode: "token",
    users: [
      { ...identities[0], token: "organization-admin-token" },
      { ...identities[1], token: "organization-editor-token" },
      { ...identities[2], token: "other-organization-token" }
    ],
    organizationService
  });
  const server = startPreviewServer({
    listenPort: 0,
    silent: true,
    authService,
    organizationRepository,
    organizationService,
    projectRepository: createProjectRepository({ directory: path.join(root, "projects") }),
    dataSourceRepository: createDataSourceRepository({ directory: path.join(root, "datasets") }),
    jobRepository: createJobRepository({ directory: path.join(root, "jobs") }),
    refreshScheduleRepository: createRefreshScheduleRepository({ directory: path.join(root, "schedules") })
  });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const login = async (token) => {
    const response = await fetch(`${endpoint}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  };
  const adminCookie = await login("organization-admin-token");
  const editorCookie = await login("organization-editor-token");
  const currentResponse = await fetch(`${endpoint}/api/organizations/current`, { headers: { Cookie: adminCookie } });
  assert.equal(currentResponse.status, 200);
  const current = (await currentResponse.json()).organization;
  assert.equal(current.members.length, 2);
  const renamedResponse = await fetch(`${endpoint}/api/organizations/current`, {
    method: "PATCH", headers: { Cookie: adminCookie, Origin: endpoint, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: current.updatedAt, name: "Acme Studio" })
  });
  assert.equal(renamedResponse.status, 200);
  const renamed = (await renamedResponse.json()).organization;
  assert.equal((await fetch(`${endpoint}/api/audit-events?scope=organization`, { headers: { Cookie: editorCookie } })).status, 403);
  const suspendResponse = await fetch(`${endpoint}/api/organizations/current/members`, {
    method: "PUT", headers: { Cookie: adminCookie, Origin: endpoint, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: renamed.updatedAt, members: [{ actorId: "org-admin", role: "admin", status: "active" }, { actorId: "org-editor", role: "member", status: "suspended" }] })
  });
  assert.equal(suspendResponse.status, 200);
  const auditResponse = await fetch(`${endpoint}/api/audit-events?scope=organization`, { headers: { Cookie: adminCookie } });
  assert.equal(auditResponse.status, 200);
  assert.deepEqual((await auditResponse.json()).events.map(({ action }) => action).sort(), ["organization.members.updated", "organization.updated"]);
  const suspendedStatus = await fetch(`${endpoint}/api/auth/status`, { headers: { Cookie: editorCookie } });
  assert.equal(suspendedStatus.status, 200);
  assert.deepEqual(await suspendedStatus.json(), { mode: "token", authenticated: false });
  assert.equal((await fetch(`${endpoint}/api/organizations/current`, { headers: { Cookie: adminCookie } })).status, 200);
});
