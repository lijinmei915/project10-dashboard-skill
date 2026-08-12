import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createExternalIdentityRepository } from "../.agents/skills/dashboard-html/scripts/studio-external-identity-repository.mjs";
import { createOidcLoginTransactionStore } from "../.agents/skills/dashboard-html/scripts/oidc-login-transaction-store.mjs";
import { createOidcProviderService } from "../.agents/skills/dashboard-html/scripts/oidc-provider-service.mjs";
import { createOrganizationService } from "../.agents/skills/dashboard-html/scripts/organization-service.mjs";
import { createOrganizationRepository } from "../.agents/skills/dashboard-html/scripts/studio-organization-repository.mjs";
import { createStudioAuthService } from "../.agents/skills/dashboard-html/scripts/studio-auth-service.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";

const admin = { id: "admin", name: "Organization Admin", role: "admin", organizationId: "acme" };

test("OIDC invitation activates a durable dynamic member without storing the acceptance secret", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-invitation-lifecycle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const now = Date.parse("2026-08-11T15:00:00.000Z");
  const organizationRepository = createOrganizationRepository({ directory: path.join(root, "organizations") });
  const organizationService = createOrganizationService({ repository: organizationRepository, identities: [admin], clock: () => now, random: () => "shown-once-acceptance-token" });
  const initial = await organizationService.current(admin, { includeMembers: true });
  const created = await organizationService.createInvitation(admin, {
    expectedUpdatedAt: initial.updatedAt,
    providerId: "acme-oidc",
    issuer: "https://issuer.example.test/",
    subject: "verified-subject-42",
    role: "member",
    name: "Invited analyst",
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString()
  });
  assert.equal(created.acceptanceToken, "shown-once-acceptance-token");
  assert.equal(JSON.stringify(created.invitation).includes("acceptance"), false);
  assert.equal(JSON.stringify(await organizationRepository.get("acme")).includes(created.acceptanceToken), false);
  const startedInvitation = await organizationService.startInvitationAcceptance({ providerId: "acme-oidc", acceptanceToken: created.acceptanceToken });
  assert.equal(startedInvitation.organizationId, "acme");

  const identities = createExternalIdentityRepository({ directory: path.join(root, "identities") });
  const auth = createStudioAuthService({ mode: "oidc", users: [admin], organizationService, clock: () => now });
  const oidc = createOidcProviderService({
    providers: [{ id: "acme-oidc", organizationId: "acme", issuer: "https://issuer.example.test/", authorizationEndpoint: "https://issuer.example.test/authorize", tokenEndpoint: "https://issuer.example.test/token", redirectUri: "https://studio.example.test/callback", clientId: "studio-client" }],
    transactionStore: createOidcLoginTransactionStore({ clock: () => now, random: (() => { let index = 0; return () => `random-${++index}`; })() }),
    externalIdentityRepository: identities,
    exchangeAuthorizationCode: async () => ({ idToken: "verified-token" }),
    verifyIdToken: async ({ nonce }) => ({ issuer: "https://issuer.example.test/", subject: "verified-subject-42", audience: ["studio-client"], nonce }),
    resolveActor: (actorId, organizationId) => auth.actor(actorId, organizationId),
    prepareInvitationAcceptance: organizationService.prepareInvitationAcceptance.bind(organizationService),
    acceptInvitation: organizationService.acceptInvitation.bind(organizationService)
  });
  const started = oidc.start({ providerId: "acme-oidc", invitation: startedInvitation });
  const state = new URL(started.redirectUrl).searchParams.get("state");
  const completed = await oidc.complete({ providerId: "acme-oidc", state, code: "authorization-code" });
  assert.equal(completed.actor.name, "Invited analyst");
  assert.equal(completed.actor.role, "editor");
  const member = (await organizationService.current(admin, { includeMembers: true })).members.find(({ name }) => name === "Invited analyst");
  assert.equal(member.status, "active");
  const mapping = await identities.get({ providerId: "acme-oidc", issuer: "https://issuer.example.test/", subject: "verified-subject-42" });
  assert.equal(mapping.actorId, completed.actor.id);
  const session = await auth.loginActor(completed.actor);
  assert.equal((await auth.status({ headers: { cookie: session.cookie } })).actor.id, completed.actor.id);
});

