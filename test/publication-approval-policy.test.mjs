import assert from "node:assert/strict";
import test from "node:test";
import { publicationApprovalOrganizationsFromEnv, createPublicationApprovalPolicy } from "../.agents/skills/dashboard-html/scripts/publication-approval-policy.mjs";

test("parses configured publication approval organizations", () => {
  assert.deepEqual(publicationApprovalOrganizationsFromEnv(" org-a,org_b , org.a "), ["org-a", "org_b", "org.a"]);
  assert.throws(() => publicationApprovalOrganizationsFromEnv("org-a,not valid"), /organization id is invalid/);
});

test("requires approval only for configured organization actors", () => {
  const policy = createPublicationApprovalPolicy({ organizationIds: ["org-a"] });
  assert.equal(policy.configured, true);
  assert.equal(policy.requiresApproval({ organizationId: "org-a" }), true);
  assert.equal(policy.requiresApproval({ organizationId: "org-b" }), false);
  assert.equal(policy.requiresApproval(null), false);
  assert.deepEqual(policy.status({ organizationId: "org-a" }), { required: true });
});
