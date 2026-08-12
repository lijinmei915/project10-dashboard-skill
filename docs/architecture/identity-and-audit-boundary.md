---
layer: knowledge
type: spec
last_verified: 2026-08-11
depends_on: [docs/SECURITY.md, docs/ARCHITECTURE.md, docs/ROADMAP.md]
---

# Enterprise Identity And Audit Boundary

> Purpose: define the provider-neutral enterprise identity, provisioning and external audit anchoring contracts for Studio.
> Update when: identity protocol, member lifecycle, session revocation or external audit retention contract changes.
> Do not include: an IdP-specific setup tutorial, provider secrets, tenant values or an assertion that these future integrations are already enabled.

## Status And Scope

The current implementation uses disabled local identity or a server-managed token identity source, then maps that actor to a persisted organization member on every request. Organization status, roles, Project ACL and server-side HttpOnly sessions are already authoritative.

OIDC Authorization Code + PKCE, RS256 verification, HTTP callback, immutable External Identity mapping, manual member session-revocation outbox, a verified-identity invitation acceptance path, and optional PostgreSQL HTTPS audit anchoring are implemented. Invitation email delivery, SCIM, independent sink retention verification, SAML, MFA policy, cross-organization delegation and row-level data policy remain separate follow-up work.

## Identity Model

```txt
OIDC issuer subject
  -> ExternalIdentity(providerId, issuer, subject)
  -> OrganizationMember(memberId, organizationId, status, organizationRole)
  -> server Session(actorId, organizationId, expiresAt)
  -> Project ACL and organization authorization
```

- `issuer` and `subject` are the immutable external identity key. Email, display name and group claims are mutable profile attributes and must never be used as the primary join key.
- An `ExternalIdentity` maps to one member in one organization. Moving a person between organizations requires an explicit membership operation and audit event, not a claim-side overwrite.
- The server remains the OIDC confidential client. It validates issuer, audience, signature, expiry, nonce and authorization-response state before resolving a member.
- Browser code only starts login and follows the callback. It never receives a client secret, refresh token, raw ID token or provider access token.
- Existing `disabled` and `token` modes remain supported for local development and controlled deployments. They are not an enterprise SSO fallback claim.

## OIDC Login Contract

Use Authorization Code flow with PKCE (`S256`), per-attempt `state` and `nonce`.

1. A user selects an organization-specific configured provider.
2. The server creates a short-lived, single-use login transaction containing the intended organization, redirect target allowlist entry, PKCE verifier hash, `state`, `nonce` and expiry.
3. The browser is redirected to the registered authorization endpoint with the exact callback URI, `state`, `nonce`, code challenge and configured scopes.
4. The callback is handled only by the server. It verifies `state`, exchanges the code with the verifier, validates the ID token and resolves `(issuer, subject)`.
5. The server resolves an existing active `ExternalIdentity -> OrganizationMember` mapping, then creates the existing HttpOnly Studio session. It does not proxy an IdP token to the browser.
6. Failed, expired, replayed, cross-organization or suspended mappings return a generic login failure, are audited with minimal metadata and create no session.

Provider configuration is server-only and versioned by `providerId`: issuer discovery URL or fixed endpoints, expected issuer, client ID, encrypted client secret reference, allowed organization, callback URI, allowed scopes, JWK cache policy and optional group-to-role mapping. Discovery and JWK retrieval must pin HTTPS, cache by `kid`, respect expiry and fail closed when signature validation cannot complete.

Redirect targets are relative application paths from an allowlist. The callback never trusts a browser-provided absolute URL, organization ID, role, email or group claim.

## Membership Provisioning

### Default Enrollment Rule

Just-in-time organization enrollment is disabled by default. A valid IdP identity that has no active mapping cannot create an organization, join an organization or gain a role merely from an email domain or group claim.

This keeps authentication separate from authorization and prevents an IdP tenant configuration error from becoming unreviewed Studio access.

### Invitation Source

An organization admin may create a time-limited, single-use invitation for a known target OIDC identity. The invitation records organization, proposed role, provider constraint, the hash of the immutable issuer/subject target, expiry and acceptance state. The raw acceptance secret is shown once and only its hash is stored. It is returned only from invitation creation and never from organization reads, audit details or identity persistence.

Accepting an invitation requires a successful OIDC login. The anonymous start endpoint verifies only the one-time secret and opens a short-lived OIDC transaction; the callback compares the verified identity to the invitation constraint, binds the immutable external identity, activates the membership, consumes the invitation, then emits an organization-scope audit event. Invitation emails and acceptance URLs must not enter audit bodies or generic request logs. The file identity and organization repositories are separate durable stores, so this is authorization fail-closed rather than a cross-repository atomic commit: if membership activation fails after a successful identity bind, the bound identity has no active member and cannot receive a session; retrying the same invitation can complete activation.

### SCIM Source

SCIM is a future server-to-server provisioning source, not a browser API. Its service credential is scoped to one organization and stored as a secret reference. A SCIM resource uses an immutable provider resource ID plus the configured `providerId`; email remains an attribute only.

