import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createStudioAuthService } from "../.agents/skills/dashboard-html/scripts/studio-auth-service.mjs";
import { createOrganizationService } from "../.agents/skills/dashboard-html/scripts/organization-service.mjs";
import { createOrganizationRepository } from "../.agents/skills/dashboard-html/scripts/studio-organization-repository.mjs";
import { createProjectRepository } from "../.agents/skills/dashboard-html/scripts/studio-project-repository.mjs";
import { createDataSourceRepository } from "../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";
import { createJobRepository } from "../.agents/skills/dashboard-html/scripts/studio-job-repository.mjs";
import { createRefreshScheduleRepository } from "../.agents/skills/dashboard-html/scripts/studio-refresh-schedule-repository.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";

test("audit anchor readiness and status stay minimal and require organization admin", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-anchor-http-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const identities = [
    { id: "anchor-admin", name: "Anchor Admin", role: "admin", token: "anchor-admin-token", organizationId: "acme" },
    { id: "anchor-member", name: "Anchor Member", role: "editor", token: "anchor-member-token", organizationId: "acme" }
  ];
  const organizationRepository = createOrganizationRepository({ directory: path.join(root, "organizations") });
  const organizationService = createOrganizationService({ repository: organizationRepository, identities });
  const authService = createStudioAuthService({ mode: "token", users: identities, organizationService });
  const anchorStatus = { status: "pending", headSequence: 8, headHash: "a".repeat(64), pending: 1, failed: 0 };
  const auditRepository = {
    integrity: { appendOnly: true, hashChain: true, sealed: true },
    async append() {},
    async list() { return []; },
    async anchorStatus() { return structuredClone(anchorStatus); },
    async listAnchorOutbox() { return []; },
    async acknowledgeAnchor() {},
    async recordAnchorFailure() {}
  };
  const auditAnchorDispatcher = { async flush() { return { pending: 0, delivered: 0, failed: 0 }; } };
  const server = startPreviewServer({
    listenPort: 0, silent: true, authService, organizationRepository, organizationService, auditRepository, auditAnchorDispatcher,
    projectRepository: createProjectRepository({ directory: path.join(root, "projects") }),
    dataSourceRepository: createDataSourceRepository({ directory: path.join(root, "datasets") }),
    jobRepository: createJobRepository({ directory: path.join(root, "jobs") }),
    refreshScheduleRepository: createRefreshScheduleRepository({ directory: path.join(root, "schedules") })
  });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const login = async (token) => (await fetch(`${endpoint}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })).headers.get("set-cookie").split(";", 1)[0];
  const adminCookie = await login("anchor-admin-token");
  const memberCookie = await login("anchor-member-token");
  const readiness = await fetch(`${endpoint}/api/platform/readiness`);
  assert.equal(readiness.status, 200);
  assert.deepEqual((await readiness.json()).auditAnchor, { status: "configured" });
  assert.equal((await fetch(`${endpoint}/api/audit-events/anchor-status`, { headers: { Cookie: memberCookie } })).status, 403);
  const status = await fetch(`${endpoint}/api/audit-events/anchor-status`, { headers: { Cookie: adminCookie } });
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), anchorStatus);
});
