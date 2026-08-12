import assert from "node:assert/strict";
import test from "node:test";
import { layoutDropSide, nearestLayoutSpan, reorderCanvasIds, shouldInsertBefore, shouldStartPointerDrag } from "../studio/workspace-layout-interaction.mjs";

test("snaps arbitrary widths to controlled 12-column spans", () => {
  assert.equal(nearestLayoutSpan(2.8), 3);
  assert.equal(nearestLayoutSpan(3.5), 4);
  assert.equal(nearestLayoutSpan(5.2), 6);
  assert.equal(nearestLayoutSpan(10.7), 12);
});

test("starts pointer drag only after the five pixel threshold", () => {
  assert.equal(shouldStartPointerDrag({ x: 10, y: 10 }, { x: 13, y: 14 }), true);
  assert.equal(shouldStartPointerDrag({ x: 10, y: 10 }, { x: 12, y: 12 }), false);
});

test("resolves horizontal and vertical drop feedback", () => {
  const rect = { left: 100, top: 100, width: 200, height: 100 };
  assert.equal(layoutDropSide(rect, { x: 120, y: 150 }), "left");
  assert.equal(layoutDropSide(rect, { x: 280, y: 150 }), "right");
  assert.equal(layoutDropSide(rect, { x: 200, y: 105 }), "top");
  assert.equal(layoutDropSide(rect, { x: 200, y: 195 }), "bottom");
  assert.equal(shouldInsertBefore(rect, { x: 120, y: 150 }), true);
  assert.equal(shouldInsertBefore(rect, { x: 120, y: 150 }, { verticalOnly: true }), false);
});

test("reorders canvas ids only after crossing the target dead zone", () => {
  const ids = ["a", "b", "c"];
  const targetRect = { left: 200, top: 0, width: 100, height: 100 };
  assert.deepEqual(reorderCanvasIds({ ids, sourceId: "a", targetId: "b", sourceRect: { left: 270, top: 0, width: 100, height: 100 }, targetRect }), ["b", "a", "c"]);
  assert.strictEqual(reorderCanvasIds({ ids, sourceId: "a", targetId: "b", sourceRect: { left: 180, top: 0, width: 100, height: 100 }, targetRect }), ids);
  assert.deepEqual(ids, ["a", "b", "c"]);
});
