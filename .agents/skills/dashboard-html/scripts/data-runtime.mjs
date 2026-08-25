import { assertWorkspace, cloneValue } from "./workspace-core.mjs";

function locateComponent(workspace, componentId) {
  for (const section of workspace.document?.sections ?? []) {
    const component = section.components.find(({ id }) => id === componentId);
    if (component) return { component, sectionId: section.id };
  }
  return null;
}

function filtersForComponent(workspace, component, sectionId) {
  const definitions = [];
  for (const control of workspace.document?.controls ?? []) {
    if (control.type !== "filter-bar" || !control.props.targets.some((target) => target === component.id || target === sectionId)) continue;
    definitions.push(...control.props.controls);
  }
  for (const [sourceId, value] of Object.entries(workspace.interactions?.chartSelections ?? {})) {
    const source = locateComponent(workspace, sourceId);
    const scope = source?.component.props?.selection?.targetScope;
    const targetsComponent = scope === "page" || (scope === "section" && source.sectionId === sectionId) || (scope === "component" && sourceId === component.id);
    if (targetsComponent && source.component.dataRef === component.dataRef && source.component.binding?.kind === "series") {
      definitions.push({ id: `chart-selection-${sourceId}`, field: source.component.binding.categoryField, defaultValue: value });
    }
  }
  const drilldown = component.props?.drilldown;
  const path = workspace.interactions?.drilldowns?.[component.id]?.path ?? [];
  if (drilldown?.enabled === true) path.forEach((value, index) => {
    const level = drilldown.levels?.[index];
    if (level) definitions.push({ id: `drilldown-${component.id}-${index}`, field: level.field, defaultValue: value });
  });
  return definitions;
}

function filteredRecords(workspace, component, sectionId) {
  const records = workspace.resources?.datasets?.[component.dataRef]?.records ?? [];
  const filters = workspace.interactions?.filters ?? {};
  return records.filter((record) => filtersForComponent(workspace, component, sectionId).every((filter) => {
    const selected = filters[filter.id] ?? filter.defaultValue;
    return selected === "" || selected === null || selected === undefined || String(record[filter.field]) === String(selected);
  }));
}

function aggregate(records, operation, field) {
  if (operation === "count") return records.length;
  const values = records.map((record) => Number(record[field])).filter(Number.isFinite);
  if (!values.length) return 0;
  const sum = values.reduce((total, value) => total + value, 0);
  if (operation === "average") return sum / values.length;
  if (operation === "min") return Math.min(...values);
  if (operation === "max") return Math.max(...values);
  return sum;
}

function formatNumber(value, format = {}) {
  const formatted = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: format.maximumFractionDigits ?? 0 }).format(value * (format.multiplier ?? 1));
  return `${format.prefix ?? ""}${formatted}${format.suffix ?? ""}`;
}

function groupRecords(records, labelField, valueField, operation) {
  const groups = new Map();
  records.forEach((record) => {
    const label = String(record[labelField] ?? "");
    const group = groups.get(label) ?? [];
    group.push(record);
    groups.set(label, group);
  });
  return [...groups].map(([label, group]) => ({ label, value: aggregate(group, operation, valueField) }));
}

export function materializeComponent(workspace, componentId) {
  assertWorkspace(workspace);
  let component;
  let sectionId;
  for (const section of workspace.document?.sections ?? []) {
    const match = section.components.find(({ id }) => id === componentId);
    if (match) { component = match; sectionId = section.id; break; }
  }
  if (!component?.binding) return component ? cloneValue(component) : null;
  const records = filteredRecords(workspace, component, sectionId);
  const next = cloneValue(component);
  const path = workspace.interactions?.drilldowns?.[component.id]?.path ?? [];
  const currentLevel = component.props?.drilldown?.levels?.[path.length];
  const binding = currentLevel && component.binding.kind === "series" ? { ...component.binding, categoryField: currentLevel.field } : component.binding;
  if (binding.kind === "aggregate") {
    next.props.value = formatNumber(aggregate(records, binding.operation, binding.field), binding.format);
  } else if (binding.kind === "series") {
    const points = groupRecords(records, binding.categoryField, binding.valueField, binding.operation);
    next.props.labels = points.map(({ label }) => label);
    next.props.values = points.map(({ value }) => value);
  } else if (binding.kind === "rows") {
    next.props.columns = binding.columns.map(({ label }) => label);
    next.props.rows = records.slice(0, binding.limit ?? 100).map((record) => binding.columns.map(({ field }) => record[field] ?? ""));
  } else if (binding.kind === "ranking") {
    next.props.items = groupRecords(records, binding.labelField, binding.valueField, binding.operation)
      .sort((left, right) => right.value - left.value)
      .slice(0, binding.limit ?? 10);
  }
  if (component.trendBinding?.kind === "series") {
    const trend = component.trendBinding;
    const points = groupRecords(records, trend.categoryField, trend.valueField, trend.operation).slice(-(trend.limit ?? 30));
    if (points.length >= 2) next.props.sparkline = {
      labels: points.map(({ label }) => label),
      values: points.map(({ value }) => value),
      ...(component.props?.sparkline?.unit ? { unit: component.props.sparkline.unit } : {})
    };
    else delete next.props.sparkline;
  }
  next.props.empty = records.length === 0;
  return next;
}

export function materializeWorkspaceDocument(workspace) {
  assertWorkspace(workspace);
  const document = cloneValue(workspace.document);
  document.sections.forEach((section) => {
    section.components = section.components.map((component) => materializeComponent(workspace, component.id));
  });
  return document;
}
