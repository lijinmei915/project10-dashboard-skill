import { ContractError } from "./workspace-core.mjs";
import { createJsonFileStore } from "./studio-json-file-store.mjs";

function validId(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new ContractError("Job id is invalid", [{ path: "/id", code: "format", message: "Use a safe job id" }]);
  return id;
}

export function createJobRepository({ directory }) {
  if (!directory) throw new Error("Job repository directory is required");
  const queues = new Map();
  const store = createJsonFileStore({ directory, validateId: validId });
  const get = (id) => store.read(id);
  async function write(job, { createOnly = false } = {}) {
    if (createOnly) {
      try { await store.create(job.id, job); }
      catch (error) { if (error?.code === "EEXIST") throw new ContractError("Job id already exists", [{ path: "/id", code: "conflict", message: "Job ids are immutable" }]); throw error; }
      return;
    }
    await store.replace(job.id, job);
  }
  return {
    directory,
    get,
    list: () => store.list(),
    async put(job) { await write(job, { createOnly: true }); return structuredClone(job); },
    update(id, updater) {
      const key = validId(id);
      const previous = queues.get(key) || Promise.resolve();
      const pending = previous.catch(() => {}).then(async () => {
        const job = await get(key);
        if (!job) return null;
        const next = await updater(structuredClone(job));
        await write(next);
        return structuredClone(next);
      });
      queues.set(key, pending);
      return pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); });
    }
  };
}
