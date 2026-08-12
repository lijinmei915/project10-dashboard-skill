import { appendProjectRevision, createProject } from "./project-store.mjs";
import { ContractError } from "./workspace-core.mjs";

function projectName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 120) throw new ContractError("Project name is invalid", [{ path: "/name", code: "format", message: "Use 1-120 characters" }]);
  return name;
}

export function updateProjectMetadata(project, { name, status, now = new Date().toISOString() } = {}) {
  const next = structuredClone(project);
  if (name !== undefined) next.name = projectName(name);
  if (status !== undefined) {
    if (!["active", "archived"].includes(status)) throw new ContractError("Project status is invalid", [{ path: "/status", code: "enum", message: "Use active or archived" }]);
    next.status = status;
    if (status === "archived") next.archivedAt = now;
    else delete next.archivedAt;
  }
  next.updatedAt = new Date(Math.max(Date.parse(now), Date.parse(project.updatedAt) + 1)).toISOString();
  return next;
}

export function copyProject(source, { id, name, ownerId, organizationId, revisionId, now = new Date().toISOString() } = {}) {
  const sourceRevision = source.revisions.find((revision) => revision.id === (revisionId || source.currentRevisionId));
  if (!sourceRevision) throw new ContractError("Project revision was not found", [{ path: "/revisionId", code: "missing", message: "Revision does not exist" }]);
  return appendProjectRevision(createProject({ id, name: projectName(name || `${source.name} 副本`), ownerId, organizationId, createdAt: now }), {
    id: `revision-copy-${id}`,
    createdAt: now,
    source: "system",
    summary: `复制自 ${source.name}`,
    workspace: sourceRevision.workspace
  });
}
