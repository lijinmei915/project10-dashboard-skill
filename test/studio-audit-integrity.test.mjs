import assert from "node:assert/strict";
import test from "node:test";
import { AUDIT_GENESIS_HASH, auditEventHash, auditPayloadHash, auditSeal, stableStringify, verifyAuditEntry } from "../.agents/skills/dashboard-html/scripts/studio-audit-integrity.mjs";

const event = {
  version: 1,
  id: "audit-integrity-1",
  at: "2026-08-11T00:00:00.000Z",
  action: "project.created",
  actor: { id: "owner", name: "Owner", role: "editor" },
  organizationId: "default",
  projectId: "project",
  details: { source: "agent", fields: ["a", "b"] }
};

test("audit integrity uses canonical payloads and detects chain or seal tampering", () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
  const payloadHash = auditPayloadHash(event);
  const eventHash = auditEventHash({ organizationId: event.organizationId, sequence: 1, previousHash: AUDIT_GENESIS_HASH, payloadHash });
  const key = "01234567890123456789012345678901";
  const entry = { organizationId: event.organizationId, payload: event, sequence: 1, previousHash: AUDIT_GENESIS_HASH, payloadHash, eventHash, seal: auditSeal({ key, organizationId: event.organizationId, sequence: 1, eventHash }) };
  assert.deepEqual(verifyAuditEntry(entry, { key }), { ok: true, eventHash });
  assert.equal(verifyAuditEntry({ ...entry, payload: { ...event, action: "project.deleted" } }, { key }).reason, "payload-hash");
  assert.equal(verifyAuditEntry({ ...entry, previousHash: "1".repeat(64) }, { key }).reason, "previous-hash");
  assert.equal(verifyAuditEntry({ ...entry, seal: "0".repeat(64) }, { key }).reason, "seal");
});
