function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new TypeError(`${name} must be a positive integer`);
  return number;
}

export function createPublicationRateLimiter({ limit = 120, windowMs = 60_000, now = () => Date.now() } = {}) {
  const maxRequests = positiveInteger(limit, "limit");
  const duration = positiveInteger(windowMs, "windowMs");
  const buckets = new Map();

  function consume({ publicationId, clientKey }) {
    const key = `${String(publicationId || "")}:${String(clientKey || "unknown")}`;
    const currentTime = now();
    const previous = buckets.get(key);
    const bucket = !previous || currentTime >= previous.startedAt + duration
      ? { startedAt: currentTime, count: 0, limitLogged: false }
      : previous;
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count <= maxRequests) return { allowed: true };
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.startedAt + duration - currentTime) / 1000));
    const shouldLog = !bucket.limitLogged;
    bucket.limitLogged = true;
    return { allowed: false, retryAfterSeconds, shouldLog };
  }

  return Object.freeze({ consume });
}
