import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createExternalIdentityRepository } from "../.agents/skills/dashboard-html/scripts/studio-external-identity-repository.mjs";
import { createOidcLoginTransactionStore } from "../.agents/skills/dashboard-html/scripts/oidc-login-transaction-store.mjs";
import { createOidcProviderService } from "../.agents/skills/dashboard-html/scripts/oidc-provider-service.mjs";
import { createStudioAuthService } from "../.agents/skills/dashboard-html/scripts/studio-auth-service.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createOidcAuthorizationCodeExchange, createOidcRs256TokenVerifier } from "../.agents/skills/dashboard-html/scripts/oidc-token-verifier.mjs";
import { createConfiguredOidcProviderService } from "../.agents/skills/dashboard-html/scripts/oidc-runtime-config.mjs";

function signedJwt(privateKey, { kid = "key-1", payload }) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", typ: "JWT", kid });
  const body = encode(payload);
  return `${header}.${body}.${sign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey).toString("base64url")}`;
}

test("external identities use immutable provider issuer subject mapping without profile data", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-external-identity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let now = Date.parse("2026-08-11T10:00:00.000Z");
  const repository = createExternalIdentityRepository({ directory: root, clock: () => now });
  const bound = await repository.bind({
    providerId: "acme-oidc",
    issuer: "https://login.example.test",
    subject: "idp-subject-42",
    organizationId: "acme",
    actorId: "member-42"
  });
  assert.match(bound.id, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(bound).includes("email"), false);
  assert.equal((await repository.get({ providerId: "acme-oidc", issuer: "https://login.example.test", subject: "idp-subject-42" })).actorId, "member-42");
  now += 1_000;
  await assert.rejects(() => repository.bind({ ...bound, actorId: "member-43" }), (error) => error?.issues?.[0]?.code === "immutable");
  assert.equal(await repository.unbind({ providerId: "acme-oidc", issuer: "https://login.example.test", subject: "idp-subject-42", organizationId: "acme", actorId: "member-42" }), true);
  assert.equal((await repository.get({ providerId: "acme-oidc", issuer: "https://login.example.test", subject: "idp-subject-42" })).status, "unbound");
});

test("OIDC transactions are single-use, short-lived, and reject external return paths", () => {
  let now = Date.parse("2026-08-11T10:00:00.000Z");
  const store = createOidcLoginTransactionStore({ clock: () => now, ttlMs: 60_000, random: (() => { let index = 0; return () => `random-${++index}`; })() });
  const started = store.create({ providerId: "acme-oidc", organizationId: "acme", returnTo: "/studio/projects/project-1" });
  assert.equal(started.state, "random-3");
  const transaction = store.consume(started.state);
  assert.deepEqual(transaction, { providerId: "acme-oidc", organizationId: "acme", returnTo: "/studio/projects/project-1", codeVerifier: "random-1", nonce: "random-2", expiresAt: Date.parse("2026-08-11T10:01:00.000Z") });
  assert.equal(store.consume(started.state), null);
  assert.throws(() => store.create({ providerId: "acme-oidc", organizationId: "acme", returnTo: "https://outside.example" }), /application-relative/);
  const expired = store.create({ providerId: "acme-oidc", organizationId: "acme" });
  now += 60_001;
  assert.equal(store.consume(expired.state), null);
});

test("OIDC provider service builds PKCE authorization and accepts only verified mapped members", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-oidc-provider-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const identities = createExternalIdentityRepository({ directory: root });
  await identities.bind({ providerId: "acme-oidc", issuer: "https://issuer.example.test/", subject: "subject-7", organizationId: "acme", actorId: "member-7" });
  const transactions = createOidcLoginTransactionStore({ random: (() => { let index = 0; return () => `random-${++index}`; })() });
  const service = createOidcProviderService({
    providers: [{ id: "acme-oidc", organizationId: "acme", issuer: "https://issuer.example.test/", authorizationEndpoint: "https://issuer.example.test/authorize", tokenEndpoint: "https://issuer.example.test/token", redirectUri: "https://studio.example.test/api/auth/oidc/acme-oidc/callback", clientId: "studio-client", clientSecret: "server-only-secret" }],
    transactionStore: transactions,
    externalIdentityRepository: identities,
    exchangeAuthorizationCode: async ({ code, codeVerifier }) => {
      assert.equal(code, "authorization-code");
      assert.equal(codeVerifier, "random-1");
      return { idToken: "verified-token" };
    },
    verifyIdToken: async ({ idToken, nonce }) => {
      assert.equal(idToken, "verified-token");
      return { issuer: "https://issuer.example.test/", subject: "subject-7", audience: ["studio-client"], nonce };
    },
    resolveActor: async (actorId, organizationId) => ({ id: actorId, name: "Mapped member", role: "editor", organizationId })
  });
  const started = service.start({ providerId: "acme-oidc", returnTo: "/studio/projects" });
  const url = new URL(started.redirectUrl);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), "3ZiwU1rxR1xksxKlDlePQpV7Z3FSmB3r1oi6IM08BQc");
  assert.equal(url.searchParams.get("client_secret"), null);
  const completed = await service.complete({ providerId: "acme-oidc", state: url.searchParams.get("state"), code: "authorization-code" });
  assert.deepEqual(completed, { actor: { id: "member-7", name: "Mapped member", role: "editor", organizationId: "acme" }, returnTo: "/studio/projects" });
  await assert.rejects(() => service.complete({ providerId: "acme-oidc", state: url.searchParams.get("state"), code: "authorization-code" }), (error) => error.code === "oidc-transaction-invalid");
});

