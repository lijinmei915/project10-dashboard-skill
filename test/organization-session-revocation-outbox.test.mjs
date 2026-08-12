import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createOrganizationService } from "../.agents/skills/dashboard-html/scripts/organization-service.mjs";
import { createOrganizationRepository } from "../.agents/skills/dashboard-html/scripts/studio-organization-repository.mjs";
import { createOrganizationSessionRevocationOutboxDispatcher } from "../.agents/skills/dashboard-html/scripts/studio-organization-session-revocation-outbox.mjs";

const identities = [
  { id: "admin", name: "Admin", role: "admin", organizationId: "acme" },
  { id: "member", name: "Member", role: "editor", organizationId: "acme" }
];

test("member suspension persists session revocation until a dispatcher acknowledges it", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-session-revocation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let now = Date.parse("2026-08-11T14:00:00.000Z");
  const repository = createOrganizationRepository({ directory: root });
  const service = createOrganizationService({ repository, identities, clock: () => now });
  const current = await service.current(identities[0], { includeMembers: true });
  now += 1_000;
  await service.updateMembers(identities[0], {
    expectedUpdatedAt: current.updatedAt,
    members: [{ actorId: "admin", role: "admin", status: "active" }, { actorId: "member", role: "member", status: "suspended" }]
  });

  const failing = createOrganizationSessionRevocationOutboxDispatcher({
    organizationRepository: repository,
    authService: { async revokeActorSessions() { throw new Error("session store unavailable"); } }
  });
  assert.deepEqual(await failing.flush(), { pending: 1, delivered: 0, failed: 1, sessionsRevoked: 0 });
  assert.equal((await repository.listSessionRevocations()).length, 1);

  const calls = [];
  const recovered = createOrganizationSessionRevocationOutboxDispatcher({
    organizationRepository: repository,
    authService: { async revokeActorSessions(actorId, organizationId) { calls.push({ actorId, organizationId }); return 2; } }
  });
  assert.deepEqual(await recovered.flush(), { pending: 1, delivered: 1, failed: 0, sessionsRevoked: 2 });
  assert.deepEqual(calls, [{ actorId: "member", organizationId: "acme" }]);
  assert.deepEqual(await repository.listSessionRevocations(), []);
  assert.equal(Object.hasOwn(await repository.get("acme"), "_sessionRevocations"), false);
});
