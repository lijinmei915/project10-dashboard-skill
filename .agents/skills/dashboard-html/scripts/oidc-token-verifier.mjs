import { createPublicKey, verify } from "node:crypto";
import { AuthError } from "./studio-auth-service.mjs";

function decodeSegment(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new AuthError("OIDC identity token is invalid", 401, "oidc-token-invalid");
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { throw new AuthError("OIDC identity token is invalid", 401, "oidc-token-invalid"); }
}

function audience(value) {
  return Array.isArray(value) ? value.map(String) : [String(value || "")];
}

function jwksUrl(value, { allowLoopbackHttp = false } = {}) {
  let url;
  try { url = new URL(String(value || "")); } catch { throw new Error("OIDC jwksUri must be an absolute URL"); }
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(allowLoopbackHttp && loopback && url.protocol === "http:")) throw new Error("OIDC jwksUri must use HTTPS");
  if (url.username || url.password || url.hash) throw new Error("OIDC jwksUri must not include credentials or a hash");
  return url.toString();
}

function cacheDuration(response, fallbackMs, maxCacheMs) {
  const match = String(response?.headers?.get?.("cache-control") || "").match(/max-age=(\d+)/i);
  const parsed = match ? Number(match[1]) * 1_000 : fallbackMs;
  return Math.max(1_000, Math.min(maxCacheMs, Number.isFinite(parsed) ? parsed : fallbackMs));
}

export function createOidcRs256TokenVerifier({ fetchImpl = globalThis.fetch, clock = () => Date.now(), cacheTtlMs = 5 * 60 * 1_000, maxCacheMs = 6 * 60 * 60 * 1_000, allowLoopbackHttp = false } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("OIDC verifier requires fetch");
  const cache = new Map();
  const keysFor = async (provider, { refresh = false } = {}) => {
    const url = jwksUrl(provider?.jwksUri, { allowLoopbackHttp });
    const current = cache.get(url);
    if (!refresh && current?.expiresAt > clock()) return current.keys;
    let response;
    try { response = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json" }, redirect: "error" }); } catch { throw new AuthError("OIDC key retrieval failed", 503, "oidc-jwks-unavailable"); }
    if (!response?.ok) throw new AuthError("OIDC key retrieval failed", 503, "oidc-jwks-unavailable");
    let payload;
    try { payload = await response.json(); } catch { throw new AuthError("OIDC key retrieval failed", 503, "oidc-jwks-unavailable"); }
    const keys = Array.isArray(payload?.keys) ? payload.keys.filter((key) => key?.kty === "RSA" && key?.n && key?.e && key?.kid) : [];
    if (!keys.length) throw new AuthError("OIDC key retrieval failed", 503, "oidc-jwks-unavailable");
    cache.set(url, { keys, expiresAt: clock() + cacheDuration(response, cacheTtlMs, maxCacheMs) });
    return keys;
  };
  const findKey = async (provider, kid) => {
    let key = (await keysFor(provider)).find((candidate) => candidate.kid === kid);
    if (!key) key = (await keysFor(provider, { refresh: true })).find((candidate) => candidate.kid === kid);
    if (!key) throw new AuthError("OIDC identity token is invalid", 401, "oidc-token-invalid");
    return key;
  };
  return Object.freeze({
    async verify({ provider, idToken, nonce }) {
      const parts = String(idToken || "").split(".");
      if (parts.length !== 3) throw new AuthError("OIDC identity token is invalid", 401, "oidc-token-invalid");
      const header = decodeSegment(parts[0]);
      const payload = decodeSegment(parts[1]);
      if (header.alg !== "RS256" || !header.kid || header.crit || header.jku || header.x5u) throw new AuthError("OIDC identity token is invalid", 401, "oidc-token-invalid");
      const key = await findKey(provider, header.kid);
      let valid = false;
      try { valid = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: "jwk" }), Buffer.from(parts[2], "base64url")); } catch { valid = false; }
      if (!valid) throw new AuthError("OIDC identity token is invalid", 401, "oidc-token-invalid");
      const now = Math.floor(clock() / 1_000);
      const exp = Number(payload.exp);
      const nbf = payload.nbf == null ? null : Number(payload.nbf);
      const iat = payload.iat == null ? null : Number(payload.iat);
      if (!Number.isFinite(exp) || exp <= now || (nbf != null && (!Number.isFinite(nbf) || nbf > now)) || (iat != null && (!Number.isFinite(iat) || iat > now + 60))) throw new AuthError("OIDC identity token is invalid", 401, "oidc-token-invalid");
      if (payload.iss !== provider?.issuer || !payload.sub || !audience(payload.aud).includes(provider?.clientId) || payload.nonce !== nonce) throw new AuthError("OIDC identity token is invalid", 401, "oidc-token-invalid");
      if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== provider.clientId) throw new AuthError("OIDC identity token is invalid", 401, "oidc-token-invalid");
      return { issuer: payload.iss, subject: String(payload.sub), audience: audience(payload.aud), nonce: payload.nonce };
    },
    clear() { cache.clear(); },
    async probe() { return true; }
  });
}

export function createOidcAuthorizationCodeExchange({ fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("OIDC exchange requires fetch");
  return async ({ provider, code, codeVerifier }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs));
    const body = new URLSearchParams({ grant_type: "authorization_code", code: String(code), redirect_uri: provider.redirectUri, client_id: provider.clientId, code_verifier: String(codeVerifier) });
    const headers = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
    if (provider.clientSecret) headers.Authorization = `Basic ${Buffer.from(`${provider.clientId}:${provider.clientSecret}`).toString("base64")}`;
    try {
      const response = await fetchImpl(provider.tokenEndpoint, { method: "POST", headers, body, redirect: "error", signal: controller.signal });
      if (!response?.ok) throw new AuthError("OIDC code exchange failed", 502, "oidc-code-exchange-failed");
      const payload = await response.json();
      if (typeof payload?.id_token !== "string" || !payload.id_token || payload.id_token.length > 32_768) throw new AuthError("OIDC code exchange failed", 502, "oidc-code-exchange-failed");
      return { idToken: payload.id_token };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError("OIDC code exchange failed", 502, "oidc-code-exchange-failed");
    } finally {
      clearTimeout(timeout);
    }
  };
}