test("OIDC HTTP routes exchange a verified callback for an HttpOnly Studio session", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-oidc-http-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const identityRepository = createExternalIdentityRepository({ directory: path.join(root, "identities") });
  await identityRepository.bind({ providerId: "acme-oidc", issuer: "https://issuer.example.test/", subject: "subject-9", organizationId: "acme", actorId: "member-9" });
  const authService = createStudioAuthService({ mode: "oidc", users: [{ id: "member-9", name: "OIDC Member", role: "editor", organizationId: "acme" }] });
  const oidcProviderService = createOidcProviderService({
    providers: [{ id: "acme-oidc", organizationId: "acme", issuer: "https://issuer.example.test/", authorizationEndpoint: "https://issuer.example.test/authorize", tokenEndpoint: "https://issuer.example.test/token", redirectUri: "https://studio.example.test/api/auth/oidc/acme-oidc/callback", clientId: "studio-client" }],
    transactionStore: createOidcLoginTransactionStore(),
    externalIdentityRepository: identityRepository,
    exchangeAuthorizationCode: async () => ({ idToken: "verified-token" }),
    verifyIdToken: async ({ nonce }) => ({ issuer: "https://issuer.example.test/", subject: "subject-9", audience: ["studio-client"], nonce }),
    resolveActor: (actorId, organizationId) => authService.actor(actorId, organizationId)
  });
  const server = startPreviewServer({ listenPort: 0, silent: true, authService, oidcProviderService, externalIdentityRepository: identityRepository });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const readiness = await fetch(`${endpoint}/api/platform/readiness`);
  assert.equal(readiness.status, 200);
  assert.deepEqual((await readiness.json()).identity, { status: "ok", mode: "oidc", providerCount: 1 });
  const providers = await fetch(`${endpoint}/api/auth/oidc/providers`);
  assert.deepEqual(await providers.json(), { providers: [{ id: "acme-oidc", organizationId: "acme", issuer: "https://issuer.example.test/", scopes: ["openid", "profile", "email"] }] });
  const start = await fetch(`${endpoint}/api/auth/oidc/acme-oidc/start?returnTo=%2Fstudio%2Fprojects`, { redirect: "manual" });
  assert.equal(start.status, 302);
  const authorization = new URL(start.headers.get("location"));
  const callback = await fetch(`${endpoint}/api/auth/oidc/acme-oidc/callback?state=${encodeURIComponent(authorization.searchParams.get("state"))}&code=verified-code`, { redirect: "manual" });
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("location"), "/studio/projects");
  const cookie = callback.headers.get("set-cookie").split(";", 1)[0];
  assert.match(callback.headers.get("set-cookie"), /HttpOnly/);
  const status = await fetch(`${endpoint}/api/auth/status`, { headers: { Cookie: cookie } });
  assert.deepEqual((await status.json()).actor, { id: "member-9", name: "OIDC Member", role: "editor", organizationId: "acme" });
  assert.equal((await fetch(`${endpoint}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "not-supported" }) })).status, 409);
});

test("OIDC readiness fails closed when provider orchestration or identity storage is unavailable", async (t) => {
  const authService = createStudioAuthService({ mode: "oidc", users: [{ id: "member-11", name: "Unavailable OIDC Member", role: "editor", organizationId: "acme" }] });
  const server = startPreviewServer({ listenPort: 0, silent: true, authService });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${endpoint}/api/platform/readiness`);
  assert.equal(response.status, 503);
  assert.deepEqual((await response.json()).identity, { status: "error", mode: "oidc", providerCount: 0, error: "configuration-missing" });
});

