---
layer: knowledge
type: spec
last_verified: 2026-08-11
depends_on: [docs/architecture/identity-and-audit-boundary.md]
---

# SCIM Provisioning Contract

> Purpose: define the minimum server-to-server SCIM boundary before any endpoint is exposed.
> Update when: SCIM authentication, idempotency, role policy, lifecycle or audit behavior changes.
> Do not include: deployment credentials, provider tenant values or browser-facing membership controls.

## Required Boundary

- SCIM is a server-to-server organization endpoint. Browser cookies and Studio sessions never authorize it.
- Each provisioner uses a server-only credential reference scoped to exactly one organization. Raw credentials, bearer values and request bodies never enter audit events, Project data, workspace, Skill packages or browser responses.
- A person is keyed by `(providerId, externalResourceId)`. `userName`, email and display name are mutable attributes only.
- Create, replace, patch and deactivate require an `operationVersion`; replaying the same `(providerId, externalResourceId, operationVersion)` returns the recorded result without a second membership or audit mutation.
- Provider role mapping is an explicit allowlist to `admin` or `member`. It cannot grant Project ownership or bypass Project ACL.
- Deactivation uses the existing organization update plus session-revocation outbox. Historical Project and audit attribution remain intact.
- Every accepted lifecycle change emits one organization-scope audit event with provider/resource references only; it excludes profile bodies, tokens, email and secret material.

## Implementation Gates

1. Persist provider configuration references, external-resource bindings and idempotency receipts in the organization boundary.
2. Route SCIM create/update/deactivate through the same member lifecycle function used by manual changes and invitations.
3. Add contract tests for credential rejection, organization isolation, operation replay, role allowlist, suspend/session denial and preserved attribution.
4. Add HTTP conformance tests only after server-only credential lookup and minimal error mapping exist.
