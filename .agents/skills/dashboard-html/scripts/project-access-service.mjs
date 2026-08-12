import { AuthError } from "./studio-auth-service.mjs";

const memberRoles = new Set(["viewer", "editor"]);

export function normalizeProjectAccess(access = {}) {
  const ownerId = typeof access.ownerId === "string" && access.ownerId.trim() ? access.ownerId.trim() : null;
  const members = Array.isArray(access.members) ? access.members.map((member) => ({
    actorId: String(member?.actorId || "").trim(),
    role: member?.role
  })).filter(({ actorId, role }) => actorId && memberRoles.has(role) && actorId !== ownerId) : [];
  return { ownerId, members: [...new Map(members.map((member) => [member.actorId, member])).values()] };
}

export function projectAccessRole(project, actor) {
  if (!actor) return null;
  if (project?.organizationId && project.organizationId !== actor.organizationId) return null;
  if (actor.role === "admin") return "admin";
  const access = normalizeProjectAccess(project?.access);
  if (access.ownerId === actor.id) return "owner";
  return access.members.find(({ actorId }) => actorId === actor.id)?.role || null;
}

export function authorizeProject(project, actor, required = "read") {
  if (!project) throw new AuthError("Project access is not allowed", 403, "project-forbidden");
  if (required === "write" && project.status === "archived") throw new AuthError("Archived projects are read-only", 409, "project-archived");
  const role = projectAccessRole(project, actor);
  const allowed = required === "read"
    ? Boolean(role)
    : required === "write"
      ? ["admin", "owner", "editor"].includes(role)
      : ["admin", "owner"].includes(role);
  if (!allowed) throw new AuthError("Project access is not allowed", 403, "project-forbidden");
  return role;
}

export function updateProjectAccess(project, { ownerId, members }) {
  const next = structuredClone(project);
  next.access = normalizeProjectAccess({ ownerId: ownerId ?? next.access?.ownerId, members: members ?? next.access?.members });
  if (!next.access.ownerId) throw new AuthError("Project owner is required", 422, "project-owner-required");
  next.updatedAt = new Date(Math.max(Date.now(), Date.parse(project.updatedAt) + 1)).toISOString();
  return next;
}
