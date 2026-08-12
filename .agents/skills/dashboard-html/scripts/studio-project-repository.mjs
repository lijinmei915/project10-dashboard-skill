import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertProject } from "./project-store.mjs";
import { ContractError } from "./workspace-core.mjs";

function projectId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) {
    throw new ContractError("Project id is invalid", [{ path: "/projectId", code: "format", message: "Use 1-128 letters, numbers, dots, underscores, or hyphens" }]);
  }
  return value;
}

function staleProject(expected, actual) {
  return new ContractError("Project revision is stale", [{
    path: "/expectedRevisionId",
    code: "stale",
    message: `Expected ${expected ?? "no revision"}, current revision is ${actual ?? "none"}`
  }]);
}

function staleProjectMetadata(expected, actual) {
  return new ContractError("Project metadata is stale", [{
    path: "/expectedUpdatedAt", code: "stale", message: `Expected ${expected}, current update is ${actual}`
  }]);
}

export function createProjectRepository({ directory }) {
  if (!directory) throw new Error("Project repository directory is required");
  const queues = new Map();
  const fileFor = (id) => path.join(directory, `${projectId(id)}.json`);

  const publicProject = (project) => {
    if (!project) return null;
    const copy = structuredClone(project);
    delete copy._outbox;
    return copy;
  };

  async function loadStored(id) {
    try {
      const project = JSON.parse(await readFile(fileFor(id), "utf8"));
      assertProject(project);
      return project;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async function atomicWrite(project) {
    assertProject(project);
    await mkdir(directory, { recursive: true });
    const destination = fileFor(project.id);
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(project, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  function serialize(id, operation) {
    const key = projectId(id);
    const previous = queues.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => {}).then(operation);
    queues.set(key, pending);
    return pending.finally(() => {
      if (queues.get(key) === pending) queues.delete(key);
    });
  }

  return {
    directory,
    get: async (id) => publicProject(await loadStored(id)),
    async list() {
      await mkdir(directory, { recursive: true });
      const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
      const projects = await Promise.all(files.map((name) => loadStored(name.slice(0, -5))));
      return projects.filter(Boolean).map(({ id, name, createdAt, updatedAt, organizationId = null, access, status = "active", archivedAt, currentRevisionId, revisions }) => ({
        id, name, createdAt, updatedAt, organizationId, access: access || { ownerId: null, members: [] }, status, ...(archivedAt ? { archivedAt } : {}), currentRevisionId, revisionCount: revisions.length
      }));
    },
    update(id, { expectedRevisionId, expectedUpdatedAt, seed = null, outbox = null } = {}, updater) {
      return serialize(id, async () => {
        const stored = await loadStored(id);
        if (expectedRevisionId !== undefined && (stored?.currentRevisionId ?? null) !== expectedRevisionId) {
          throw staleProject(expectedRevisionId, stored?.currentRevisionId ?? null);
        }
        if (expectedUpdatedAt !== undefined && stored?.updatedAt !== expectedUpdatedAt) throw staleProjectMetadata(expectedUpdatedAt, stored?.updatedAt ?? null);
        const base = publicProject(stored) ?? publicProject(seed);
        const next = await updater(base ? structuredClone(base) : null);
        if (!next || next.id !== id) throw new ContractError("Project update changed its identity");
        const events = outbox ? await outbox({ before: publicProject(stored), next: structuredClone(next) }) : [];
        const pending = [...(stored?._outbox || []), ...(Array.isArray(events) ? events : events ? [events] : [])];
        if (pending.length) next._outbox = structuredClone(pending);
        await atomicWrite(next);
        return publicProject(next);
      });
    },
    async listOutbox() {
      await mkdir(directory, { recursive: true });
      const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
      const projects = await Promise.all(files.map((name) => loadStored(name.slice(0, -5))));
      return projects.flatMap((project) => (project?._outbox || []).map((event) => ({ projectId: project.id, event: structuredClone(event) })));
    },
    acknowledgeOutbox(projectIdValue, eventId) {
      return serialize(projectIdValue, async () => {
        const stored = await loadStored(projectIdValue);
        if (!stored) return false;
        const pending = (stored._outbox || []).filter(({ id }) => id !== eventId);
        if (pending.length === (stored._outbox || []).length) return false;
        if (pending.length) stored._outbox = pending;
        else delete stored._outbox;
        await atomicWrite(stored);
        return true;
      });
    }
  };
}
