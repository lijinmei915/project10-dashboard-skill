import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkspaceSession,
  WORKSPACE_HISTORY_KEY,
  WORKSPACE_PREVIOUS_KEY,
  WORKSPACE_STORAGE_KEY
} from "../studio/workspace-session.mjs";

function fixture({ href = "http://localhost/editor?design=1", embedded = null } = {}) {
  const values = new Map();
  let replaced = null;
  const session = createWorkspaceSession({
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    },
    location: { href },
    history: { replaceState: (_state, _title, url) => { replaced = url; } },
    readEmbeddedState: () => embedded
  });
  return { session, values, replaced: () => replaced };
}

test("reads valid local workspace and reports malformed JSON", () => {
  const { session, values } = fixture();
  values.set(WORKSPACE_STORAGE_KEY, '{"version":2}');
  assert.deepEqual(session.readLocal(), { ok: true, value: { version: 2 } });
  values.set(WORKSPACE_STORAGE_KEY, "{");
  assert.equal(session.readLocal().code, "LOCAL_INVALID");
});

test("reads query state before legacy hash config", () => {
  const query = encodeURIComponent('{"source":"query"}');
  const hash = encodeURIComponent('{"source":"hash"}');
  assert.deepEqual(fixture({ href: `http://localhost/editor?state=${query}#config=${hash}` }).session.readUrl().value, { source: "query" });
  assert.deepEqual(fixture({ href: `http://localhost/editor#config=${hash}` }).session.readUrl().value, { source: "hash" });
});

test("reports malformed URL workspace", () => {
  assert.equal(fixture({ href: "http://localhost/editor?state=%7B" }).session.readUrl().code, "URL_INVALID");
});

test("writes URL state without logo and removes legacy config", () => {
  const current = fixture({ href: "http://localhost/editor?design=1#config=old&keep=yes" });
  assert.equal(current.session.writeUrl({ version: 2, logo: "data:image/png;base64,secret" }).ok, true);
  const next = new URL(current.replaced(), "http://localhost");
  assert.deepEqual(JSON.parse(next.searchParams.get("state")), { version: 2, logo: null });
  assert.equal(new URLSearchParams(next.hash.slice(1)).has("config"), false);
  assert.equal(new URLSearchParams(next.hash.slice(1)).get("keep"), "yes");
});

test("persists local workspace and reports storage quota failure", () => {
  const current = fixture();
  assert.equal(current.session.persistLocal({ version: 2 }).value, '{"version":2}');
  assert.equal(current.values.get(WORKSPACE_STORAGE_KEY), '{"version":2}');
  const failing = createWorkspaceSession({
    storage: { setItem() { throw new Error("quota"); } },
    location: { href: "http://localhost" }, history: {}, readEmbeddedState: () => null
  });
  assert.equal(failing.persistLocal({}).code, "STORAGE_WRITE_FAILED");
});

test("clears both legacy history keys", () => {
  const { session, values } = fixture();
  values.set(WORKSPACE_HISTORY_KEY, "history");
  values.set(WORKSPACE_PREVIOUS_KEY, "previous");
  assert.equal(session.clearLegacyHistory().ok, true);
  assert.equal(values.has(WORKSPACE_HISTORY_KEY), false);
  assert.equal(values.has(WORKSPACE_PREVIOUS_KEY), false);
});

test("reads embedded project state and reports malformed JSON", () => {
  assert.deepEqual(fixture({ embedded: '{"version":2}' }).session.readEmbedded().value, { version: 2 });
  assert.equal(fixture({ embedded: "{" }).session.readEmbedded().code, "EMBEDDED_INVALID");
});
