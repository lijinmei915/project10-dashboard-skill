import { createHash, createHmac } from "node:crypto";

export const AUDIT_GENESIS_HASH = "0".repeat(64);

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function auditPayloadHash(event) {
  return sha256(stableStringify(event));
}

export function auditEventHash({ organizationId, sequence, previousHash, payloadHash }) {
  return sha256(`${organizationId}:${sequence}:${previousHash}:${payloadHash}`);
}

export function auditSeal({ key = null, organizationId, sequence, eventHash }) {
  return key ? createHmac("sha256", key).update(`${organizationId}:${sequence}:${eventHash}`).digest("hex") : null;
}

export function verifyAuditEntry(entry, { key = null, previousHash = AUDIT_GENESIS_HASH } = {}) {
  if (!Number.isSafeInteger(Number(entry.sequence)) || Number(entry.sequence) < 1) return { ok: false, reason: "sequence" };
  if (entry.previousHash !== previousHash) return { ok: false, reason: "previous-hash" };
  const payloadHash = auditPayloadHash(entry.payload);
  if (entry.payloadHash !== payloadHash) return { ok: false, reason: "payload-hash" };
  const eventHash = auditEventHash({ organizationId: entry.organizationId, sequence: Number(entry.sequence), previousHash, payloadHash });
  if (entry.eventHash !== eventHash) return { ok: false, reason: "event-hash" };
  if (key && entry.seal !== auditSeal({ key, organizationId: entry.organizationId, sequence: Number(entry.sequence), eventHash })) return { ok: false, reason: "seal" };
  if (!key && entry.seal) return { ok: false, reason: "unexpected-seal" };
  return { ok: true, eventHash };
}
