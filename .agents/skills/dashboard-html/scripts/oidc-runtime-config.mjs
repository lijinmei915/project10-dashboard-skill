import { createOidcLoginTransactionStore } from "./oidc-login-transaction-store.mjs";
import { createOidcProviderService } from "./oidc-provider-service.mjs";
import { createOidcAuthorizationCodeExchange, createOidcRs256TokenVerifier } from "./oidc-token-verifier.mjs";
import { expectedOidcRedirectUri, normalizePublicOrigin } from "./studio-deployment-config.mjs";

function objectEnvironment(environment, name) {
  const raw = environment?.[name];
  if (!raw) return {};
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error(`${name} must be valid JSON`); }
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error(`${name} must be an object`);
  return value;
}

export function createConfiguredOidcProviderService({ environment = process.env, authService, externalIdentityRepository, organizationService = null, fetchImpl = globalThis.fetch, clock = () => Date.now() } = {}) {
  if (environment.DASHBOARD_AUTH_MODE !== "oidc") return null;
  if (!authService || typeof authService.actor !== "function") throw new Error("OIDC runtime configuration requires Auth Service actor resolution");
  if (!externalIdentityRepository) throw new Error("OIDC runtime configuration requires External Identity Repository");
  const configuredProviders = objectEnvironment(environment, "DASHBOARD_OIDC_PROVIDERS_JSON");
  const clientSecrets = objectEnvironment(environment, "DASHBOARD_OIDC_CLIENT_SECRETS_JSON");
  const providers = Object.entries(configuredProviders).map(([id, config]) => ({ id, ...config, ...(clientSecrets[id] ? { clientSecret: String(clientSecrets[id]) } : {}) }));
  if (!providers.length) throw new Error("OIDC authentication requires DASHBOARD_OIDC_PROVIDERS_JSON");
  const publicOrigin = normalizePublicOrigin(environment.DASHBOARD_PUBLIC_ORIGIN);
  if (publicOrigin) {
    for (const provider of providers) {
      const expected = expectedOidcRedirectUri(publicOrigin, provider.id);
      if (provider.redirectUri !== expected) throw new Error(`OIDC provider ${provider.id} redirectUri must equal ${expected}`);
    }
  }
  for (const provider of providers) if (!provider.jwksUri) throw new Error(`OIDC provider ${provider.id} requires jwksUri`);
  const verifier = createOidcRs256TokenVerifier({ fetchImpl, clock });
  return createOidcProviderService({
    providers,
    transactionStore: createOidcLoginTransactionStore({ clock }),
    externalIdentityRepository,
    exchangeAuthorizationCode: createOidcAuthorizationCodeExchange({ fetchImpl, timeoutMs: Number(environment.DASHBOARD_OIDC_TIMEOUT_MS) || 15_000 }),
    verifyIdToken: verifier.verify.bind(verifier),
    resolveActor: (actorId, organizationId) => authService.actor(actorId, organizationId),
    prepareInvitationAcceptance: organizationService?.prepareInvitationAcceptance?.bind(organizationService),
    acceptInvitation: organizationService?.acceptInvitation?.bind(organizationService)
  });
}
