import assert from "node:assert/strict";
import test from "node:test";
import { composeWorkspaceSnapshot, normalizeWorkspaceSnapshot, workspaceSlices } from "../studio/workspace-state-core.mjs";

const base = {
  theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#ff7a2f", mode: "light" },
  layout: { sections: [] },
  logo: null
};

test("composes an isolated workspace v2 snapshot", () => {
  const source = { ...base, document: { title: "经营看板", sections: [] }, interactions: { filters: { region: "east" } } };
  const snapshot = composeWorkspaceSnapshot(source);
  source.document.title = "changed";
  source.interactions.filters.region = "south";
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.document.title, "经营看板");
  assert.equal(snapshot.interactions.filters.region, "east");
  assert.equal("resources" in snapshot, false);
});

test("normalizes legacy workspaces through the shared core", () => {
  const result = normalizeWorkspaceSnapshot({ version: 1, ...base });
  assert.equal(result.ok, true);
  assert.equal(result.value.version, 2);
  assert.equal(result.value.theme.headerAlign, "left");
  assert.equal(result.value.theme.paletteVersion, "1.0.0");
});

test("returns structured issues without exposing a partial workspace", () => {
  const result = normalizeWorkspaceSnapshot({ version: 2, theme: {}, layout: { sections: "invalid" } });
  assert.equal(result.ok, false);
  assert.equal(result.value, undefined);
  assert(result.issues.some(({ path }) => path === "/layout/sections"));
});

test("restored workspace slices are isolated from the validated snapshot", () => {
  const workspace = { ...base, document: { title: "A", sections: [] }, interactions: { filters: {} }, resources: { datasets: {} } };
  const slices = workspaceSlices(workspace);
  slices.document.title = "B";
  assert.equal(workspace.document.title, "A");
});
