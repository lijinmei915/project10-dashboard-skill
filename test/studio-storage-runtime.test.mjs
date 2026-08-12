import assert from "node:assert/strict";
import test from "node:test";
import { createStorageRuntime, STORAGE_PORTS } from "../.agents/skills/dashboard-html/scripts/studio-storage-runtime.mjs";

function repositories({ fail = null } = {}) {
  return Object.fromEntries(Object.entries(STORAGE_PORTS).map(([name, methods]) => [name, Object.fromEntries(methods.map((method) => [method, async () => {
    if (fail === name && method === "list") throw new Error(`${name} unavailable`);
    return method === "get" ? null : [];
  }]))]));
}

test("validates every storage port at composition time", () => {
  const missing = repositories();
  delete missing.projects.update;
  assert.throws(() => createStorageRuntime({ repositories: missing }), /projects is missing methods: update/);
});

test("reports file storage as operational but local-only", async () => {
  const runtime = createStorageRuntime({ repositories: repositories() });
  const readiness = await runtime.readiness();
  assert.equal(readiness.status, "ok");
  assert.equal(readiness.provider, "file");
  assert.equal(readiness.deployment, "local-only");
  assert.equal(readiness.capabilities.durable, true);
  assert.equal(readiness.capabilities.shared, false);
  assert.equal(readiness.capabilities.multiInstance, false);
  assert.equal(readiness.capabilities.productionReady, false);
  assert(readiness.checks.every(({ status }) => status === "ok"));
});

test("fails readiness when a repository probe is unavailable", async () => {
  const readiness = await createStorageRuntime({ repositories: repositories({ fail: "jobs" }) }).readiness();
  assert.equal(readiness.status, "error");
  assert.deepEqual(readiness.checks.find(({ name }) => name === "jobs"), { name: "jobs", status: "error", error: "probe-failed" });
  assert.equal(JSON.stringify(readiness).includes("jobs unavailable"), false);
});

test("requires explicit capabilities from future shared providers", () => {
  assert.throws(() => createStorageRuntime({ provider: "postgresql", repositories: repositories(), capabilities: { durable: true } }), /Storage capability is required: shared/);
  assert.throws(() => createStorageRuntime({
    provider: "postgresql",
    repositories: repositories(),
    capabilities: { durable: true, shared: false, multiInstance: true, conditionalWrites: "compare-and-swap", transactions: "database", transactionalOutbox: "database", productionReady: true }
  }), /Production-ready storage requires/);
});
