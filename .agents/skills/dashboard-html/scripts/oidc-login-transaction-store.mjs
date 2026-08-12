import { createHash, randomBytes } from "node:crypto";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function returnPath(value) {
  const path = String(value || "/studio/projects");
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new Error("OIDC return path must be an application-relative path");
  return path;
}

function requiredId(value, name) {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new Error(`${name} must be a safe identifier`);
  return id;
}

export function createOidcLoginTransactionStore({ clock = () => Date.now(), ttlMs = 10 * 60 * 1000, random = (length) => randomBytes(length).toString("base64url") } = {}) {
  const transactions = new Map();
  const expiry = () => Math.max(60_000, ttlMs);
  const prune = (now = clock()) => {
    let removed = 0;
    for (const [stateHash, transaction] of transactions) {
      if (transaction.expiresAt > now) continue;
      transactions.delete(stateHash);
      removed += 1;
    }
    return removed;
  };
  return Object.freeze({
    provider: "memory",
    capabilities: Object.freeze({ durable: false, shared: false, multiInstance: false }),
    create({ providerId, organizationId, returnTo, invitationId = null, codeVerifier = random(48), nonce = random(24), state = random(32) } = {}) {
      prune();
      const stateHash = hash(state);
      const transaction = {
        providerId: requiredId(providerId, "OIDC provider id"),
        organizationId: requiredId(organizationId, "OIDC organization id"),
        returnTo: returnPath(returnTo),
        codeVerifier: String(codeVerifier),
        nonce: String(nonce),
        ...(invitationId ? { invitationId: requiredId(invitationId, "OIDC invitation id") } : {}),
        expiresAt: clock() + expiry()
      };
      if (!transaction.codeVerifier || !transaction.nonce) throw new Error("OIDC transaction requires verifier and nonce");
      transactions.set(stateHash, transaction);
      return { state, nonce: transaction.nonce, codeVerifier: transaction.codeVerifier, expiresAt: new Date(transaction.expiresAt).toISOString() };
    },
    consume(state) {
      prune();
      const stateHash = hash(String(state || ""));
      const transaction = transactions.get(stateHash);
      if (!transaction) return null;
      transactions.delete(stateHash);
      if (transaction.expiresAt <= clock()) return null;
      return clone(transaction);
    },
    prune,
    async probe() {
      prune();
      return true;
    }
  });
}
