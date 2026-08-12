import { ContractError } from "./workspace-core.mjs";
import { createJsonFileStore } from "./studio-json-file-store.mjs";

function validId(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new ContractError("Schedule id is invalid", [{ path: "/id", code: "format", message: "Use a safe schedule id" }]);
  return id;
}

export function createRefreshScheduleRepository({ directory }) {
  if (!directory) throw new Error("Refresh schedule repository directory is required");
  const queues = new Map();
  const store = createJsonFileStore({ directory, validateId: validId });
  const get = (id) => store.read(id);
  async function write(schedule, { createOnly = false } = {}) {
    if (createOnly) {
      try { await store.create(schedule.id, schedule); }
      catch (error) { if (error?.code === "EEXIST") throw new ContractError("Schedule already exists", [{ path: "/datasetId", code: "conflict", message: "Dataset already has a schedule" }]); throw error; }
      return;
    }
    await store.replace(schedule.id, schedule);
  }
  return {
    directory,
    get,
    list: () => store.list(),
    async put(schedule) { await write(schedule, { createOnly: true }); return structuredClone(schedule); },
    update(id, updater) {
      const key = validId(id);
      const previous = queues.get(key) || Promise.resolve();
      const pending = previous.catch(() => {}).then(async () => {
        const schedule = await get(key);
        if (!schedule) return null;
        const next = await updater(structuredClone(schedule));
        await write(next);
        return structuredClone(next);
      });
      queues.set(key, pending);
      return pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); });
    }
  };
}
