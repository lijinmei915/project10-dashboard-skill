import { ContractError } from "./workspace-core.mjs";
import { createJsonFileStore } from "./studio-json-file-store.mjs";

function validId(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new ContractError("Data source id is invalid", [{ path: "/id", code: "format", message: "Use a safe data source id" }]);
  return id;
}

export function createDataSourceRepository({ directory }) {
  if (!directory) throw new Error("Data source repository directory is required");
  const queues = new Map();
  const store = createJsonFileStore({ directory, validateId: validId });
  const get = (id) => store.read(id);
  return {
    directory,
    get,
    list: () => store.list(),
    async put(source) {
      await store.replace(source.id, source);
      return structuredClone(source);
    },
    update(id, { expectedUpdatedAt } = {}, updater) {
      const key = validId(id);
      const previous = queues.get(key) || Promise.resolve();
      const pending = previous.catch(() => {}).then(async () => {
        const source = await get(key);
        if (!source) return null;
        if (expectedUpdatedAt !== undefined && source.updatedAt !== expectedUpdatedAt) throw new ContractError("Data source is stale", [{ path: "/expectedUpdatedAt", code: "stale", message: `Expected ${expectedUpdatedAt}, current value is ${source.updatedAt}` }]);
        return this.put(await updater(structuredClone(source)));
      });
      queues.set(key, pending);
      return pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); });
    }
  };
}
