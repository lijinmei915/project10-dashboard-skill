function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function assertSessionRepository(repository) {
  if (!repository) throw new Error("Session repository is required");
  const missing = ["get", "put", "delete", "deleteByActor", "prune", "probe"].filter((method) => typeof repository[method] !== "function");
  if (missing.length) throw new Error(`Session repository is missing methods: ${missing.join(", ")}`);
  return repository;
}

export function createMemorySessionRepository({ clock = () => Date.now() } = {}) {
  const sessions = new Map();
  return Object.freeze({
    provider: "memory",
    capabilities: Object.freeze({ durable: false, shared: false, multiInstance: false }),
    async get(id) {
      const value = sessions.get(id);
      if (!value) return null;
      if (value.expiresAt <= clock()) {
        sessions.delete(id);
        return null;
      }
      return clone(value);
    },
    async put(id, value) {
      sessions.set(id, clone(value));
      return clone(value);
    },
    async delete(id) {
      return sessions.delete(id);
    },
    async deleteByActor(actorId, organizationId) {
      let removed = 0;
      for (const [id, value] of sessions) {
        if (value.actorId !== actorId || value.organizationId !== organizationId) continue;
        sessions.delete(id);
        removed += 1;
      }
      return removed;
    },
    async prune(now = clock()) {
      let removed = 0;
      for (const [id, value] of sessions) {
        if (value.expiresAt > now) continue;
        sessions.delete(id);
        removed += 1;
      }
      return removed;
    },
    async probe() {
      return true;
    }
  });
}
