import { createHash } from "node:crypto";
import { AuthError } from "./studio-auth-service.mjs";

function base64url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function codeChallenge(verifier) {
  return base64url(createHash("sha256").update(verifier).digest());
}

function safeId(value, name) {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new Error(`${name} must be a safe identifier`);
  return id;
}

function httpsUrl(value, name, { allowLoopbackHttp = false } = {}) {
  let parsed;
  try { parsed = new URL(String(value || "")); } catch { throw new Error(`${name} must be an absolute URL`); }
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(allowLoopbackHttp && loopback && parsed.protocol === "http:")) throw new Error(`${name} must use HTTPS`);
  if (parsed.username || parsed.password || parsed.hash) throw new Error(`${name} must not include credentials or a hash`);
  return parsed.toString();
}

function normalizeProvider(provider, { allowLoopbackHttp = false } = {}) {
  const scopes = [...new Set((Array.isArray(provider?.scopes) ? provider.scopes : String(provider?.scopes || "openid profile email").split(/\s+/)).map((value) => String(value).trim()).filter(Boolean))];
  if (!scopes.includes("openid")) throw new Error("OIDC provider scopes must include openid");
  return Object.freeze({
    id: safeId(provider?.id, "OIDC provider id"),
    organizationId: safeId(provider?.organizationId, "OIDC organization id"),
    issuer: httpsUrl(provider?.issuer, "OIDC issuer", { allowLoopbackHttp }),
    authorizationEndpoint: httpsUrl(provider?.authorizationEndpoint, "OIDC authorization endpoint", { allowLoopbackHttp }),
    tokenEndpoint: httpsUrl(provider?.tokenEndpoint, "OIDC token endpoint", { allowLoopbackHttp }),
    redirectUri: httpsUrl(provider?.redirectUri, "OIDC redirect URI", { allowLoopbackHttp }),
    jwksUri: provider?.jwksUri ? httpsUrl(provider.jwksUri, "OIDC JWK URI", { allowLoopbackHttp }) : null,
    clientId: String(provider?.clientId || "").trim(),
    clientSecret: provider?.clientSecret ? String(provider.clientSecret) : null,
    scopes: Object.freeze(scopes)
  });
}

function publicProvider(provider) {
  return { id: provider.id, organizationId: provider.organizationId, issuer: provider.issuer, scopes: [...provider.scopes] };
}

function requireCallbackCode(value) {
  const code = String(value || "").trim();
  if (!code || code.length > 4096 || /[\u0000-\u001f\u007f]/.test(code)) throw new AuthError("OIDC callback is invalid", 400, "oidc-callback-invalid");
  return code;
}

