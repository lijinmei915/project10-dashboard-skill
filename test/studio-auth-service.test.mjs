import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createStudioAuthService } from "../.agents/skills/dashboard-html/scripts/studio-auth-service.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createDataSourceRepository } from "../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";
import { createProjectRepository } from "../.agents/skills/dashboard-html/scripts/studio-project-repository.mjs";
import { createJobRepository } from "../.agents/skills/dashboard-html/scripts/studio-job-repository.mjs";
import { createRefreshScheduleRepository } from "../.agents/skills/dashboard-html/scripts/studio-refresh-schedule-repository.mjs";
import { appendProjectRevision, createProject } from "../.agents/skills/dashboard-html/scripts/project-store.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/sales-dashboard-generation.json", import.meta.url), "utf8"));

function cookieFrom(response) {
  return response.headers.get("set-cookie").split(";")[0];
}

test("enforces token sessions, role writes, origin checks, and logout", async (t) => {
  const secureService = createStudioAuthService({ mode: "token", secureCookies: true, users: [{ id: "secure", name: "Secure", role: "admin", token: "secure-token" }] });
  assert.match((await secureService.login("secure-token")).cookie, /; Secure;/);
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-auth-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const authService = createStudioAuthService({
    mode: "token",
    users: [
      { id: "viewer-1", name: "只读用户", role: "viewer", token: "viewer-secret" },
      { id: "editor-1", name: "编辑用户", role: "editor", token: "editor-secret" }
    ]
  });
  const server = startPreviewServer({
    listenPort: 0,
    silent: true,
    authService,
    projectRepository: createProjectRepository({ directory: path.join(root, "projects") }),
    dataSourceRepository: createDataSourceRepository({ directory: path.join(root, "datasets") }),
    jobRepository: createJobRepository({ directory: path.join(root, "jobs") }),
    refreshScheduleRepository: createRefreshScheduleRepository({ directory: path.join(root, "schedules") })
  });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;

  const readinessResponse = await fetch(`${endpoint}/api/platform/readiness`);
  assert.equal(readinessResponse.status, 200);
  const readiness = await readinessResponse.json();
  assert.equal(readiness.provider, "file");
  assert.equal(readiness.deployment, "local-only");
  assert.equal(readiness.capabilities.productionReady, false);
  assert.equal(readiness.execution.distributed, false);
  assert.deepEqual(readiness.auditIntegrity, { appendOnly: false, hashChain: false, sealed: false });
  assert.deepEqual(readiness.queryCache, { status: "ok", shared: false, persistent: false });
  assert(readiness.checks.every(({ status }) => status === "ok"));
  assert.equal(JSON.stringify(readiness).includes(root), false);

  assert.equal((await fetch(`${endpoint}/api/projects`)).status, 401);
  const badLogin = await fetch(`${endpoint}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "wrong-secret" }) });
  assert.equal(badLogin.status, 401);
  assert.equal(JSON.stringify(await badLogin.json()).includes("wrong-secret"), false);

  const viewerLogin = await fetch(`${endpoint}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "viewer-secret" }) });
  assert.equal(viewerLogin.status, 200);
  const setCookie = viewerLogin.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.equal(setCookie.includes("viewer-secret"), false);
  const viewerCookie = cookieFrom(viewerLogin);
  assert.equal((await fetch(`${endpoint}/api/audit-events/verify`, { headers: { Cookie: viewerCookie } })).status, 501);
  const status = await fetch(`${endpoint}/api/auth/status`, { headers: { Cookie: viewerCookie } });
  assert.deepEqual((await status.json()).actor, { id: "viewer-1", name: "只读用户", role: "viewer", organizationId: "default" });
  assert.equal((await fetch(`${endpoint}/api/projects`, { headers: { Cookie: viewerCookie } })).status, 200);
  const viewerWrite = await fetch(`${endpoint}/api/data-sources/import`, { method: "POST", headers: { Cookie: viewerCookie, Origin: endpoint, "Content-Type": "application/json" }, body: JSON.stringify({ name: "blocked", format: "csv", content: "a\n1" }) });
  assert.equal(viewerWrite.status, 403);

  const editorLogin = await fetch(`${endpoint}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "editor-secret" }) });
  const editorCookie = cookieFrom(editorLogin);
  const missingOrigin = await fetch(`${endpoint}/api/data-sources/import`, { method: "POST", headers: { Cookie: editorCookie, "Content-Type": "application/json" }, body: JSON.stringify({ name: "blocked", format: "csv", content: "a\n1" }) });
  assert.equal(missingOrigin.status, 403);
  const imported = await fetch(`${endpoint}/api/data-sources/import`, { method: "POST", headers: { Cookie: editorCookie, Origin: endpoint, "Content-Type": "application/json" }, body: JSON.stringify({ id: "auth-data", name: "授权数据", format: "csv", content: "a\n1" }) });
  assert.equal(imported.status, 201);

  assert.equal((await fetch(`${endpoint}/api/auth/logout`, { method: "POST", headers: { Cookie: editorCookie } })).status, 403);
  const logout = await fetch(`${endpoint}/api/auth/logout`, { method: "POST", headers: { Cookie: editorCookie, Origin: endpoint } });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await fetch(`${endpoint}/api/projects`, { headers: { Cookie: editorCookie } })).status, 401);
});

test("filters projects by ACL and separates project editing from access management", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-project-acl-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRepository = createProjectRepository({ directory: path.join(root, "projects") });
  const owned = appendProjectRevision(createProject({ id: "acl-owned", name: "Owner project", ownerId: "owner-1", organizationId: "default" }), {
    id: "revision-acl-1", createdAt: "2026-08-10T08:00:00.000Z", source: "user", workspace: fixture.workspace
  });
  await projectRepository.update(owned.id, { expectedRevisionId: null, seed: owned }, (project) => project);
  const authService = createStudioAuthService({ mode: "token", users: [
    { id: "owner-1", name: "Owner", role: "editor", token: "owner-token" },
    { id: "member-1", name: "Member", role: "editor", token: "member-token" },
    { id: "outsider-1", name: "Outsider", role: "editor", token: "outsider-token" },
    { id: "other-admin", name: "Other Admin", role: "admin", token: "other-admin-token", organizationId: "other-org" }
  ] });
  const server = startPreviewServer({
    listenPort: 0, silent: true, authService, projectRepository,
    dataSourceRepository: createDataSourceRepository({ directory: path.join(root, "datasets") }),
    jobRepository: createJobRepository({ directory: path.join(root, "jobs") }),
    refreshScheduleRepository: createRefreshScheduleRepository({ directory: path.join(root, "schedules") })
  });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const login = async (token) => cookieFrom(await fetch(`${endpoint}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }));
  const ownerCookie = await login("owner-token");
  const memberCookie = await login("member-token");
  const outsiderCookie = await login("outsider-token");
  const otherAdminCookie = await login("other-admin-token");

  assert.equal((await (await fetch(`${endpoint}/api/projects`, { headers: { Cookie: outsiderCookie } })).json()).projects.length, 0);
  assert.equal((await (await fetch(`${endpoint}/api/projects`, { headers: { Cookie: otherAdminCookie } })).json()).projects.length, 0);
  assert.equal((await fetch(`${endpoint}/api/projects/acl-owned`, { headers: { Cookie: otherAdminCookie } })).status, 403);
  const directory = await (await fetch(`${endpoint}/api/auth/actors`, { headers: { Cookie: ownerCookie } })).json();
  assert.equal(directory.actors.some(({ id }) => id === "other-admin"), false);
  assert.equal(JSON.stringify(directory).includes("token"), false);
  assert.equal((await fetch(`${endpoint}/api/projects/acl-owned`, { headers: { Cookie: outsiderCookie } })).status, 403);
  assert.equal((await fetch(`${endpoint}/api/projects/acl-owned/access`, {
    method: "PUT", headers: { Cookie: ownerCookie, Origin: endpoint, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: owned.updatedAt, members: [{ actorId: "other-admin", role: "viewer" }] })
  })).status, 422);
  const grant = await fetch(`${endpoint}/api/projects/acl-owned/access`, {
    method: "PUT", headers: { Cookie: ownerCookie, Origin: endpoint, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: owned.updatedAt, members: [{ actorId: "member-1", role: "editor" }] })
  });
  assert.equal(grant.status, 200);
  const grantedProject = (await grant.json()).project;
  const memberList = await (await fetch(`${endpoint}/api/projects`, { headers: { Cookie: memberCookie } })).json();
  assert.equal(memberList.projects[0].accessRole, "editor");
  assert.equal((await fetch(`${endpoint}/api/projects/acl-owned/access`, {
    method: "PUT", headers: { Cookie: memberCookie, Origin: endpoint, "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: grantedProject.updatedAt, members: [] })
  })).status, 403);
  assert.equal((await fetch(`${endpoint}/api/projects/acl-owned/export`, {
    method: "POST", headers: { Cookie: memberCookie, Origin: endpoint, "Content-Type": "application/json" }, body: JSON.stringify({ revisionId: "revision-acl-1" })
  })).status, 200);

  const renamedResponse = await fetch(`${endpoint}/api/projects/acl-owned`, {
    method: "PATCH", headers: { Cookie: memberCookie, Origin: endpoint, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: grantedProject.updatedAt, name: "Renamed by editor" })
  });
  assert.equal(renamedResponse.status, 200);
  const renamed = (await renamedResponse.json()).project;
  assert.equal(renamed.name, "Renamed by editor");
  assert.equal((await fetch(`${endpoint}/api/projects/acl-owned`, {
    method: "PATCH", headers: { Cookie: memberCookie, Origin: endpoint, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: renamed.updatedAt, status: "archived" })
  })).status, 403);

  const copyResponse = await fetch(`${endpoint}/api/projects/acl-owned/copy`, {
    method: "POST", headers: { Cookie: memberCookie, Origin: endpoint, "Content-Type": "application/json" },
    body: JSON.stringify({ id: "acl-copy", name: "Independent copy" })
  });
  assert.equal(copyResponse.status, 201);
  const copied = (await copyResponse.json()).project;
  assert.equal(copied.access.ownerId, "member-1");
  assert.equal(copied.revisions.length, 1);
  assert.equal(copied.revisions[0].workspace.document.title, fixture.workspace.document.title);

  const archivedResponse = await fetch(`${endpoint}/api/projects/acl-owned`, {
    method: "PATCH", headers: { Cookie: ownerCookie, Origin: endpoint, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: renamed.updatedAt, status: "archived" })
  });
  assert.equal(archivedResponse.status, 200);
  assert.equal((await (await fetch(`${endpoint}/api/projects`, { headers: { Cookie: ownerCookie } })).json()).projects.length, 0);
  const withArchived = await (await fetch(`${endpoint}/api/projects?includeArchived=true`, { headers: { Cookie: ownerCookie } })).json();
  assert.equal(withArchived.projects[0].status, "archived");
  const auditResponse = await fetch(`${endpoint}/api/audit-events?projectId=acl-owned`, { headers: { Cookie: ownerCookie } });
  const audit = await auditResponse.json();
  assert.equal(auditResponse.status, 200, JSON.stringify(audit));
  assert.deepEqual(new Set(audit.events.map(({ action }) => action)), new Set(["project.access.updated", "project.renamed", "project.archived"]));
  assert.equal(JSON.stringify(audit).includes("token"), false);
  assert.equal((await (await fetch(`${endpoint}/api/audit-events`, { headers: { Cookie: otherAdminCookie } })).json()).events.length, 0);
});
