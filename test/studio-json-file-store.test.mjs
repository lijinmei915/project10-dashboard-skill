import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createJsonFileStore } from "../.agents/skills/dashboard-html/scripts/studio-json-file-store.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "dashboard-json-store-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, store: createJsonFileStore({ directory, validateId(id) { if (!/^[a-z0-9-]+$/.test(id)) throw new Error("invalid id"); return id; } }) };
}

test("creates private JSON files, reads missing values, and lists deterministically", async (t) => {
  const { directory, store } = await fixture(t);
  assert.equal(await store.read("missing"), null);
  await store.create("second", { id: "second", value: 2 });
  await store.create("first", { id: "first", value: 1 });
  assert.deepEqual((await store.list()).map(({ id }) => id), ["first", "second"]);
  assert.equal((await stat(path.join(directory, "first.json"))).mode & 0o777, 0o600);
  assert.equal(await readFile(path.join(directory, "first.json"), "utf8"), '{\n  "id": "first",\n  "value": 1\n}\n');
  await assert.rejects(() => store.create("first", { id: "first" }), (error) => error.code === "EEXIST");
});

test("atomically replaces a value without leaving temporary files", async (t) => {
  const { directory, store } = await fixture(t);
  await store.create("record", { version: 1 });
  await store.replace("record", { version: 2 });
  assert.deepEqual(await store.read("record"), { version: 2 });
  assert.deepEqual(await store.list(), [{ version: 2 }]);
  assert.deepEqual((await readdir(directory)).filter((file) => file.endsWith(".tmp")), []);
});

test("rejects unsafe ids and surfaces malformed persisted JSON", async (t) => {
  const { directory, store } = await fixture(t);
  await assert.rejects(() => store.read("../escape"), /invalid id/);
  await writeFile(path.join(directory, "broken.json"), "{not-json", { mode: 0o600 });
  await assert.rejects(() => store.read("broken"), SyntaxError);
});
