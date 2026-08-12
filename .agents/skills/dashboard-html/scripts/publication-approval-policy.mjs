import { ContractError } from "./workspace-core.mjs";

function normalizeOrganizationId(value) {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new ContractError("Publication approval organization id is invalid", [{ path: "/organizationIds", code: "format", message: "Use a safe organization id" }]);
  return id;
}

export function publicationApprovalOrganizationsFromEnv(value = process.env.DASHBOARD_PUBLICATION_APPROVAL_ORGANIZATIONS || "") {
  return String(value).split(",").map((item) => item.trim()).filter(Boolean).map(normalizeOrganizationId);
}

export function createPublicationApprovalPolicy({ organizationIds = [] } = {}) {
  const requiredOrganizations = new Set(organizationIds.map(normalizeOrganizationId));
  return Object.freeze({
    configured: requiredOrganizations.size > 0,
    requiresApproval(actor) {
      return typeof actor?.organizationId === "string" && requiredOrganizations.has(normalizeOrganizationId(actor.organizationId));
    },
    status(actor) { return { required: this.requiresApproval(actor) }; }
  });
}
