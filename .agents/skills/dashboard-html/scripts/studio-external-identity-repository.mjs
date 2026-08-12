import { createHash } from "node:crypto";
import { ContractError } from "./workspace-core.mjs";
import { createJsonFileStore } from "./studio-json-file-store.mjs";

function requiredText(value, path, { maxLength = 512 } = {}) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new ContractError("External identity value is invalid", [{ path, code: "format", message: "Use a non-empty safe value" }]);
  }
  return normalized;
}

function safeId(value, path) {
  const normalized = requiredText(value, path, { maxLength: 128 });
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(normalized)) {
    throw new ContractError("External identity reference is invalid", [{ path, code: "format", message: "Use a safe identifier" }]);
  }
  return normalized;
}

function identityId({ providerId, issuer, subject }) {
  return createHash("sha256").update(`${providerId}\u0000${issuer}\u0000${subject}`).digest("hex");
}

function identityKey(value) {
  return {
    providerId: safeId(value?.providerId, "/providerId"),
    issuer: requiredText(value?.issuer, "/issuer"),
    subject: requiredText(value?.subject, "/subject")
  };
}

function normalize(value, { now = new Date().toISOString(), existing = null } = {}) {
  const { providerId, issuer, subject } = identityKey(value);
  const organizationId = safeId(value?.organizationId, "/organizationId");
  const actorId = safeId(value?.actorId, "/actorId");
  const id = identityId({ providerId, issuer, subject });
  if (value?.id && value.id !== id) throw new ContractError("External identity id is immutable", [{ path: "/id", code: "immutable", message: "Identity id must match provider, issuer and subject" }]);
  if (existing && (existing.organizationId !== organizationId || existing.actorId !== actorId)) {
    throw new ContractError("External identity mapping is immutable", [{ path: "/actorId", code: "immutable", message: "Unbind before mapping this identity elsewhere" }]);
  }
  return {
    version: 1,
    id,
    providerId,
    issuer,
    subject,
    organizationId,
    actorId,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

export function createExternalIdentityRepository({ directory, clock = () => Date.now() } = {}) {
  if (!directory) throw new Error("External identity repository directory is required");
  const store = createJsonFileStore({ directory, validateId: (id) => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("External identity id must be a SHA-256 digest");
    return id;
  } });

  return Object.freeze({
    provider: "file",
    capabilities: Object.freeze({ durable: true, shared: false, multiInstance: false }),
    async get({ providerId, issuer, subject }) {
      const key = identityKey({ providerId, issuer, subject });
      const identity = await store.read(identityId(key));
      return identity ? structuredClone(identity) : null;
    },
    async bind(value) {
      const now = new Date(clock()).toISOString();
      const candidate = normalize(value, { now });
      const existing = await store.read(candidate.id);
      const next = normalize(value, { now, existing });
      if (!existing) await store.create(next.id, next);
      else await store.replace(next.id, next);
      return structuredClone(next);
    },
    async unbind({ providerId, issuer, subject, organizationId, actorId }) {
      const key = identityKey({ providerId, issuer, subject });
      const id = identityId(key);
      const existing = await store.read(id);
      if (!existing) return false;
      if (organizationId && existing.organizationId !== safeId(organizationId, "/organizationId")) return false;
      if (actorId && existing.actorId !== safeId(actorId, "/actorId")) return false;
      await store.replace(id, { ...existing, status: "unbound", updatedAt: new Date(clock()).toISOString() });
      return true;
    },
    async probe() {
      await store.list();
      return true;
    }
  });
}
