function isLoopback(hostname) {
  return ["127.0.0.1", "localhost", "::1"].includes(hostname);
}

export function normalizePublicOrigin(value, { allowEmpty = true } = {}) {
  const raw = String(value || "").trim();
  if (!raw && allowEmpty) return null;
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error("DASHBOARD_PUBLIC_ORIGIN must be an absolute origin URL"); }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback(parsed.hostname))) {
    throw new Error("DASHBOARD_PUBLIC_ORIGIN must use HTTPS outside loopback development");
  }
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("DASHBOARD_PUBLIC_ORIGIN must contain only scheme, host, and optional port");
  }
  return parsed.origin;
}

export function expectedOidcRedirectUri(publicOrigin, providerId) {
  return `${publicOrigin}/api/auth/oidc/${encodeURIComponent(providerId)}/callback`;
}
