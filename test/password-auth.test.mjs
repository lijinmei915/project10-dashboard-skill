import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAccountRepository } from "../.agents/skills/dashboard-html/scripts/studio-account-repository.mjs";
import { createStudioAuthService } from "../.agents/skills/dashboard-html/scripts/studio-auth-service.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createProjectRepository } from "../.agents/skills/dashboard-html/scripts/studio-project-repository.mjs";
import { createProject } from "../.agents/skills/dashboard-html/scripts/project-store.mjs";

test("registers and authenticates an isolated personal account without storing plaintext passwords", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-account-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const accounts = createAccountRepository({ directory: path.join(root, "accounts") });
  const authService = createStudioAuthService({ mode: "password", accountRepository: accounts });
  const server = startPreviewServer({ listenPort: 0, silent: true, authService });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;

  const anonymousStatus = await (await fetch(`${endpoint}/api/auth/status`)).json();
  assert.deepEqual(anonymousStatus, {
    mode: "password",
    authenticated: false,
    capabilities: { registration: true, passwordRecovery: false }
  });

  const registered = await fetch(`${endpoint}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "USER@example.com", name: "测试用户", password: "correct-horse-2026" }) });
  assert.equal(registered.status, 201);
  const registration = await registered.json();
  assert.equal(registration.actor.role, "editor");
  assert.match(registration.actor.organizationId, /^personal-/);
  assert(!JSON.stringify(registration).includes("correct-horse-2026"));
  assert.match(registered.headers.get("set-cookie"), /HttpOnly/);

  const files = await readdir(path.join(root, "accounts"));
  assert.equal(files.length, 1);
  const stored = await readFile(path.join(root, "accounts", files[0]), "utf8");
  assert(!stored.includes("correct-horse-2026"));
  assert(stored.includes("scrypt$16384$8$1$"));
  assert.equal((await stat(path.join(root, "accounts", files[0]))).mode & 0o777, 0o600);

  const duplicate = await fetch(`${endpoint}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "user@example.com", name: "重复用户", password: "another-password-2026" }) });
  assert.equal(duplicate.status, 409);
  const failed = await fetch(`${endpoint}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "user@example.com", password: "wrong-password" }) });
  assert.equal(failed.status, 401);
  const loggedIn = await fetch(`${endpoint}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "user@example.com", password: "correct-horse-2026" }) });
  assert.equal(loggedIn.status, 200);
  assert.equal((await loggedIn.json()).actor.id, registration.actor.id);
  const cookie = loggedIn.headers.get("set-cookie").split(";", 1)[0];
  const restored = await fetch(`${endpoint}/api/auth/status`, { headers: { Cookie: cookie } });
  assert.equal((await restored.json()).actor.id, registration.actor.id);
  const logout = await fetch(`${endpoint}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie, Origin: endpoint } });
  assert.equal(logout.status, 200); assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await (await fetch(`${endpoint}/api/auth/status`, { headers: { Cookie: cookie } })).json()).authenticated, false);
});

test("advertises local mode as authentication-free without account capabilities", async () => {
  const authService = createStudioAuthService({ mode: "disabled" });
  assert.deepEqual(await authService.status(), {
    mode: "disabled",
    authenticated: true,
    capabilities: { registration: false, passwordRecovery: false },
    actor: { id: "local-admin", name: "Local Admin", role: "admin", organizationId: "local" },
    expiresAt: null
  });
});

test("rate limits repeated password failures without exposing account state", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-account-limit-")); t.after(() => rm(root, { recursive: true, force: true }));
  const accounts = createAccountRepository({ directory: path.join(root, "accounts") }); const authService = createStudioAuthService({ mode: "password", accountRepository: accounts });
  const server = startPreviewServer({ listenPort: 0, silent: true, authService });
  await new Promise((resolve) => server.once("listening", resolve)); t.after(() => new Promise((resolve) => server.close(resolve))); const endpoint = `http://127.0.0.1:${server.address().port}`;
  for (let index = 0; index < 8; index += 1) assert.equal((await fetch(`${endpoint}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "missing-limit@example.com", password: "incorrect-password" }) })).status, 401);
  const limited = await fetch(`${endpoint}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "missing-limit@example.com", password: "incorrect-password" }) });
  assert.equal(limited.status, 429); assert(Number(limited.headers.get("retry-after")) > 0); assert(!JSON.stringify(await limited.json()).includes("missing-limit@example.com"));
});

test("isolates project listings between personal accounts", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-personal-space-")); t.after(() => rm(root, { recursive: true, force: true }));
  const accounts = createAccountRepository({ directory: path.join(root, "accounts") }); const authService = createStudioAuthService({ mode: "password", accountRepository: accounts });
  const projectRepository = createProjectRepository({ directory: path.join(root, "projects") });
  const server = startPreviewServer({ listenPort: 0, silent: true, authService, projectRepository }); await new Promise((resolve) => server.once("listening", resolve)); t.after(() => new Promise((resolve) => server.close(resolve))); const endpoint = `http://127.0.0.1:${server.address().port}`;
  const register = async (email, name) => {
    const response = await fetch(`${endpoint}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, name, password: "personal-space-2026" }) });
    return { payload: await response.json(), cookie: response.headers.get("set-cookie").split(";", 1)[0] };
  };
  const first = await register("first@example.com", "第一位用户"); const second = await register("second@example.com", "第二位用户");
  const owned = createProject({ id: "personal-project", name: "Personal project", ownerId: first.payload.actor.id, organizationId: first.payload.actor.organizationId });
  await projectRepository.update(owned.id, { expectedRevisionId: null, seed: owned }, (project) => project);
  const firstList = await (await fetch(`${endpoint}/api/projects`, { headers: { Cookie: first.cookie } })).json(); const secondList = await (await fetch(`${endpoint}/api/projects`, { headers: { Cookie: second.cookie } })).json();
  assert.equal(firstList.projects.length, 1); assert.equal(secondList.projects.length, 0);
});
