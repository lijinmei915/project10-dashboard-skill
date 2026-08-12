import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createProviderFromEnv, runGenerationWithProvider } from "../.agents/skills/dashboard-html/scripts/provider-gateway.mjs";
import { createOrganizationProviderManager, createProviderProfileRepository } from "../.agents/skills/dashboard-html/scripts/provider-profile-service.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/sales-dashboard-generation.json", import.meta.url), "utf8"));
const baseline = { version: 2, theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" }, layout: { sections: [] }, logo: null };

function chat(candidate = fixture) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }), { status: 200 });
}

test("persists organization provider profiles separately from credentials", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-provider-profiles-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = createProviderProfileRepository({ configurationDirectory: path.join(root, "config"), secretDirectory: path.join(root, "secrets") });
  const calls = [];
  const manager = createOrganizationProviderManager({
    repository,
    fallbackProvider: createProviderFromEnv({}),
    fetchImpl: async (url, options) => { calls.push({ url, authorization: options.headers.Authorization }); return chat(); }
  });

  await manager.upsert("org-a", { id: "primary", name: "主模型", apiBase: "https://a.example/v1", model: "a-model", apiKey: "org-a-secret" });
  await manager.upsert("org-b", { id: "primary", name: "主模型", apiBase: "https://b.example/v1", model: "b-model", apiKey: "org-b-secret" });
  assert.equal((await manager.profiles("org-a"))[0].model, "a-model");
  assert.equal((await manager.profiles("org-b"))[0].model, "b-model");
  assert(!JSON.stringify(await manager.profiles("org-a")).includes("secret"));

  const configText = await readFile(path.join(root, "config", "org-a.json"), "utf8");
  assert(!configText.includes("org-a-secret"));
  assert(!configText.includes("apiKey"));
  assert((await readFile(path.join(root, "secrets", "org-a.json"), "utf8")).includes("org-a-secret"));

  const runA = await runGenerationWithProvider(manager, { request: fixture.request, baseWorkspace: baseline, providerContext: { organizationId: "org-a" } });
  const runB = await runGenerationWithProvider(manager, { request: fixture.request, baseWorkspace: baseline, providerContext: { organizationId: "org-b" } });
  assert.equal(runA.status, "preview-ready");
  assert.equal(runB.status, "preview-ready");
  assert.deepEqual(calls.map(({ url }) => url), ["https://a.example/v1/chat/completions", "https://b.example/v1/chat/completions"]);
  assert.deepEqual(calls.map(({ authorization }) => authorization), ["Bearer org-a-secret", "Bearer org-b-secret"]);

  const restarted = createOrganizationProviderManager({ repository, fallbackProvider: createProviderFromEnv({}), fetchImpl: async () => chat() });
  assert.equal((await restarted.profiles("org-a")).find(({ active }) => active).id, "primary");
});

test("updates credentials only when supplied and falls back after the last profile is removed", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-provider-update-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = createProviderProfileRepository({ configurationDirectory: path.join(root, "config"), secretDirectory: path.join(root, "secrets") });
  const manager = createOrganizationProviderManager({ repository, fallbackProvider: createProviderFromEnv({}), fetchImpl: async () => chat() });
  await manager.upsert("org-a", { id: "one", name: "连接一", apiBase: "https://one.example/v1", model: "model-one", apiKey: "keep-this-key" });
  await manager.upsert("org-a", { id: "one", name: "连接一更新", apiBase: "https://one.example/v1", model: "model-two" });
  assert.equal((await manager.profiles("org-a"))[0].model, "model-two");
  assert((await readFile(path.join(root, "secrets", "org-a.json"), "utf8")).includes("keep-this-key"));
  const profiles = await manager.remove("org-a", "one");
  assert.equal(profiles[0].id, "deterministic-local");
  assert.equal(profiles[0].builtIn, true);
});

test("organization admins create, activate, and delete persisted profiles through HTTP", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-provider-http-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = createProviderProfileRepository({ configurationDirectory: path.join(root, "config"), secretDirectory: path.join(root, "secrets") });
  const manager = createOrganizationProviderManager({ repository, fallbackProvider: createProviderFromEnv({}), fetchImpl: async (url) => url.endsWith("/models") ? new Response(JSON.stringify({ data: [{ id: "model-one" }] }), { status: 200 }) : new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { status: 200 }) });
  const server = startPreviewServer({ listenPort: 0, silent: true, provider: manager });
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { "Content-Type": "application/json", Origin: origin };

  const saved = await fetch(`${origin}/api/ai-providers`, { method: "PUT", headers, body: JSON.stringify({ id: "team", name: "团队模型", apiBase: "https://team.example/v1", model: "model-one", apiKey: "http-secret" }) });
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.profiles[0].active, true);
  assert(!JSON.stringify(savedBody).includes("http-secret"));
  assert(!JSON.stringify(savedBody).includes("team.example"));

  const probed = await fetch(`${origin}/api/ai-providers/models/probe`, { method: "POST", headers, body: JSON.stringify({ profileId: "team" }) });
  assert.deepEqual(await probed.json(), { models: ["model-one"] });

  const listed = await fetch(`${origin}/api/ai-providers`).then((response) => response.json());
  assert.equal(listed.profiles[0].id, "team");
  assert.equal(listed.profiles[0].credentialConfigured, true);
  assert.deepEqual(await fetch(`${origin}/api/ai-providers/models?profileId=team`).then((response) => response.json()), { models: ["model-one"] });

  const removed = await fetch(`${origin}/api/ai-providers/team`, { method: "DELETE", headers });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).profiles[0].id, "deterministic-local");
});
