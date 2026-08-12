import { AuthError } from "./studio-auth-service.mjs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ContractError } from "./workspace-core.mjs";
import { createAuditEvent } from "./studio-audit-repository.mjs";

const organizationRoles = new Set(["admin", "member"]);
const memberStatuses = new Set(["active", "suspended"]);
const invitationStatuses = new Set(["pending", "accepted", "expired"]);

function safeId(value, path) {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new ContractError("Organization value is invalid", [{ path, code: "format", message: "Use a safe identifier" }]);
  return id;
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nextTimestamp(previous, now) {
  return new Date(Math.max(timestamp(previous) + 1, now())).toISOString();
}

function organizationName(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 120) throw new ContractError("Organization name is invalid", [{ path: "/name", code: "format", message: "Use 1-120 characters" }]);
  return name;
}

function profileName(value, path) {
  const name = String(value || "").trim();
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) throw new ContractError("Member name is invalid", [{ path, code: "format", message: "Use 1-120 visible characters" }]);
  return name;
}

function hash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function invitationIdentityHash({ providerId, issuer, subject }) {
  return hash(`${safeId(providerId, "/providerId")}\u0000${String(issuer || "").trim()}\u0000${String(subject || "").trim()}`);
}

function invitationId() {
  return `invite-${randomBytes(18).toString("base64url")}`;
}

function actorIdForInvitation(id) {
  return `member-${hash(id).slice(0, 32)}`;
}

function invitationExpiry(value, now) {
  const expiresAt = new Date(value).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now + 60_000 || expiresAt > now + 31 * 24 * 60 * 60 * 1000) {
    throw new ContractError("Invitation expiry is invalid", [{ path: "/expiresAt", code: "range", message: "Use an expiry between 1 minute and 31 days" }]);
  }
  return new Date(expiresAt).toISOString();
}

function publicInvitation(invitation) {
  return { id: invitation.id, role: invitation.role, name: invitation.name, providerId: invitation.providerId, expiresAt: invitation.expiresAt, status: invitation.status, createdAt: invitation.createdAt, ...(invitation.acceptedAt ? { acceptedAt: invitation.acceptedAt } : {}) };
}

function normalizeMembers(members, knownActorIds) {
  if (!Array.isArray(members)) throw new ContractError("Organization members are invalid", [{ path: "/members", code: "type", message: "Use a member list" }]);
  const normalized = members.map((member, index) => {
    const actorId = safeId(member?.actorId, `/members/${index}/actorId`);
    if (!knownActorIds.has(actorId)) throw new ContractError("Organization member is unknown", [{ path: `/members/${index}/actorId`, code: "reference", message: "Choose a configured identity" }]);
    if (!organizationRoles.has(member?.role)) throw new ContractError("Organization member role is invalid", [{ path: `/members/${index}/role`, code: "enum", message: "Use admin or member" }]);
    if (!memberStatuses.has(member?.status)) throw new ContractError("Organization member status is invalid", [{ path: `/members/${index}/status`, code: "enum", message: "Use active or suspended" }]);
    return { actorId, role: member.role, status: member.status };
  });
  const unique = [...new Map(normalized.map((member) => [member.actorId, member])).values()];
  if (unique.length !== normalized.length) throw new ContractError("Organization members contain duplicates", [{ path: "/members", code: "duplicate", message: "Each identity can appear once" }]);
  if (!unique.some(({ role, status }) => role === "admin" && status === "active")) throw new ContractError("Organization requires an active admin", [{ path: "/members", code: "invariant", message: "Keep at least one active organization admin" }]);
  return unique.sort((left, right) => left.actorId.localeCompare(right.actorId));
}

function publicOrganization(organization, identities, { includeMembers = false, includeInvitations = false } = {}) {
  const membersById = new Map(identities.map((identity) => [identity.id, identity]));
  const result = { id: organization.id, name: organization.name, createdAt: organization.createdAt, updatedAt: organization.updatedAt };
  if (includeMembers) result.members = organization.members.map((member) => ({ ...member, name: organization.memberProfiles?.[member.actorId]?.name || membersById.get(member.actorId)?.name || member.actorId }));
  if (includeInvitations) result.invitations = (organization.invitations || []).map(publicInvitation);
  return result;
}

