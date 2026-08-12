import { ContractError } from "./workspace-core.mjs";
import { createJsonFileStore } from "./studio-json-file-store.mjs";

function validId(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new ContractError("Publication id is invalid", [{ path: "/id", code: "format", message: "Use a safe publication id" }]);
  return id;
}

export function createPublicationRepository({ directory }) {
  if (!directory) throw new Error("Publication repository directory is required");
  const queues = new Map();
  const store = createJsonFileStore({ directory, validateId: validId });
  const publicPublication = (publication) => {
    if (!publication) return null;
    const copy = structuredClone(publication);
    delete copy._auditOutbox;
    return copy;
  };
  const getStored = (id) => store.read(id);
  const get = async (id) => publicPublication(await getStored(id));
  const serialize = (id, operation) => {
    const key = validId(id);
    const previous = queues.get(key) || Promise.resolve();
    const pending = previous.catch(() => {}).then(operation);
    queues.set(key, pending);
    return pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); });
  };
  return {
    directory,
    get,
    async list() { return (await store.list()).map(publicPublication); },
    async put(publication, { outbox = null } = {}) {
      const next = structuredClone(publication);
      const events = outbox ? await outbox({ before: null, next: structuredClone(next) }) : [];
      const pending = Array.isArray(events) ? events : events ? [events] : [];
      if (pending.length) next._auditOutbox = structuredClone(pending);
      try { await store.create(next.id, next); }
      catch (error) { if (error?.code === "EEXIST") throw new ContractError("Publication id already exists", [{ path: "/id", code: "conflict", message: "Publication ids are immutable" }]); throw error; }
      return publicPublication(next);
    },
    update(id, options, updater) {
      if (typeof options === "function") { updater = options; options = {}; }
      return serialize(id, async () => {
        const key = validId(id);
        const publication = await getStored(key);
        if (!publication) return null;
        const next = await updater(structuredClone(publication));
        const events = options?.outbox ? await options.outbox({ before: publicPublication(publication), next: publicPublication(next) }) : [];
        const auditEvents = [...(publication._auditOutbox || []), ...(Array.isArray(events) ? events : events ? [events] : [])];
        if (auditEvents.length) next._auditOutbox = structuredClone(auditEvents);
        await store.replace(key, next);
        return publicPublication(next);
      });
    },
    async listOutbox() {
      return (await store.list()).flatMap((publication) => (publication._auditOutbox || []).map((event) => ({ publicationId: publication.id, event: structuredClone(event) })));
    },
    acknowledgeOutbox(id, eventId) {
      return serialize(id, async () => {
        const current = await getStored(id);
        if (!current) return false;
        const pending = (current._auditOutbox || []).filter(({ id: pendingId }) => pendingId !== eventId);
        if (pending.length === (current._auditOutbox || []).length) return false;
        if (pending.length) current._auditOutbox = pending;
        else delete current._auditOutbox;
        await store.replace(current.id, current);
        return true;
      });
    }
  };
}
