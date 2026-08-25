import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createDataSourceRepository } from "../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";

async function readEvent(reader, state) {
  const timeout = setTimeout(() => reader.cancel("timeout"), 3_000);
  try {
    while (!state.buffer.includes("\n\n")) {
      const { done, value } = await reader.read();
      if (done) throw new Error("event stream ended before the next event");
      state.buffer += state.decoder.decode(value, { stream: true });
    }
    const boundary = state.buffer.indexOf("\n\n");
    const frame = state.buffer.slice(0, boundary);
    state.buffer = state.buffer.slice(boundary + 2);
    const fields = Object.fromEntries(frame.split("\n").filter((line) => line.includes(": ")).map((line) => {
      const index = line.indexOf(": ");
      return [line.slice(0, index), line.slice(index + 2)];
    }));
    if (!fields.event) return readEvent(reader, state);
    return { id: fields.id || "", type: fields.event, data: JSON.parse(fields.data || "{}") };
  } finally {
    clearTimeout(timeout);
  }
}

test("dataset SSE emits safe snapshots, updates, and reconnect catch-up", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "dashboard-dataset-events-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataSourceRepository = createDataSourceRepository({ directory });
  const server = startPreviewServer({ listenPort: 0, silent: true, dataSourceRepository });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const importedResponse = await fetch(`${endpoint}/api/data-sources/import`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "event-sales", name: "实时销售", format: "csv", portable: false, content: "区域,收入\n华东,100" })
  });
  assert.equal(importedResponse.status, 201);
  const imported = (await importedResponse.json()).dataSource;

  const stream = await fetch(`${endpoint}/api/data-sources/event-sales/events`);
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get("content-type"), /text\/event-stream/);
  const reader = stream.body.getReader();
  const state = { buffer: "", decoder: new TextDecoder() };
  const snapshot = await readEvent(reader, state);
  assert.equal(snapshot.type, "dataset.snapshot");
  assert.deepEqual(Object.keys(snapshot.data).sort(), ["datasetId", "updatedAt", "version"]);
  assert.equal(JSON.stringify(snapshot).includes("records"), false);

  const refreshedResponse = await fetch(`${endpoint}/api/data-sources/event-sales/refresh`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: imported.updatedAt, content: "区域,收入\n华东,180" })
  });
  assert.equal(refreshedResponse.status, 200);
  const updated = await readEvent(reader, state);
  assert.equal(updated.type, "dataset.updated");
  assert.equal(updated.data.datasetId, "event-sales");
  assert.notEqual(updated.id, snapshot.id);
  await reader.cancel();

  const catchup = await fetch(`${endpoint}/api/data-sources/event-sales/events`, { headers: { "Last-Event-ID": snapshot.id } });
  const catchupReader = catchup.body.getReader();
  const caughtUp = await readEvent(catchupReader, { buffer: "", decoder: new TextDecoder() });
  assert.equal(caughtUp.type, "dataset.updated");
  assert.equal(caughtUp.id, updated.id);
  await catchupReader.cancel();
});
