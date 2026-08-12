import assert from "node:assert/strict";
import test from "node:test";
import { createPublicationRateLimiter } from "../.agents/skills/dashboard-html/scripts/publication-rate-limiter.mjs";

test("publication rate limiter isolates publications, resets windows, and logs a block once", () => {
  let now = 0;
  const limiter = createPublicationRateLimiter({ limit: 2, windowMs: 1_000, now: () => now });
  assert.equal(limiter.consume({ publicationId: "one", clientKey: "client" }).allowed, true);
  assert.equal(limiter.consume({ publicationId: "one", clientKey: "client" }).allowed, true);
  const firstBlock = limiter.consume({ publicationId: "one", clientKey: "client" });
  assert.deepEqual(firstBlock, { allowed: false, retryAfterSeconds: 1, shouldLog: true });
  assert.equal(limiter.consume({ publicationId: "one", clientKey: "client" }).shouldLog, false);
  assert.equal(limiter.consume({ publicationId: "two", clientKey: "client" }).allowed, true);
  now = 1_000;
  assert.equal(limiter.consume({ publicationId: "one", clientKey: "client" }).allowed, true);
});
