import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createStudioAuthService } from "../.agents/skills/dashboard-html/scripts/studio-auth-service.mjs";
import { createDataSourceRepository } from "../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";
import { normalizePublicOrigin } from "../.agents/skills/dashboard-html/scripts/studio-deployment-config.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const buildScript = path.join(repoRoot, ".agents/skills/dashboard-html/scripts/build-studio-web.mjs");

test("serves the independent Studio build without capturing API or publication routes", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "dashboard-studio-serving-"));
  const studioWebRoot = path.join(tempRoot, "studio-web");
  const build = spawnSync(process.execPath, [buildScript, "--output", studioWebRoot], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const server = startPreviewServer({ listenPort: 0, silent: true, studioWebRoot });
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(tempRoot, { recursive: true, force: true });
  });

  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const root = await fetch(`${endpoint}/`);
  const rootHtml = await root.text();
  assert.equal(root.status, 200);
  assert.match(root.headers.get("content-type"), /^text\/html/);
  assert.equal(root.headers.get("cache-control"), "no-cache");

  for (const route of [
    "/studio/projects",
    "/studio/projects/project-deep-link",
    "/studio/organizations/current",
    "/studio/publications/publication-deep-link",
    "/studio/future-route"
  ]) {
    const response = await fetch(`${endpoint}${route}`);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get("cache-control"), "no-cache", route);
    assert.equal(await response.text(), rootHtml, route);
  }

  const moduleResponse = await fetch(`${endpoint}/studio/workspace-core-client.mjs`);
  assert.equal(moduleResponse.status, 200);
  assert.match(moduleResponse.headers.get("content-type"), /^text\/javascript/);
  assert.equal(moduleResponse.headers.get("cache-control"), "no-cache");
  assert.match(await moduleResponse.text(), /\.\/workspace-core-runtime\.mjs/);

  const echartsResponse = await fetch(`${endpoint}/vendor/echarts.mjs`);
  assert.equal(echartsResponse.status, 200);
  assert.match(echartsResponse.headers.get("content-type"), /^text\/javascript/);
  assert.match(echartsResponse.headers.get("cache-control"), /immutable/);
  assert((await echartsResponse.text()).length > 400_000);

  const missingModule = await fetch(`${endpoint}/studio/missing-module.mjs`);
  assert.equal(missingModule.status, 404);
  assert.match(missingModule.headers.get("content-type"), /^application\/json/);

  const health = await fetch(`${endpoint}/api/generation/health`);
  assert.equal(health.status, 200);
  assert.match(health.headers.get("content-type"), /^application\/json/);
  assert.equal((await health.json()).provider, "organization-profiles");

  for (const route of ["/p/missing-publication", "/embed/missing-publication"]) {
    const response = await fetch(`${endpoint}${route}`);
    assert.equal(response.status, 404, route);
    assert.match(response.headers.get("content-type"), /^application\/json/);
    assert.notEqual(await response.text(), rootHtml, route);
  }
});

test("serves Studio safely behind a reverse proxy with an explicit public origin", async (t) => {
  assert.equal(normalizePublicOrigin("https://studio.example.test/"), "https://studio.example.test");
  assert.throws(() => normalizePublicOrigin("http://studio.example.test"), /must use HTTPS/);
  assert.throws(() => normalizePublicOrigin("https://studio.example.test/studio"), /only scheme, host/);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "dashboard-studio-proxy-"));
  const studioWebRoot = path.join(tempRoot, "studio-web");
  const build = spawnSync(process.execPath, [buildScript, "--output", studioWebRoot], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const authService = createStudioAuthService({
    mode: "token",
    secureCookies: true,
    users: [{ id: "proxy-editor", name: "Proxy Editor", role: "editor", token: "proxy-secret", organizationId: "proxy-org" }]
  });
  const backend = startPreviewServer({
    listenPort: 0,
    silent: true,
    studioWebRoot,
    publicOrigin: "https://studio.example.test",
    authService,
    dataSourceRepository: createDataSourceRepository({ directory: path.join(tempRoot, "data-sources") })
  });
  await new Promise((resolve, reject) => { backend.once("listening", resolve); backend.once("error", reject); });
  const backendPort = backend.address().port;
  const proxy = http.createServer((incoming, outgoing) => {
    const forwarded = http.request({
      hostname: "127.0.0.1",
      port: backendPort,
      method: incoming.method,
      path: incoming.url,
      headers: { ...incoming.headers, host: `studio-backend.internal:${backendPort}` }
    }, (response) => {
      outgoing.writeHead(response.statusCode, response.headers);
      response.pipe(outgoing);
    });
    forwarded.on("error", (error) => outgoing.destroy(error));
    incoming.pipe(forwarded);
  });
  await new Promise((resolve, reject) => { proxy.listen(0, "127.0.0.1", resolve); proxy.once("error", reject); });
  t.after(async () => {
    await Promise.all([backend, proxy].map((server) => new Promise((resolve) => server.close(resolve))));
    await rm(tempRoot, { recursive: true, force: true });
  });

  const endpoint = `http://127.0.0.1:${proxy.address().port}`;
  const studio = await fetch(`${endpoint}/studio/projects/proxy-project`);
  assert.equal(studio.status, 200);
  assert.match(studio.headers.get("content-type"), /^text\/html/);

  const login = await fetch(`${endpoint}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "proxy-secret" })
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /; Secure;/);
  const cookie = login.headers.get("set-cookie").split(";", 1)[0];

  const imported = await fetch(`${endpoint}/api/data-sources/import`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: "https://studio.example.test", "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Proxy CSV", format: "csv", content: "value\n1" })
  });
  assert.equal(imported.status, 201);

  const rejected = await fetch(`${endpoint}/api/data-sources/import`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: endpoint, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Wrong Origin", format: "csv", content: "value\n2" })
  });
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json()).code, "csrf");
});
