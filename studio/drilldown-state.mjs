function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function scalar(value) {
  return ["string", "number", "boolean"].includes(typeof value);
}

export function drilldownDescriptor(document, componentId) {
  for (const section of document?.sections || []) {
    const component = (section.components || []).find(({ id }) => id === componentId);
    if (!component) continue;
    const config = component?.props?.drilldown;
    const levels = Array.isArray(config?.levels) ? config.levels : [];
    if (component.type !== "chart" || config?.enabled !== true || !/^[a-z][a-z0-9-]*$/.test(config.hierarchyId || "")) return null;
    if (component.binding?.kind !== "series" || levels.length < 2 || levels.length > 8) return null;
    if (new Set(levels.map(({ field }) => field)).size !== levels.length || levels.some(({ field }) => !field)) return null;
    if (component.binding.categoryField !== levels[0].field) return null;
    return { componentId, sectionId: section.id, datasetId: component.dataRef, hierarchyId: config.hierarchyId, levels: clone(levels), targetScope: ["section", "page"].includes(config.targetScope) ? config.targetScope : "component" };
  }
  return null;
}

export function drilldownContext(document, interactions = {}, componentId) {
  const descriptor = drilldownDescriptor(document, componentId);
  if (!descriptor) return null;
  const saved = interactions?.drilldowns?.[componentId];
  const path = Array.isArray(saved?.path) ? saved.path.filter(scalar).slice(0, descriptor.levels.length - 1) : [];
  return { ...descriptor, path, level: path.length, current: descriptor.levels[path.length], terminal: path.length === descriptor.levels.length - 1 };
}

export function applyDrilldown(document, interactions = {}, command = {}) {
  const context = drilldownContext(document, interactions, command.componentId);
  if (!context) return { status: "ignored", interactions: clone(interactions) };
  const next = clone(interactions) || {};
  const drilldowns = { ...(next.drilldowns || {}) };
  if (command.type === "back") {
    const depth = Math.max(0, Math.min(context.path.length, Number.isInteger(command.depth) ? command.depth : context.path.length - 1));
    if (depth) drilldowns[command.componentId] = { path: context.path.slice(0, depth) };
    else delete drilldowns[command.componentId];
    if (Object.keys(drilldowns).length) next.drilldowns = drilldowns; else delete next.drilldowns;
    return { status: "back", interactions: next, context: drilldownContext(document, next, command.componentId) };
  }
  if (context.terminal || !scalar(command.value)) return { status: "ignored", interactions: next, context };
  drilldowns[command.componentId] = { path: [...context.path, command.value] };
  next.drilldowns = drilldowns;
  return { status: "advanced", interactions: next, context: drilldownContext(document, next, command.componentId) };
}
