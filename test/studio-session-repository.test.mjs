import assert from "node:assert/strict";
import test from "node:test";
import { createStudioAuthService } from "../.agents/skills/dashboard-html/scripts/studio-auth-service.mjs";
import { assertSessionRepository, createMemorySessionRepository } from "../.agents/skills/dashboard-html/scripts/studio-session-repository.mjs";

test("memory sessions expire and return isolated values", async () => {
  let now = 1_000;
  const repository = createMemorySessionRepository({ clock: () => now });
  await repository.put("session", { actorId: "actor", organizationId: "org", expiresAt: 2_000 });
  const first = await repository.get("session");
  first.actorId = "changed";
  assert.equal((await repository.get("session")).actorId, "actor");
  now = 2_000;
  assert.equal(await repository.get("session"), null);
  assert.equal(await repository.prune(), 0);
  assert.deepEqual(repository.capabilities, { durable: false, shared: false, multiInstance: false });
});

test("auth stores only a session digest and resolves the current configured identity", async () => {
  const memory = createMemorySessionRepository();
  let storedId = null;
  const repository = {
    ...memory,
    async put(id, value) {
      storedId = id;
      return memory.put(id, value);
    }
  };
  assertSessionRepository(repository);
  const auth = createStudioAuthService({
    mode: "token",
    users: [{ id: "editor", name: "Editor", role: "editor", token: "login-secret", organizationId: "org" }],
    sessionRepository: repository
  });
  const login = await auth.login("login-secret");
  const cookie = login.cookie.split(";", 1)[0];
  const rawSessionId = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
  assert.match(storedId, /^[a-f0-9]{64}$/);
  assert.notEqual(storedId, rawSessionId);
  assert.equal(JSON.stringify(await memory.get(storedId)).includes("login-secret"), false);
  assert.deepEqual((await auth.status({ headers: { cookie } })).actor, { id: "editor", name: "Editor", role: "editor", organizationId: "org" });
  await auth.logout({ headers: { cookie } });
  assert.equal((await auth.status({ headers: { cookie } })).authenticated, false);

  const secondLogin = await auth.login("login-secret");
  assert.equal(await auth.revokeActorSessions("editor", "org"), 1);
  assert.equal((await auth.status({ headers: { cookie: secondLogin.cookie.split(";", 1)[0] } })).authenticated, false);
});

test("auth readiness reports a repository probe failure without details", async () => {
  const auth = createStudioAuthService({
    mode: "token",
    users: [{ id: "editor", name: "Editor", role: "editor", token: "secret" }],
    sessionRepository: {
      provider: "broken",
      capabilities: { durable: true, shared: true, multiInstance: true },
      get: async () => null,
      put: async () => {},
      delete: async () => false,
      deleteByActor: async () => 0,
      prune: async () => 0,
      probe: async () => { throw new Error("database password leaked"); }
    }
  });
  assert.deepEqual(await auth.readiness(), {
    status: "error",
    mode: "token",
    provider: "broken",
    capabilities: { durable: true, shared: true, multiInstance: true },
    error: "probe-failed"
  });
});
