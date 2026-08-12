import { applyCommandBatch, assertWorkspace, ContractError } from "./workspace-core.mjs";
import { isDeepStrictEqual } from "node:util";

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new ContractError(`${field} is required`, [{ path: `/${field}`, code: "required", message: `${field} is required` }]);
  return value.trim();
}

export function createProject({ id, name, ownerId = null, organizationId = null, createdAt = new Date().toISOString() }) {
  return {
    version: 1,
    id: requiredText(id, "id"),
    name: requiredText(name, "name"),
    createdAt,
    updatedAt: createdAt,
    access: { ownerId: ownerId ? requiredText(ownerId, "ownerId") : null, members: [] },
    organizationId: organizationId ? requiredText(organizationId, "organizationId") : null,
    status: "active",
    currentRevisionId: null,
    revisions: []
  };
}

export function assertProject(project) {
  if (!project || project.version !== 1 || !Array.isArray(project.revisions)) throw new ContractError("Project is invalid");
  requiredText(project.id, "id");
  requiredText(project.name, "name");
  if (project.organizationId !== undefined && project.organizationId !== null) requiredText(project.organizationId, "organizationId");
  if (project.status !== undefined && !["active", "archived"].includes(project.status)) throw new ContractError("Project status is invalid");
  if (project.access !== undefined) {
    if (!project.access || !Array.isArray(project.access.members)) throw new ContractError("Project access is invalid");
    if (project.access.ownerId !== null) requiredText(project.access.ownerId, "access/ownerId");
    const actorIds = new Set();
    for (const member of project.access.members) {
      const actorId = requiredText(member?.actorId, "access/members/actorId");
      if (!["viewer", "editor"].includes(member.role) || actorIds.has(actorId) || actorId === project.access.ownerId) throw new ContractError("Project member is invalid");
      actorIds.add(actorId);
    }
  }
  if (project.currentRevisionId !== null && !project.revisions.some(({ id }) => id === project.currentRevisionId)) {
    throw new ContractError("Current project revision was not found", [{ path: "/currentRevisionId", code: "missing", message: "Current revision does not exist" }]);
  }
  for (const revision of project.revisions) assertWorkspace(revision.workspace);
  return project;
}

export function appendProjectRevision(input, revision) {
  assertProject(input);
  const project = structuredClone(input);
  const id = requiredText(revision?.id, "revision/id");
  if (project.revisions.some((item) => item.id === id)) throw new ContractError("Revision id already exists", [{ path: "/revision/id", code: "unique", message: "Revision id must be unique within a project" }]);
  assertWorkspace(revision.workspace);
  const committed = {
    version: 1,
    id,
    createdAt: requiredText(revision.createdAt, "revision/createdAt"),
    source: ["agent", "user", "system"].includes(revision.source) ? revision.source : "user",
    workspace: structuredClone(revision.workspace),
    ...(revision.requestId ? { requestId: revision.requestId } : {}),
    ...(revision.batchId ? { batchId: revision.batchId } : {}),
    ...(revision.parentRevisionId ? { parentRevisionId: String(revision.parentRevisionId) } : {}),
    ...(revision.summary ? { summary: String(revision.summary) } : {}),
    ...(revision.commands ? { commands: structuredClone(revision.commands) } : {}),
    ...(revision.inverseCommands ? { inverseCommands: structuredClone(revision.inverseCommands) } : {})
  };
  project.revisions.push(committed);
  project.currentRevisionId = committed.id;
  project.updatedAt = committed.createdAt;
  return project;
}

export function restoreProjectRevision(project, revisionId = project?.currentRevisionId) {
  const revision = project?.revisions?.find((item) => item.id === revisionId);
  if (!revision) throw new ContractError("Project revision was not found", [{ path: "/revisionId", code: "missing", message: "Revision does not exist" }]);
  assertWorkspace(revision.workspace);
  return structuredClone(revision.workspace);
}

export function projectRevisionSummary(project) {
  return (project?.revisions ?? []).map(({ id, createdAt, source, requestId, batchId, parentRevisionId, summary }) => ({ id, createdAt, source, requestId, batchId, parentRevisionId, summary }));
}

export function undoProjectRevision(input, { revisionId, currentWorkspace, undoRevisionId, at = new Date().toISOString() }) {
  if (!input || input.currentRevisionId !== revisionId) throw new ContractError("Only the current revision can be undone", [{ path: "/revisionId", code: "stale", message: "Revision is no longer current" }]);
  const revision = input.revisions.find((item) => item.id === revisionId);
  if (!revision?.inverseCommands) throw new ContractError("Revision cannot be undone", [{ path: "/revision/inverseCommands", code: "missing", message: "Revision does not contain an inverse command batch" }]);
  assertWorkspace(currentWorkspace);
  if (!isDeepStrictEqual(currentWorkspace, revision.workspace)) {
    throw new ContractError("Workspace changed after the AI revision", [{ path: "/currentWorkspace", code: "drift", message: "Save or discard later edits before undoing this AI revision" }]);
  }
  const workspace = applyCommandBatch(currentWorkspace, revision.inverseCommands);
  const restoredRevision = {
    id: requiredText(undoRevisionId, "undoRevisionId"),
    createdAt: at,
    source: "user",
    parentRevisionId: revision.id,
    summary: `撤销 ${revision.summary || revision.id}`,
    workspace
  };
  const project = appendProjectRevision(input, restoredRevision);
  return { project, revision: project.revisions.at(-1), workspace };
}

export function restoreProjectRevisionAsNew(input, { revisionId, currentWorkspace, restoreRevisionId, at = new Date().toISOString() }) {
  if (!input || input.version !== 1 || !Array.isArray(input.revisions)) throw new ContractError("Project is invalid");
  const currentRevision = input.revisions.find(({ id }) => id === input.currentRevisionId);
  if (!currentRevision) throw new ContractError("Current project revision was not found", [{ path: "/project/currentRevisionId", code: "missing", message: "Current revision does not exist" }]);
  const targetRevision = input.revisions.find(({ id }) => id === revisionId);
  if (!targetRevision) throw new ContractError("Project revision was not found", [{ path: "/revisionId", code: "missing", message: "Revision does not exist" }]);
  if (targetRevision.id === currentRevision.id) throw new ContractError("Revision is already current", [{ path: "/revisionId", code: "current", message: "Choose an earlier revision to restore" }]);
  assertWorkspace(currentWorkspace);
  if (!isDeepStrictEqual(currentWorkspace, currentRevision.workspace)) {
    throw new ContractError("Workspace changed after the current revision", [{ path: "/currentWorkspace", code: "drift", message: "Save or discard later edits before restoring project history" }]);
  }
  const workspace = restoreProjectRevision(input, targetRevision.id);
  const restoredRevision = {
    id: requiredText(restoreRevisionId, "restoreRevisionId"),
    createdAt: at,
    source: "user",
    parentRevisionId: currentRevision.id,
    summary: `恢复版本 ${targetRevision.summary || targetRevision.id}`,
    workspace
  };
  const project = appendProjectRevision(input, restoredRevision);
  return { project, revision: project.revisions.at(-1), workspace };
}
