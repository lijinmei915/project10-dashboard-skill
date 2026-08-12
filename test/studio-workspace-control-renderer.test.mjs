import assert from "node:assert/strict";
import test from "node:test";
import { resolveActiveView, resolveFilterValue } from "../studio/workspace-control-renderer.mjs";

test("resolves persisted filter values without losing falsey options", () => {
  const filter = { id: "region", defaultValue: "all" };
  assert.equal(resolveFilterValue(filter, { region: "east" }), "east");
  assert.equal(resolveFilterValue(filter, { region: 0 }), 0);
  assert.equal(resolveFilterValue(filter, {}), "all");
});

test("resolves active view through persisted, default, then first fallback", () => {
  const control = { props: { defaultValue: "overview", items: [{ id: "overview", sectionIds: ["a"] }, { id: "detail", sectionIds: ["b"] }] } };
  assert.equal(resolveActiveView(control, "detail").id, "detail");
  assert.equal(resolveActiveView(control, "missing").id, "overview");
  control.props.defaultValue = "missing";
  assert.equal(resolveActiveView(control, null).id, "overview");
});
