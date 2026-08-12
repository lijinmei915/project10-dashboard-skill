import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export function createAuditEvent({ action, actor, projectId = null, organizationId, scope = projectId ? "project" : "organization", details = {}, id = `audit-${randomUUID()}`, at = new Date().toISOString() }) {
  if (!action || !actor?.id || !organizationId) throw new Error("Audit event requires action, actor, and organization");
  if (!new Set(["project", "organization"]).has(scope)) throw new Error("Audit event scope is invalid");
  if (scope === "project" && !projectId) throw new Error("Project audit events require a project id");
  if (scope === "organization" && projectId) throw new Error("Organization audit events cannot include a project id");
  if (typeof id !== "string" || !/^audit-[a-zA-Z0-9._-]{1,160}$/.test(id)) throw new Error("Audit event id is invalid");
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) throw new Error("Audit event time is invalid");
  return {
    version: 1,
    id,
    at,
    action: String(action),
    actor: { id: String(actor.id), name: String(actor.name), role: actor.role },
    organizationId: String(organizationId),
    scope,
    ...(projectId ? { projectId: String(projectId) } : {}),
    details: structuredClone(details)
  };
}

export function createAuditRepository({ directory, clock = () => Date.now() } = {}) {
  if (!directory) throw new Error("Audit repository directory is required");
  return {
    directory,
    async append(input) {
      const event = createAuditEvent({ ...input, at: input.at || new Date(clock()).toISOString() });
      const at = event.at;
      await mkdir(directory, { recursive: true });
      const destination = path.join(directory, `${at.replaceAll(":", "-")}-${event.id}.json`);
      const temporary = `${destination}.${process.pid}.tmp`;
      try {
        await writeFile(temporary, `${JSON.stringify(event, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
        await rename(temporary, destination);
      } catch (error) {
        await unlink(temporary).catch(() => {});
        if (error?.code === "EEXIST") {
          const stored = JSON.parse(await readFile(destination, "utf8"));
          if (JSON.stringify(stored) === JSON.stringify(event)) return structuredClone(stored);
        }
        throw error;
      }
      return structuredClone(event);
    },
    async list({ organizationId, projectId, limit = 200 } = {}) {
      await mkdir(directory, { recursive: true });
      const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort().reverse().slice(0, Math.max(1, Math.min(1000, Number(limit) || 200)) * 4);
      const events = await Promise.all(files.map(async (name) => JSON.parse(await readFile(path.join(directory, name), "utf8"))));
      return events.filter((event) => (!organizationId || event.organizationId === organizationId) && (!projectId || event.projectId === projectId)).slice(0, Math.max(1, Math.min(1000, Number(limit) || 200))).map((event) => structuredClone(event));
    }
  };
}
