import assert from "node:assert/strict";
import test from "node:test";
import { createAuditAnchorDispatcher } from "../.agents/skills/dashboard-html/scripts/studio-audit-anchor-dispatcher.mjs";

const anchor = Object.freeze({ schemaVersion: 1, anchorId: `anchor-${"a".repeat(64)}`, organizationId: "acme", headSequence: 4, headHash: "b".repeat(64), anchoredThrough: "2026-08-11T16:00:00.000Z", chainAlgorithm: "sha256-v1" });

test("audit anchor dispatcher retries stable minimal payloads without exposing sink errors", async () => {
  const pending = [structuredClone(anchor)];
  const failures = [];
  const receipts = [];
  const repository = {
    async listAnchorOutbox() { return pending.map((value) => structuredClone(value)); },
    async recordAnchorFailure(value, category) { failures.push({ id: value.anchorId, category }); },
    async acknowledgeAnchor(value, receipt) { receipts.push({ id: value.anchorId, ...receipt }); pending.splice(0, 1); }
  };
  const failing = createAuditAnchorDispatcher({ auditRepository: repository, sink: { async append() { const error = new Error("upstream unavailable"); error.code = "network-failure"; throw error; } } });
  assert.deepEqual(await failing.flush(), { pending: 1, delivered: 0, failed: 1 });
  assert.deepEqual(failures, [{ id: anchor.anchorId, category: "network" }]);
  assert.equal(pending.length, 1);

  const delivered = createAuditAnchorDispatcher({ auditRepository: repository, sink: { async append(value) { assert.deepEqual(value, anchor); return { receiptReference: "external-receipt-17" }; } } });
  assert.deepEqual(await delivered.flush(), { pending: 1, delivered: 1, failed: 0 });
  assert.deepEqual(receipts, [{ id: anchor.anchorId, receiptReference: "external-receipt-17" }]);
  assert.equal(JSON.stringify(receipts).includes("upstream unavailable"), false);
});
