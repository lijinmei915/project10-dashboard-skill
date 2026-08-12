import test from "node:test";
import assert from "node:assert/strict";
import { diffWorkspaces, migrateWorkspace, validateWorkspace } from "../studio/workspace-core-client.mjs";

test("Studio workspace core client exposes the portable validation and diff contracts", () => {
  assert.equal(typeof migrateWorkspace, "function");
  assert.equal(typeof validateWorkspace, "function");
  assert.equal(typeof diffWorkspaces, "function");
});
