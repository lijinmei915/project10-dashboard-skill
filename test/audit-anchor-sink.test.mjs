import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguredAuditAnchorSink, createHttpAuditAnchorSink } from "../.agents/skills/dashboard-html/scripts/audit-anchor-sink.mjs";

const anchor = { schemaVersion: 1, anchorId: `anchor-${"a".repeat(64)}`, organizationId: "acme", headSequence: 3, headHash: "b".repeat(64), anchoredThrough: "2026-08-11T17:00:00.000Z", chainAlgorithm: "sha256-v1" };

test("HTTPS audit anchor sink sends only the canonical payload and stores an opaque receipt", async () => {
  let request;
  const sink = createHttpAuditAnchorSink({ url: "https://audit.example.test/anchors", bearerToken: "secret", fetchImpl: async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({ receiptReference: "receipt-42" }), { status: 201, headers: { "Content-Type": "application/json" } });
  } });
  assert.deepEqual(await sink.append(anchor), { receiptReference: "receipt-42" });
  assert.equal(request.url, "https://audit.example.test/anchors");
  assert.equal(request.options.headers.Authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(request.options.body), anchor);
  assert.throws(() => createHttpAuditAnchorSink({ url: "http://audit.example.test/anchors" }), /HTTPS/);
  assert.equal(createConfiguredAuditAnchorSink({ environment: {} }), null);
});