test("OIDC invitation rejects a verified subject that does not match its constraint", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-invitation-mismatch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const now = Date.parse("2026-08-11T16:00:00.000Z");
  const organizationRepository = createOrganizationRepository({ directory: path.join(root, "organizations") });
  const organizationService = createOrganizationService({ repository: organizationRepository, identities: [admin], clock: () => now, random: () => "shown-once-acceptance-token" });
  const initial = await organizationService.current(admin, { includeMembers: true });
  const created = await organizationService.createInvitation(admin, { expectedUpdatedAt: initial.updatedAt, providerId: "acme-oidc", issuer: "https://issuer.example.test/", subject: "expected-subject", role: "member", name: "Protected invite", expiresAt: new Date(now + 60 * 60 * 1000).toISOString() });
  const invitation = await organizationService.startInvitationAcceptance({ providerId: "acme-oidc", acceptanceToken: created.acceptanceToken });
  const identities = createExternalIdentityRepository({ directory: path.join(root, "identities") });
  const oidc = createOidcProviderService({
    providers: [{ id: "acme-oidc", organizationId: "acme", issuer: "https://issuer.example.test/", authorizationEndpoint: "https://issuer.example.test/authorize", tokenEndpoint: "https://issuer.example.test/token", redirectUri: "https://studio.example.test/callback", clientId: "studio-client" }],
    transactionStore: createOidcLoginTransactionStore(), externalIdentityRepository: identities,
    exchangeAuthorizationCode: async () => ({ idToken: "verified-token" }), verifyIdToken: async ({ nonce }) => ({ issuer: "https://issuer.example.test/", subject: "other-subject", audience: ["studio-client"], nonce }), resolveActor: async () => null,
    prepareInvitationAcceptance: organizationService.prepareInvitationAcceptance.bind(organizationService), acceptInvitation: organizationService.acceptInvitation.bind(organizationService)
  });
  const state = new URL(oidc.start({ providerId: "acme-oidc", invitation }).redirectUrl).searchParams.get("state");
  await assert.rejects(() => oidc.complete({ providerId: "acme-oidc", state, code: "authorization-code" }), (error) => error?.code === "invitation-invalid");
  assert.equal(await identities.get({ providerId: "acme-oidc", issuer: "https://issuer.example.test/", subject: "other-subject" }), null);
  const current = await organizationService.current(admin, { includeMembers: true });
  assert.equal(current.members.some(({ name }) => name === "Protected invite"), false);
  assert.equal(current.invitations[0].status, "pending");
});

test("OIDC invitation reactivates a previously suspended dynamic member", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-invitation-reactivate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const now = Date.parse("2026-08-11T16:30:00.000Z");
  const repository = createOrganizationRepository({ directory: path.join(root, "organizations") });
  const service = createOrganizationService({ repository, identities: [admin], clock: () => now, random: () => "reactivation-token" });
  const current = await service.current(admin, { includeMembers: true });
  const created = await service.createInvitation(admin, { expectedUpdatedAt: current.updatedAt, providerId: "acme-oidc", issuer: "https://issuer.example.test/", subject: "returning-subject", role: "member", name: "Returning analyst", expiresAt: new Date(now + 60 * 60 * 1000).toISOString() });
  const stored = await repository.get("acme");
  const invitation = stored.invitations[0];
  await repository.update("acme", {}, (organization) => ({ ...organization, memberProfiles: { ...organization.memberProfiles, [invitation.actorId]: { id: invitation.actorId, name: invitation.name, source: "invitation" } }, members: [...organization.members, { actorId: invitation.actorId, role: "member", status: "suspended" }], updatedAt: new Date(now + 1).toISOString() }));
  const actor = await service.acceptInvitation({ organizationId: "acme", invitationId: invitation.id, providerId: "acme-oidc", issuer: "https://issuer.example.test/", subject: "returning-subject" });
  assert.equal(actor.name, "Returning analyst");
  assert.equal((await service.current(admin, { includeMembers: true })).members.find(({ actorId }) => actorId === invitation.actorId).status, "active");
});

