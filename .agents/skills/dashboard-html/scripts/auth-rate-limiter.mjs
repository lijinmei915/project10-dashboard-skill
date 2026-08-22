import { createHash } from "node:crypto";

function opaque(value) { return createHash("sha256").update(String(value || "").trim().toLowerCase()).digest("hex").slice(0, 24); }

export function createAuthRateLimiter({ limit = 8, windowMs = 15 * 60 * 1000, clock = () => Date.now() } = {}) {
  const attempts = new Map(); const keyFor = (source, account) => `${opaque(source)}:${opaque(account)}`;
  return Object.freeze({
    consume(source, account) {
      const now = clock(); const key = keyFor(source, account); const current = attempts.get(key); const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
      entry.count += 1; attempts.set(key, entry);
      return entry.count <= limit ? { allowed: true, remaining: limit - entry.count } : { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
    },
    reset(source, account) { attempts.delete(keyFor(source, account)); },
    prune() { const now = clock(); for (const [key, entry] of attempts) if (entry.resetAt <= now) attempts.delete(key); }
  });
}
