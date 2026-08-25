function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function scalar(value) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function componentEntries(document) {
  return (document?.sections || []).flatMap((section) => (section.components || []).map((component) => ({ component, sectionId: section.id })));
}

export function chartSelectionDescriptor(document, componentId) {
  const entry = componentEntries(document).find(({ component }) => component.id === componentId);
  const selection = entry?.component?.props?.selection;
  const binding = entry?.component?.binding;
  if (!entry || entry.component.type !== "chart" || selection?.enabled !== true) return null;
  const field = binding?.kind === "series" ? binding.categoryField : binding?.kind === "ranking" ? binding.labelField : null;
  if (!field || !entry.component.dataRef) return null;
  return {
    componentId,
    sectionId: entry.sectionId,
    datasetId: entry.component.dataRef,
    field,
    targetScope: ["component", "page"].includes(selection.targetScope) ? selection.targetScope : "section"
  };
}

export function selectionTargetIds(document, descriptor) {
  if (!descriptor) return [];
  return componentEntries(document).filter(({ component, sectionId }) => {
    if (!component.binding || component.dataRef !== descriptor.datasetId) return false;
    if (descriptor.targetScope === "component") return component.id === descriptor.componentId;
    if (descriptor.targetScope === "section") return sectionId === descriptor.sectionId;
    return true;
  }).map(({ component }) => component.id);
}

export function applyChartSelection(document, interactions = {}, command = {}) {
  const descriptor = chartSelectionDescriptor(document, command.componentId);
  if (!descriptor || !scalar(command.value)) return { status: "ignored", interactions: clone(interactions), affectedIds: [] };
  const next = clone(interactions) || {};
  const selections = { ...(next.chartSelections || {}) };
  const current = selections[command.componentId];
  const clearing = command.value === null || current === command.value;
  if (clearing) delete selections[command.componentId];
  else selections[command.componentId] = command.value;
  if (Object.keys(selections).length) next.chartSelections = selections;
  else delete next.chartSelections;
  return {
    status: clearing ? "cleared" : "applied",
    interactions: next,
    affectedIds: selectionTargetIds(document, descriptor),
    selection: clearing ? null : { ...descriptor, value: command.value }
  };
}

export function chartSelectionFilters(document, interactions = {}, targetComponentId) {
  const filters = [];
  const values = {};
  for (const [sourceId, value] of Object.entries(interactions.chartSelections || {})) {
    if (!scalar(value) || value === null) continue;
    const descriptor = chartSelectionDescriptor(document, sourceId);
    if (!selectionTargetIds(document, descriptor).includes(targetComponentId)) continue;
    const id = `chart-selection-${sourceId}`;
    filters.push({ id, field: descriptor.field, defaultValue: value });
    values[id] = value;
  }
  return { filters, values };
}