test("organization invitation HTTP flow creates a session only after verified OIDC acceptance", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-invitation-http-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const now = Date.parse("2026-08-11T17:00:00.000Z");
  const organizationRepository = createOrganizationRepository({ directory: path.join(root, "organizations") });
  const organizationService = createOrganizationService({ repository: organizationRepository, identities: [admin], clock: () => now, random: () => "http-acceptance-token" });
  await organizationService.current(admin, { includeMembers: true });
  const externalIdentities = createExternalIdentityRepository({ directory: path.join(root, "identities") });
  const auth = createStudioAuthService({ mode: "oidc", users: [admin], organizationService, clock: () => now });
  const oidc = createOidcProviderService({
    providers: [{ id: "acme-oidc", organizationId: "acme", issuer: "https://issuer.example.test/", authorizationEndpoint: "https://issuer.example.test/authorize", tokenEndpoint: "https://issuer.example.test/token", redirectUri: "https://studio.example.test/api/auth/oidc/acme-oidc/callback", clientId: "studio-client" }],
    transactionStore: createOidcLoginTransactionStore({ clock: () => now }), externalIdentityRepository: externalIdentities,
    exchangeAuthorizationCode: async () => ({ idToken: "verified-token" }), verifyIdToken: async ({ nonce }) => ({ issuer: "https://issuer.example.test/", subject: "http-subject", audience: ["studio-client"], nonce }), resolveActor: (actorId, organizationId) => auth.actor(actorId, organizationId),
    prepareInvitationAcceptance: organizationService.prepareInvitationAcceptance.bind(organizationService), acceptInvitation: organizationService.acceptInvitation.bind(organizationService)
  });
  const server = startPreviewServer({ listenPort: 0, silent: true, authService: auth, oidcProviderService: oidc, externalIdentityRepository: externalIdentities, organizationRepository, organizationService });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const adminSession = await auth.loginActor(admin);
  const adminCookie = adminSession.cookie.split(";", 1)[0];
  const organization = await organizationService.current(admin, { includeMembers: true });
  const create = await fetch(`${endpoint}/api/organizations/current/invitations`, {
    method: "POST", headers: { Cookie: adminCookie, Origin: endpoint, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: organization.updatedAt, providerId: "acme-oidc", issuer: "https://issuer.example.test/", subject: "http-subject", name: "HTTP Invitee", role: "member", expiresAt: new Date(now + 60 * 60 * 1000).toISOString() })
  });
  assert.equal(create.status, 201);
  const created = await create.json();
  assert.equal(JSON.stringify(created.invitation).includes("acceptance"), false);
  const begin = await fetch(`${endpoint}/api/auth/oidc/acme-oidc/invitation-start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acceptanceToken: created.acceptanceToken, returnTo: "/studio/projects" }) });
  assert.equal(begin.status, 200);
  const started = await begin.json();
  const state = new URL(started.redirectUrl).searchParams.get("state");
  const callback = await fetch(`${endpoint}/api/auth/oidc/acme-oidc/callback?state=${encodeURIComponent(state)}&code=verified-code`, { redirect: "manual" });
  assert.equal(callback.status, 302);
  const memberCookie = callback.headers.get("set-cookie").split(";", 1)[0];
  const status = await fetch(`${endpoint}/api/auth/status`, { headers: { Cookie: memberCookie } });
  assert.equal((await status.json()).actor.name, "HTTP Invitee");
});
