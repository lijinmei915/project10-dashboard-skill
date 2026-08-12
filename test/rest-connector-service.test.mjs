import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createRestConnectorService } from "../.agents/skills/dashboard-html/scripts/rest-connector-service.mjs";
import { createDataSourceRepository } from "../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `127.0.0.1:${server.address().port}`;
}

test("connects to an allowlisted REST source without persisting credentials", async (t) => {
  let version = 1;
  const upstream = http.createServer((request, response) => {
    if (request.url === "/redirect") { response.writeHead(302, { Location: "/data" }); return response.end(); }
    if (request.headers.authorization !== "Bearer server-only-secret") { response.writeHead(401); return response.end("unauthorized"); }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ payload: { rows: version === 1 ? [{ month: "2026-01", revenue: 1200 }, { month: "2026-02", revenue: 1800 }] : [{ month: "2026-03", revenue: 2400 }] } }));
  });
  const host = await listen(upstream);
  t.after(() => new Promise((resolve) => upstream.close(resolve)));
  const service = createRestConnectorService({ allowedHosts: [host], credentials: { "sales-api": { Authorization: "Bearer server-only-secret" } }, allowInsecure: true });
  const source = await service.create({ id: "rest-sales", name: "REST 销售", connector: { url: `http://${host}/data`, recordsPath: "payload.rows", credentialRef: "sales-api" }, now: "2026-08-10T06:00:00.000Z" });
  assert.equal(source.kind, "rest");
  assert.equal(source.rowCount, 2);
  assert.equal(source.semanticModel.metrics[0].label, "revenue");
  assert.doesNotMatch(JSON.stringify(source), /server-only-secret/);
  version = 2;
  const refreshed = await service.refresh(source, { now: "2026-08-10T06:01:00.000Z" });
  assert.equal(refreshed.rowCount, 1);
  assert.equal(refreshed.records[0].revenue, 2400);
  assert.equal(refreshed.semanticModel.version, source.semanticModel.version);
  await assert.rejects(() => service.create({ name: "redirect", connector: { url: `http://${host}/redirect`, credentialRef: "sales-api" } }), /不允许重定向/);
  await assert.rejects(() => service.create({ name: "blocked", connector: { url: "https://example.com/data" } }), /不在服务端白名单/);
  await assert.rejects(() => service.create({ name: "query-secret", connector: { url: `http://${host}/data?api_key=secret` } }), /不能在查询参数中携带凭证/);
});

test("serves REST connect and refresh through the Data Source API", async (t) => {
  let revenue = 1200;
  const upstream = http.createServer((request, response) => { response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify([{ region: "east", revenue }])); });
  const host = await listen(upstream);
  t.after(() => new Promise((resolve) => upstream.close(resolve)));
  const directory = await mkdtemp(path.join(tmpdir(), "dashboard-rest-source-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataSourceRepository = createDataSourceRepository({ directory });
  const restConnector = createRestConnectorService({ allowedHosts: [host], allowInsecure: true });
  const server = startPreviewServer({ listenPort: 0, silent: true, dataSourceRepository, restConnector });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const connectResponse = await fetch(`${endpoint}/api/data-sources/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "rest-api", name: "REST API", connector: { url: `http://${host}/data` } }) });
  assert.equal(connectResponse.status, 201);
  const connected = (await connectResponse.json()).dataSource;
  assert.equal(connected.rowCount, 1);
  revenue = 2600;
  const refreshResponse = await fetch(`${endpoint}/api/data-sources/rest-api/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: connected.updatedAt }) });
  assert.equal(refreshResponse.status, 200);
  const refreshed = (await refreshResponse.json()).dataSource;
  assert.equal(refreshed.records[0].revenue, 2600);
  assert.equal(refreshed.refresh.status, "ready");
  const unconfiguredServer = startPreviewServer({ listenPort: 0, silent: true, dataSourceRepository: createDataSourceRepository({ directory: path.join(directory, "other") }), restConnector: createRestConnectorService() });
  await new Promise((resolve) => unconfiguredServer.once("listening", resolve));
  t.after(() => new Promise((resolve) => unconfiguredServer.close(resolve)));
  const unavailable = await fetch(`http://127.0.0.1:${unconfiguredServer.address().port}/api/data-sources/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Unavailable", connector: { url: "https://example.com" } }) });
  assert.equal(unavailable.status, 503);
});
