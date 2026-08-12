import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLayoutSpan } from "../studio/workspace-layout-controller.mjs";

test("normalizes summary spans against the controlled grid", () => {
  const allowed = [3, 4, 6, 8, 9, 12];
  assert.equal(normalizeLayoutSpan("6", allowed), 6);
  assert.equal(normalizeLayoutSpan(5, allowed), 12);
  assert.equal(normalizeLayoutSpan(undefined, allowed), 12);
});

test("normalizes section spans with an explicit fallback", () => {
  const allowed = [4, 6, 8, 12];
  assert.equal(normalizeLayoutSpan(8, allowed), 8);
  assert.equal(normalizeLayoutSpan(3, allowed, 6), 6);
});