test("OIDC RS256 verifier and authorization exchange reject unsafe or unverified provider responses", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const now = Date.parse("2026-08-11T12:00:00.000Z");
  const provider = { issuer: "https://issuer.example.test/", clientId: "studio-client", jwksUri: "https://issuer.example.test/keys", tokenEndpoint: "https://issuer.example.test/token", redirectUri: "https://studio.example.test/callback", clientSecret: "secret" };
  let keyFetches = 0;
  const verifier = createOidcRs256TokenVerifier({ clock: () => now, fetchImpl: async (url) => {
    assert.equal(url, provider.jwksUri);
    keyFetches += 1;
    return new Response(JSON.stringify({ keys: [{ ...jwk, kid: "key-1", use: "sig" }] }), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "max-age=60" } });
  } });
  const token = signedJwt(privateKey, { payload: { iss: provider.issuer, sub: "member-subject", aud: provider.clientId, nonce: "nonce-1", exp: Math.floor(now / 1_000) + 120, iat: Math.floor(now / 1_000) } });
  assert.deepEqual(await verifier.verify({ provider, idToken: token, nonce: "nonce-1" }), { issuer: provider.issuer, subject: "member-subject", audience: [provider.clientId], nonce: "nonce-1" });
  assert.equal(keyFetches, 1);
  await assert.rejects(() => verifier.verify({ provider, idToken: token, nonce: "wrong" }), (error) => error.code === "oidc-token-invalid");
  const expired = signedJwt(privateKey, { payload: { iss: provider.issuer, sub: "member-subject", aud: provider.clientId, nonce: "nonce-1", exp: Math.floor(now / 1_000) - 1 } });
  await assert.rejects(() => verifier.verify({ provider, idToken: expired, nonce: "nonce-1" }), (error) => error.code === "oidc-token-invalid");
  let exchangeRequest = null;
  const exchange = createOidcAuthorizationCodeExchange({ fetchImpl: async (url, options) => {
    exchangeRequest = { url, options };
    return new Response(JSON.stringify({ id_token: token, access_token: "must-not-return" }), { status: 200, headers: { "Content-Type": "application/json" } });
  } });
  assert.deepEqual(await exchange({ provider, code: "auth-code", codeVerifier: "verifier" }), { idToken: token });
  assert.equal(exchangeRequest.url, provider.tokenEndpoint);
  assert.match(exchangeRequest.options.headers.Authorization, /^Basic /);
  assert.equal(exchangeRequest.options.body.get("code_verifier"), "verifier");
  assert.equal(exchangeRequest.options.body.get("client_secret"), null);
});

test("OIDC runtime configuration separates provider metadata from client secrets", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-oidc-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const authService = createStudioAuthService({ mode: "oidc", users: [{ id: "member-10", name: "Configured member", role: "editor", organizationId: "acme" }] });
  const environment = {
    DASHBOARD_AUTH_MODE: "oidc",
    DASHBOARD_PUBLIC_ORIGIN: "https://studio.example.test",
    DASHBOARD_OIDC_PROVIDERS_JSON: JSON.stringify({ acme: { organizationId: "acme", issuer: "https://issuer.example.test/", authorizationEndpoint: "https://issuer.example.test/authorize", tokenEndpoint: "https://issuer.example.test/token", jwksUri: "https://issuer.example.test/keys", redirectUri: "https://studio.example.test/api/auth/oidc/acme/callback", clientId: "studio-client" } }),
    DASHBOARD_OIDC_CLIENT_SECRETS_JSON: JSON.stringify({ acme: "secret-only-in-environment" })
  };
  const configured = createConfiguredOidcProviderService({ environment, authService, externalIdentityRepository: createExternalIdentityRepository({ directory: root }) });
  assert.deepEqual(configured.providers(), [{ id: "acme", organizationId: "acme", issuer: "https://issuer.example.test/", scopes: ["openid", "profile", "email"] }]);
  const started = configured.start({ providerId: "acme" });
  assert.equal(started.redirectUrl.includes("secret-only-in-environment"), false);
  assert.throws(() => createConfiguredOidcProviderService({ environment: { ...environment, DASHBOARD_PUBLIC_ORIGIN: "https://other.example.test" }, authService, externalIdentityRepository: createExternalIdentityRepository({ directory: path.join(root, "mismatch") }) }), /redirectUri must equal/);
  assert.throws(() => createConfiguredOidcProviderService({ environment: { DASHBOARD_AUTH_MODE: "oidc", DASHBOARD_OIDC_PROVIDERS_JSON: "{}" }, authService, externalIdentityRepository: createExternalIdentityRepository({ directory: path.join(root, "missing") }) }), /requires DASHBOARD_OIDC_PROVIDERS_JSON/);
});
