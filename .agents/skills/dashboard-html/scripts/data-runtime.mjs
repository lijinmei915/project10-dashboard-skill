import { assertWorkspace, cloneValue } from "./workspace-core.mjs";

function filtersForComponent(workspace, component, sectionId) {
  const definitions = [];
  for (const control of workspace.document?.controls ?? []) {
    if (control.type !== "filter-bar" || !control.props.targets.some((target) => target === component.id || target === sectionId)) continue;
    definitions.push(...control.props.controls);
  }
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
  const binding = component.binding;
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
