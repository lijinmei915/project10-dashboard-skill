import { migrateWorkspace, validateWorkspace } from "./workspace-core-client.mjs";

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function composeWorkspaceSnapshot({ theme, layout, logo = null, document = null, interactions = null, resources = null }) {
  return {
    version: 2,
    ...(document ? { document: clone(document) } : {}),
    ...(interactions ? { interactions: clone(interactions) } : {}),
    ...(resources ? { resources: clone(resources) } : {}),
    theme: clone(theme),
    layout: clone(layout),
    logo: clone(logo)
  };
}

export function normalizeWorkspaceSnapshot(input) {
  try {
    const workspace = migrateWorkspace(input);
    const validation = validateWorkspace(workspace);
    if (!validation.valid) return { ok: false, code: "WORKSPACE_INVALID", issues: validation.issues };
    return { ok: true, value: workspace };
  } catch (error) {
    return { ok: false, code: "WORKSPACE_INVALID", issues: error.issues || [], error };
  }
}

export function workspaceSlices(workspace) {
  return {
    document: clone(workspace.document) || null,
    interactions: clone(workspace.interactions) || null,
    resources: clone(workspace.resources) || null
  };
}
