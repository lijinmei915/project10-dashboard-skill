import { createHash } from "node:crypto";
import { AuthError } from "./studio-auth-service.mjs";
import { ContractError } from "./workspace-core.mjs";
import { scopeDataSourceRecords } from "./data-source-service.mjs";

const roles = new Set(["admin", "editor", "viewer"]);
const organizationRoles = new Set(["admin", "member"]);
const operators = new Set(["equals", "in", "contains", "before", "after"]);
const safeId = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function fail(message, path, code = "invalid") {
  throw new ContractError(message, [{ path, code, message }]);
}

function normalizeIds(value, path, allowed = null) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.length || value.length > 100) fail("Policy subject list is invalid", path, "shape");
  const values = [...new Set(value.map(String))];
  for (const item of values) {
    if (allowed ? !allowed.has(item) : !safeId.test(item)) fail(`Policy subject ${item} is invalid`, path, "enum");
  }
  return values;
}

function normalizeFilter(filter, path) {
  if (!filter || typeof filter !== "object" || !safeId.test(String(filter.dimensionId || "")) || !operators.has(filter.operator)) fail("Policy filter is invalid", path, "shape");
  const value = filter.value;
  if (filter.operator === "in") {
    if (!Array.isArray(value) || !value.length || value.length > 100 || value.some((item) => !["string", "number", "boolean"].includes(typeof item))) fail("Policy in filter requires bounded scalar values", `${path}/value`, "shape");
  } else if (!["string", "number", "boolean"].includes(typeof value)) fail("Policy filter value must be scalar", `${path}/value`, "type");
  return { dimensionId: String(filter.dimensionId), operator: filter.operator, value: structuredClone(value) };
}

function normalizePolicy(policy, index) {
  const path = `/policies/${index}`;
  if (!policy || !safeId.test(String(policy.id || "")) || !safeId.test(String(policy.organizationId || "")) || !safeId.test(String(policy.datasetId || ""))) fail("Data policy identity is invalid", path, "shape");
  if (!Array.isArray(policy.grants) || !policy.grants.length || policy.grants.length > 100) fail("Data policy requires grants", `${path}/grants`, "required");
  const grants = policy.grants.map((grant, grantIndex) => {
    const grantPath = `${path}/grants/${grantIndex}`;
    if (!grant || !safeId.test(String(grant.id || ""))) fail("Data policy grant id is invalid", `${grantPath}/id`, "format");
    const actorIds = normalizeIds(grant.actorIds, `${grantPath}/actorIds`);
    const actorRoles = normalizeIds(grant.actorRoles, `${grantPath}/actorRoles`, roles);
    const memberRoles = normalizeIds(grant.organizationRoles, `${grantPath}/organizationRoles`, organizationRoles);
    if (!actorIds.length && !actorRoles.length && !memberRoles.length) fail("Data policy grant requires a subject selector", grantPath, "required");
    if (!Array.isArray(grant.filters) || !grant.filters.length || grant.filters.length > 12) fail("Data policy grant requires 1-12 filters", `${grantPath}/filters`, "required");
    return { id: String(grant.id), actorIds, actorRoles, organizationRoles: memberRoles, filters: grant.filters.map((filter, filterIndex) => normalizeFilter(filter, `${grantPath}/filters/${filterIndex}`)) };
  });
  if (new Set(grants.map(({ id }) => id)).size !== grants.length) fail("Data policy grant ids must be unique", `${path}/grants`, "unique");
  return { id: String(policy.id), organizationId: String(policy.organizationId), datasetId: String(policy.datasetId), grants };
}

function grantMatches(grant, actor) {
  return grant.actorIds.includes(actor.id)
    || grant.actorRoles.includes(actor.role)
    || grant.organizationRoles.includes(actor.organizationRole);
}

function scopeKey(policy, grant) {
  return createHash("sha256").update(JSON.stringify({ policyId: policy.id, grantId: grant.id, filters: grant.filters })).digest("hex");
}

export function createDataAccessPolicyService({ policies = [] } = {}) {
  if (!Array.isArray(policies)) fail("Data policies must be an array", "/policies", "type");
  const normalized = policies.map(normalizePolicy);
  const bindings = new Set();
  for (const policy of normalized) {
    const binding = `${policy.organizationId}\u0000${policy.datasetId}`;
    if (bindings.has(binding)) fail("Only one data policy may bind an organization dataset", "/policies", "unique");
    bindings.add(binding);
  }
  return Object.freeze({
    configured: normalized.length > 0,
    policyCount: normalized.length,
    scope(source, actor) {
      const sourceOrganizationId = source?.organizationId || (actor?.organizationId === "local" ? "local" : null);
      if (!source || !actor?.organizationId || sourceOrganizationId !== actor.organizationId) throw new AuthError("Data source not found", 404, "data-source-not-found");
      const policy = normalized.find((item) => item.organizationId === actor.organizationId && item.datasetId === source.id);
      if (!policy) return { source: structuredClone(source), access: { mode: "organization", scopeKey: `organization:${actor.organizationId}` } };
      const grant = policy.grants.find((item) => grantMatches(item, actor));
      if (!grant) throw new AuthError("Data source row access is forbidden", 403, "row-policy-denied");
      return {
        source: scopeDataSourceRecords(source, grant.filters),
        access: { mode: "row-policy", policyId: policy.id, grantId: grant.id, scopeKey: `row-policy:${scopeKey(policy, grant)}` }
      };
    },
    status(actor) {
      if (!actor?.organizationId || (actor.role !== "admin" && actor.organizationRole !== "admin")) throw new AuthError("Organization admin role is required", 403, "organization-admin-required");
      return { configured: normalized.some(({ organizationId }) => organizationId === actor.organizationId), policyCount: normalized.filter(({ organizationId }) => organizationId === actor.organizationId).length };
    }
  });
}

export function dataAccessPoliciesFromEnv(value = process.env.DASHBOARD_DATA_POLICIES_JSON) {
  if (!value) return [];
  let parsed;
  try { parsed = JSON.parse(value); } catch { fail("DASHBOARD_DATA_POLICIES_JSON must be valid JSON", "/policies", "format"); }
  if (!Array.isArray(parsed)) fail("DASHBOARD_DATA_POLICIES_JSON must be an array", "/policies", "type");
  return parsed;
}
