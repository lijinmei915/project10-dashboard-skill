import { ContractError } from "./workspace-core.mjs";
import { createJsonFileStore } from "./studio-json-file-store.mjs";

function organizationId(value) {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new ContractError("Organization id is invalid", [{ path: "/organizationId", code: "format", message: "Use a safe organization id" }]);
  return id;
}

function stale(expected, actual) {
  throw new ContractError("Organization is stale", [{ path: "/expectedUpdatedAt", code: "stale", message: `Expected ${expected}, current value is ${actual}` }]);
}

export function createOrganizationRepository({ directory } = {}) {
  if (!directory) throw new Error("Organization repository directory is required");
  const store = createJsonFileStore({ directory, validateId: organizationId });
  const queues = new Map();

  const serialize = (id, operation) => {
    const key = organizationId(id);
    const previous = queues.get(key) || Promise.resolve();
    const pending = previous.catch(() => {}).then(operation);
    queues.set(key, pending);
    return pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); });
  };

  return Object.freeze({
    directory,
    async get(id) {
      const value = await store.read(id);
      if (!value) return null;
      const copy = structuredClone(value);
      delete copy._outbox;
      delete copy._sessionRevocations;
      return copy;
    },
    async list() {
      return (await store.list()).map((organization) => {
        const copy = structuredClone(organization);
        delete copy._outbox;
        delete copy._sessionRevocations;
        return copy;
      });
    },
    async put(value, { createOnly = false } = {}) {
      const id = organizationId(value?.id);
      if (createOnly && await store.read(id)) throw new ContractError("Organization id already exists", [{ path: "/id", code: "conflict", message: "Choose another organization id" }]);
      await store.replace(id, value);
      return structuredClone(value);
    },
    update(id, { expectedUpdatedAt, outbox = null, sessionRevocations = null } = {}, updater) {
      return serialize(id, async () => {
        const current = await store.read(id);
        if (!current) return null;
        if (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt) stale(expectedUpdatedAt, current.updatedAt);
        const publicCurrent = structuredClone(current);
        delete publicCurrent._outbox;
        delete publicCurrent._sessionRevocations;
        const next = await updater(publicCurrent);
        if (!next || next.id !== current.id) throw new ContractError("Organization update changed its identity");
        const events = outbox ? await outbox({ before: publicCurrent, next: structuredClone(next) }) : [];
        const pending = [...(current._outbox || []), ...(Array.isArray(events) ? events : events ? [events] : [])];
        if (pending.length) next._outbox = structuredClone(pending);
        const revocations = sessionRevocations ? await sessionRevocations({ before: publicCurrent, next: structuredClone(next) }) : [];
        const pendingRevocations = [...(current._sessionRevocations || []), ...(Array.isArray(revocations) ? revocations : revocations ? [revocations] : [])];
        if (pendingRevocations.length) next._sessionRevocations = structuredClone(pendingRevocations);
        await store.replace(next.id, next);
        delete next._outbox;
        delete next._sessionRevocations;
        return structuredClone(next);
      });
    },
    async listOutbox() {
      const organizations = await store.list();
      return organizations.flatMap((organization) => (organization?._outbox || []).map((event) => ({ organizationId: organization.id, event: structuredClone(event) })));
    },
    acknowledgeOutbox(id, eventId) {
      return serialize(id, async () => {
        const current = await store.read(id);
        if (!current) return false;
        const pending = (current._outbox || []).filter(({ id: pendingId }) => pendingId !== eventId);
        if (pending.length === (current._outbox || []).length) return false;
        if (pending.length) current._outbox = pending;
        else delete current._outbox;
        await store.replace(current.id, current);
        return true;
      });
    },
    async listSessionRevocations() {
      const organizations = await store.list();
      return organizations.flatMap((organization) => (organization?._sessionRevocations || []).map((event) => ({ organizationId: organization.id, event: structuredClone(event) })));
    },
    acknowledgeSessionRevocation(id, eventId) {
      return serialize(id, async () => {
        const current = await store.read(id);
        if (!current) return false;
        const pending = (current._sessionRevocations || []).filter(({ id: pendingId }) => pendingId !== eventId);
        if (pending.length === (current._sessionRevocations || []).length) return false;
        if (pending.length) current._sessionRevocations = pending;
        else delete current._sessionRevocations;
        await store.replace(current.id, current);
        return true;
      });
    }
  });
}