function sessionRevocationIntents({ before, next }) {
  const nextMembers = new Map(next.members.map((member) => [member.actorId, member]));
  return before.members
    .filter(({ actorId, status }) => status === "active" && nextMembers.get(actorId)?.status !== "active")
    .map(({ actorId }) => ({
      version: 1,
      id: `session-revocation-${createHash("sha256").update(`${next.id}\u0000${actorId}\u0000${next.updatedAt}`).digest("hex")}`,
      organizationId: next.id,
      actorId,
      requestedAt: next.updatedAt
    }));
}

export function createOrganizationService({ repository, identities = [], clock = () => Date.now(), random = (length) => randomBytes(length).toString("base64url") } = {}) {
  if (!repository || ["get", "list", "put", "update"].some((method) => typeof repository[method] !== "function")) throw new Error("Organization repository is incomplete");
  const principals = identities.map((identity) => ({ id: safeId(identity?.id, "/identity/id"), name: String(identity?.name || "").trim(), organizationId: safeId(identity?.organizationId, "/identity/organizationId"), role: identity?.role })).filter(({ name }) => name);
  const byId = new Map(principals.map((identity) => [identity.id, identity]));
  const bootstrap = new Map();
  const ensureOrganization = (id) => {
    if (bootstrap.has(id)) return bootstrap.get(id);
    const pending = (async () => {
      const existing = await repository.get(id);
      if (existing) return existing;
      const seedMembers = principals.filter(({ organizationId }) => organizationId === id).map(({ id: actorId, role }) => ({ actorId, role: role === "admin" ? "admin" : "member", status: "active" }));
      if (!seedMembers.length) return null;
      const now = new Date(clock()).toISOString();
      const organization = { version: 1, id, name: id, createdAt: now, updatedAt: now, members: normalizeMembers(seedMembers, new Set(seedMembers.map(({ actorId }) => actorId))), memberProfiles: {}, invitations: [] };
      try { return await repository.put(organization, { createOnly: true }); } catch (error) {
        if (!(error instanceof ContractError) || !error.issues?.some(({ code }) => code === "conflict")) throw error;
        return repository.get(id);
      }
    })();
    bootstrap.set(id, pending);
    return pending;
  };
  const requireMembership = async (actor) => {
    if (!actor) throw new AuthError("Authentication required", 401, "unauthenticated");
    await ensureOrganization(actor.organizationId);
    const organization = await repository.get(actor.organizationId);
    const member = organization?.members?.find(({ actorId }) => actorId === actor.id);
    if (!member || member.status !== "active") throw new AuthError("Organization access is not allowed", 403, "organization-forbidden");
    return { organization, member };
  };
  const auditIntent = typeof repository.listOutbox === "function" ? ({ action, actor, details }) => ({ next }) => createAuditEvent({ action, actor, organizationId: next.id, scope: "organization", details }) : null;

  return Object.freeze({
    async resolveActor(actor) {
      const { member } = await requireMembership(actor);
      return { ...actor, organizationRole: member.role };
    },
    async current(actor, { includeMembers = false } = {}) {
      const { organization, member } = await requireMembership(actor);
      return { ...publicOrganization(organization, principals, { includeMembers, includeInvitations: includeMembers }), currentMember: { actorId: member.actorId, role: member.role, status: member.status } };
    },
    async directory(actor) {
      const { organization } = await requireMembership(actor);
      return organization.members.filter(({ status }) => status === "active").map((member) => {
        const identity = byId.get(member.actorId);
        return { id: member.actorId, name: organization.memberProfiles?.[member.actorId]?.name || identity?.name || member.actorId, role: identity?.role || (member.role === "admin" ? "admin" : "editor"), organizationId: organization.id, organizationRole: member.role };
      });
    },
    async update(actor, { expectedUpdatedAt, name }) {
      const resolved = await this.resolveActor(actor);
      if (resolved.organizationRole !== "admin") throw new AuthError("Organization admin role is required", 403, "organization-admin-required");
      if (!expectedUpdatedAt) throw new ContractError("expectedUpdatedAt is required", [{ path: "/expectedUpdatedAt", code: "required", message: "Organization updates require optimistic concurrency" }]);
      const nextName = organizationName(name);
      const organization = await repository.update(resolved.organizationId, { expectedUpdatedAt, outbox: auditIntent({ action: "organization.updated", actor: resolved, details: { name: nextName } }) }, (current) => ({ ...current, name: nextName, updatedAt: nextTimestamp(current.updatedAt, clock) }));
      return publicOrganization(organization, principals, { includeMembers: true });
    },
    async updateMembers(actor, { expectedUpdatedAt, members }) {
      const resolved = await this.resolveActor(actor);
      if (resolved.organizationRole !== "admin") throw new AuthError("Organization admin role is required", 403, "organization-admin-required");
      if (!expectedUpdatedAt) throw new ContractError("expectedUpdatedAt is required", [{ path: "/expectedUpdatedAt", code: "required", message: "Organization updates require optimistic concurrency" }]);
      const current = await repository.get(resolved.organizationId);
      const knownActorIds = new Set([...principals.filter(({ organizationId }) => organizationId === resolved.organizationId).map(({ id }) => id), ...Object.keys(current?.memberProfiles || {})]);
      const nextMembers = normalizeMembers(members, knownActorIds);
      const organization = await repository.update(resolved.organizationId, {
        expectedUpdatedAt,
        outbox: auditIntent({ action: "organization.members.updated", actor: resolved, details: { members: nextMembers } }),
        sessionRevocations: sessionRevocationIntents
      }, (current) => ({ ...current, members: nextMembers, updatedAt: nextTimestamp(current.updatedAt, clock) }));
      return publicOrganization(organization, principals, { includeMembers: true });
    },
    async resolveMemberActor(actorId, organizationId) {
      const id = safeId(actorId, "/actorId");
      const organization = await repository.get(safeId(organizationId, "/organizationId"));
      const member = organization?.members?.find((candidate) => candidate.actorId === id);
      if (!member || member.status !== "active") return null;
      const identity = byId.get(id);
      return { id, name: organization.memberProfiles?.[id]?.name || identity?.name || id, role: identity?.role || (member.role === "admin" ? "admin" : "editor"), organizationId: organization.id, organizationRole: member.role };
    },
    async createInvitation(actor, { expectedUpdatedAt, providerId, issuer, subject, role = "member", name, expiresAt }) {
      const resolved = await this.resolveActor(actor);
      if (resolved.organizationRole !== "admin") throw new AuthError("Organization admin role is required", 403, "organization-admin-required");
      if (!expectedUpdatedAt) throw new ContractError("expectedUpdatedAt is required", [{ path: "/expectedUpdatedAt", code: "required", message: "Invitation creation requires optimistic concurrency" }]);
      if (!organizationRoles.has(role)) throw new ContractError("Invitation role is invalid", [{ path: "/role", code: "enum", message: "Use admin or member" }]);
      const normalizedProviderId = safeId(providerId, "/providerId");
      const normalizedIssuer = String(issuer || "").trim();
      const normalizedSubject = String(subject || "").trim();
      if (!normalizedIssuer || !normalizedSubject || /[\u0000-\u001f\u007f]/.test(normalizedIssuer) || /[\u0000-\u001f\u007f]/.test(normalizedSubject)) throw new ContractError("Invitation identity is invalid", [{ path: "/subject", code: "format", message: "Use a verified provider subject" }]);
      const now = Number(clock());
      const id = invitationId();
      const acceptanceToken = random(32);
      const invitation = { version: 1, id, actorId: actorIdForInvitation(id), name: profileName(name, "/name"), role, providerId: normalizedProviderId, identityHash: invitationIdentityHash({ providerId: normalizedProviderId, issuer: normalizedIssuer, subject: normalizedSubject }), acceptanceTokenHash: hash(acceptanceToken), expiresAt: invitationExpiry(expiresAt, now), status: "pending", createdAt: new Date(now).toISOString() };
      const organization = await repository.update(resolved.organizationId, {
        expectedUpdatedAt,
        outbox: auditIntent({ action: "organization.invitation.created", actor: resolved, details: { invitationId: invitation.id, role: invitation.role, providerId: invitation.providerId, expiresAt: invitation.expiresAt } })
      }, (current) => ({ ...current, invitations: [...(current.invitations || []), invitation], updatedAt: nextTimestamp(current.updatedAt, clock) }));
      return { invitation: publicInvitation(organization.invitations.find((candidate) => candidate.id === invitation.id)), acceptanceToken };
    },
    async startInvitationAcceptance({ providerId, acceptanceToken }) {
      const normalizedProviderId = safeId(providerId, "/providerId");
      const candidateHash = hash(acceptanceToken);
      const now = Number(clock());
      for (const organization of await repository.list()) {
        const invitation = (organization.invitations || []).find((candidate) => candidate.providerId === normalizedProviderId && candidate.status === "pending" && candidate.expiresAt > new Date(now).toISOString() && candidate.acceptanceTokenHash.length === candidateHash.length && timingSafeEqual(Buffer.from(candidate.acceptanceTokenHash), Buffer.from(candidateHash)));
        if (invitation) return { organizationId: organization.id, invitationId: invitation.id };
      }
      throw new AuthError("Invitation is invalid or expired", 403, "invitation-invalid");
    },
    async prepareInvitationAcceptance({ organizationId, invitationId, providerId, issuer, subject }) {
      const organization = await repository.get(safeId(organizationId, "/organizationId"));
      const invitation = organization?.invitations?.find((candidate) => candidate.id === safeId(invitationId, "/invitationId"));
      if (!invitation || invitation.status !== "pending" || invitation.expiresAt <= new Date(clock()).toISOString() || invitation.providerId !== safeId(providerId, "/providerId") || invitation.identityHash !== invitationIdentityHash({ providerId, issuer, subject })) throw new AuthError("Invitation is invalid or expired", 403, "invitation-invalid");
      return { actorId: invitation.actorId, organizationId: organization.id };
    },
    async acceptInvitation({ organizationId, invitationId, providerId, issuer, subject }) {
      const prepared = await this.prepareInvitationAcceptance({ organizationId, invitationId, providerId, issuer, subject });
      const organization = await repository.update(prepared.organizationId, {
        outbox: ({ next }) => createAuditEvent({ action: "organization.invitation.accepted", actor: { id: prepared.actorId, organizationId: next.id }, organizationId: next.id, scope: "organization", details: { invitationId } })
      }, (current) => {
        const invitations = [...(current.invitations || [])];
        const index = invitations.findIndex((candidate) => candidate.id === invitationId);
        const invitation = invitations[index];
        if (!invitation || invitation.status !== "pending" || invitation.expiresAt <= new Date(clock()).toISOString() || invitation.providerId !== providerId || invitation.identityHash !== invitationIdentityHash({ providerId, issuer, subject })) throw new AuthError("Invitation is invalid or expired", 403, "invitation-invalid");
        invitations[index] = { ...invitation, status: "accepted", acceptedAt: nextTimestamp(current.updatedAt, clock) };
        const memberProfiles = { ...(current.memberProfiles || {}), [invitation.actorId]: { version: 1, id: invitation.actorId, name: invitation.name, source: "invitation", createdAt: current.memberProfiles?.[invitation.actorId]?.createdAt || invitations[index].acceptedAt, updatedAt: invitations[index].acceptedAt } };
        const members = current.members.some((member) => member.actorId === invitation.actorId)
          ? current.members.map((member) => member.actorId === invitation.actorId ? { ...member, role: invitation.role, status: "active" } : member)
          : [...current.members, { actorId: invitation.actorId, role: invitation.role, status: "active" }].sort((left, right) => left.actorId.localeCompare(right.actorId));
        return { ...current, invitations, memberProfiles, members, updatedAt: invitations[index].acceptedAt };
      });
      return this.resolveMemberActor(prepared.actorId, organization.id);
    },
    async probe() {
      await repository.list();
      return true;
    }
  });
}