- Create or activate updates the corresponding member profile and permitted organization role.
- Deactivate immediately suspends the member, removes active authorization and invalidates all sessions for that member across instances.
- Deprovision does not delete historical Project or audit attribution; it records a terminal lifecycle state.
- Group mapping may assign only a configured allowlist of organization roles. It cannot assign Project ownership or bypass Project ACL.
- SCIM retries must be idempotent by `(providerId, externalResourceId, operationVersion)` and all lifecycle changes generate organization-scope audit events.

Manual membership, invitation and SCIM all write through one membership lifecycle service so that role limits, last-active-admin protection, revision checks, session invalidation and audit emission cannot diverge.

## Session And Revocation

The existing server session model remains unchanged: the cookie is HttpOnly and the repository stores only a session hash plus actor and organization references. Every authenticated request re-resolves current member status and organization role.

For immediate suspension, the manual organization member lifecycle writes session-revocation work in the same durable organization update and dispatches it to delete all `(memberId, organizationId)` sessions. Authorization still denies a suspended user even if a revocation worker is delayed. Invitation and SCIM must reuse this same outbox boundary rather than add direct best-effort deletion. Provider logout and IdP-initiated logout are optional later enhancements; they cannot be relied upon as the only revocation mechanism.

## External Audit Anchor Contract

The PostgreSQL audit chain is the operational integrity record. An external anchor improves independent evidence of its history but does not replace database access control, backups, key isolation or a retention policy.

```txt
committed business write + internal audit event
  -> organization hash-chain head
  -> durable anchor outbox
  -> external append-only sink
  -> anchor receipt/status
```

### Anchor Payload

An anchor is a minimal, canonical payload:

```json
{
  "anchorId": "stable id",
  "organizationId": "organization reference",
  "headSequence": 123,
  "headHash": "sha256 hex",
  "anchoredThrough": "2026-08-11T00:00:00.000Z",
  "chainAlgorithm": "sha256-v1",
  "schemaVersion": 1
}
```

It must not contain audit event bodies, workspace or Dataset data, IP addresses, URLs, tokens, cookies, model input/output, secrets or IdP assertions. `organizationId` may be replaced by a stable external pseudonym when the selected sink requires it.

### Delivery Semantics

- The server creates anchor work from a committed internal audit head using a durable outbox. It sends by stable `anchorId`, so retries are idempotent.
- Anchoring is asynchronous. A sink outage, receipt timeout or retry exhaustion never rolls back a successfully committed Project, membership or audit write.
- The external sink must be independent from the primary Studio database account and provide append-only or retention-locked semantics plus a durable receipt/reference. Object storage with WORM retention, a separate audit account or a managed compliance ledger are acceptable deployment choices; the sink adapter owns vendor details.
- The dispatcher uses bounded retry with backoff, records only status code/category and opaque receipt reference, and alerts on stale anchors. It never writes sink credentials or response bodies into the audit chain.
- An anchor is only emitted after the relevant internal chain commit. Replays may create duplicate delivery attempts but must not create competing chain heads for the same `(organizationId, headSequence, headHash)`.

### Verification And Reporting

Organization administrators can receive a summary containing internal chain integrity, latest anchored sequence/hash, last successful anchor time, pending/failed status and freshness classification. Raw sink credentials, raw receipts and other organizations' anchors are never returned.

Verification compares the internal chain head against the latest valid external receipt and reports one of `current`, `lagging`, `pending`, `failed` or `unavailable`. It does not claim that all historical events are externally retained unless the configured sink's retention evidence is also verified.

## Required Implementation Gates

1. OIDC contract tests cover state/nonce/PKCE replay rejection, issuer/audience/signature validation, callback allowlisting, inactive mapping rejection and no token leakage to browser or logs. File-storage coverage is required in all environments; PostgreSQL mapping conformance runs when `DASHBOARD_TEST_POSTGRES_URL` is configured.
2. Membership lifecycle tests cover manual updates and invitation acceptance through the organization service; suspension must deny an existing session immediately across two server instances. File-storage invitation coverage proves secret non-persistence, verified subject matching, immutable binding, dynamic-member session creation and HTTP start/callback flow. PostgreSQL invitation conformance and SCIM coverage remain required before claiming the full lifecycle.
3. SCIM endpoint tests cover idempotent create/update/deactivate, role allowlist and preserved historical attribution.
4. Anchor tests inject sink outage, duplicate delivery, restart recovery and receipt mismatch; business write success and audit-chain integrity must remain correct throughout. Current unit coverage proves sink failure retention and stable retry; PostgreSQL chain/outbox conformance runs when `DASHBOARD_TEST_POSTGRES_URL` is configured.
5. Production readiness reports configured identity provider status and anchor freshness without exposing secrets, assertion data, storage paths or audit bodies.

## Non-Goals

- No implementation claim for SCIM, invitation email delivery, independently retained/WORM external audit evidence, SAML, MFA or row-level policy yet.
- No browser-side token handling, direct IdP-to-Project role mapping or arbitrary claim expression engine.
- No automatic enrollment based solely on email domain, group membership or a browser-supplied organization value.