export function createOidcProviderService({ providers = [], transactionStore, externalIdentityRepository, exchangeAuthorizationCode, verifyIdToken, resolveActor, prepareInvitationAcceptance = null, acceptInvitation = null, allowLoopbackHttp = false } = {}) {
  if (!transactionStore || typeof transactionStore.create !== "function" || typeof transactionStore.consume !== "function") throw new Error("OIDC transaction store is incomplete");
  if (!externalIdentityRepository || typeof externalIdentityRepository.get !== "function") throw new Error("External identity repository is incomplete");
  if (typeof exchangeAuthorizationCode !== "function" || typeof verifyIdToken !== "function" || typeof resolveActor !== "function") throw new Error("OIDC code exchange, token verification, and actor resolution are required");
  const byId = new Map();
  for (const provider of providers) {
    const normalized = normalizeProvider(provider, { allowLoopbackHttp });
    if (!normalized.clientId) throw new Error("OIDC provider clientId is required");
    if (byId.has(normalized.id)) throw new Error(`OIDC provider ${normalized.id} is duplicated`);
    byId.set(normalized.id, normalized);
  }
  const providerFor = (id) => {
    const provider = byId.get(String(id || ""));
    if (!provider) throw new AuthError("OIDC provider is not available", 404, "oidc-provider-not-found");
    return provider;
  };
  return Object.freeze({
    providers: () => [...byId.values()].map(publicProvider),
    start({ providerId, returnTo, invitation = null } = {}) {
      const provider = providerFor(providerId);
      if (invitation && (invitation.organizationId !== provider.organizationId || !invitation.invitationId)) throw new AuthError("OIDC invitation is invalid", 403, "invitation-invalid");
      const transaction = transactionStore.create({ providerId: provider.id, organizationId: provider.organizationId, returnTo, ...(invitation ? { invitationId: invitation.invitationId } : {}) });
      const url = new URL(provider.authorizationEndpoint);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", provider.clientId);
      url.searchParams.set("redirect_uri", provider.redirectUri);
      url.searchParams.set("scope", provider.scopes.join(" "));
      url.searchParams.set("state", transaction.state);
      url.searchParams.set("nonce", transaction.nonce);
      url.searchParams.set("code_challenge", codeChallenge(transaction.codeVerifier));
      url.searchParams.set("code_challenge_method", "S256");
      return { redirectUrl: url.toString(), expiresAt: transaction.expiresAt };
    },
    async complete({ providerId, state, code } = {}) {
      const provider = providerFor(providerId);
      const transaction = transactionStore.consume(state);
      if (!transaction || transaction.providerId !== provider.id || transaction.organizationId !== provider.organizationId) {
        throw new AuthError("OIDC login transaction is invalid or expired", 401, "oidc-transaction-invalid");
      }
      const tokenResponse = await exchangeAuthorizationCode({
        provider: structuredClone(provider),
        code: requireCallbackCode(code),
        codeVerifier: transaction.codeVerifier
      });
      const claims = await verifyIdToken({ provider: structuredClone(provider), idToken: tokenResponse?.idToken, nonce: transaction.nonce });
      const issuer = String(claims?.issuer || "");
      const subject = String(claims?.subject || "");
      const audiences = Array.isArray(claims?.audience) ? claims.audience : [claims?.audience];
      if (issuer !== provider.issuer || !subject || !audiences.includes(provider.clientId) || claims?.nonce !== transaction.nonce) {
        throw new AuthError("OIDC identity token is invalid", 401, "oidc-token-invalid");
      }
      let identity = await externalIdentityRepository.get({ providerId: provider.id, issuer, subject });
      if ((!identity || identity.status === "unbound") && transaction.invitationId) {
        if (typeof prepareInvitationAcceptance !== "function" || typeof acceptInvitation !== "function" || typeof externalIdentityRepository.bind !== "function") throw new AuthError("OIDC invitation is unavailable", 503, "invitation-unavailable");
        const prepared = await prepareInvitationAcceptance({ organizationId: provider.organizationId, invitationId: transaction.invitationId, providerId: provider.id, issuer, subject });
        await externalIdentityRepository.bind({ providerId: provider.id, issuer, subject, organizationId: prepared.organizationId, actorId: prepared.actorId });
        await acceptInvitation({ organizationId: provider.organizationId, invitationId: transaction.invitationId, providerId: provider.id, issuer, subject });
        identity = await externalIdentityRepository.get({ providerId: provider.id, issuer, subject });
      }
      if (!identity || identity.status === "unbound" || identity.organizationId !== provider.organizationId) {
        throw new AuthError("OIDC identity is not enrolled", 403, "oidc-identity-unmapped");
      }
      const actor = await resolveActor(identity.actorId, identity.organizationId);
      if (!actor || actor.id !== identity.actorId || actor.organizationId !== identity.organizationId) throw new AuthError("OIDC member is unavailable", 403, "oidc-member-unavailable");
      return { actor: structuredClone(actor), returnTo: transaction.returnTo };
    },
    async probe() {
      await transactionStore.probe?.();
      await externalIdentityRepository.probe?.();
      return true;
    }
  });
}
