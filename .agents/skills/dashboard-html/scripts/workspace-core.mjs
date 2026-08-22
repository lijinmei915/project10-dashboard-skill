const WORKSPACE_VERSION = 2;
const GENERATION_VERSION = 1;
const PALETTE_VERSIONS = new Set(["1.0.0", "1.2.0"]);
const PAGE_TYPES = new Set(["dashboard", "report"]);
const LANGUAGES = new Set(["zh", "en"]);
const MODES = new Set(["light", "dark"]);
export const CHART_TYPES = new Set(["line", "time-series", "area", "bar", "grouped-bar", "stacked-bar", "percent-stacked-bar", "histogram", "horizontal-bar", "grouped-horizontal-bar", "stacked-horizontal-bar", "percent-stacked-horizontal-bar", "diverging-bar", "ranking-bar", "gantt", "sector-pie", "pie", "rose", "radar", "funnel", "data-table"]);
const COMMANDS = new Set(["set", "unset", "insert", "remove", "move", "replace"]);
export const COMPONENT_RULES = Object.freeze({
  summary: ["body"],
  kpi: ["value"],
  chart: [],
  table: ["columns", "rows"],
  list: ["items"],
  text: ["body"]
});

export class ContractError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "ContractError";
    this.issues = issues;
  }
}

export function cloneValue(value) {
  return structuredClone(value);
}

function issue(issues, path, code, message) {
  issues.push({ path, code, message });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function valuesEqual(left, right) {
  return typeof left === typeof right && left === right;
}

function validatePageControls(document, sectionIds, componentIds, issues) {
  if (document.controls === undefined) return;
  if (!Array.isArray(document.controls)) return issue(issues, "/document/controls", "type", "Document controls must be an array");
  const controlIds = new Set();
  const filterIds = new Set();
  let tabIds = null;
  document.controls.forEach((control, controlIndex) => {
    const base = `/document/controls/${controlIndex}`;
    if (!isObject(control) || typeof control.id !== "string" || !control.id || !["filter-bar", "view-tabs"].includes(control.type) || !isObject(control.props)) {
      return issue(issues, base, "shape", "Page control requires id, registered type, and props");
    }
    if (controlIds.has(control.id)) issue(issues, `${base}/id`, "unique", "Page control ids must be unique");
    controlIds.add(control.id);
    if (control.type === "filter-bar") {
      const controls = control.props.controls;
      if (!Array.isArray(controls) || !controls.length) issue(issues, `${base}/props/controls`, "required", "Filter bar requires controls");
      else controls.forEach((filter, filterIndex) => {
        const filterBase = `${base}/props/controls/${filterIndex}`;
        if (!isObject(filter) || !filter.id || !filter.field || filter.control !== "select" || !Array.isArray(filter.options) || !filter.options.length) {
          return issue(issues, filterBase, "shape", "Filter requires id, field, select control, options, and defaultValue");
        }
        if (filterIds.has(filter.id)) issue(issues, `${filterBase}/id`, "unique", "Filter ids must be unique across the document");
        filterIds.add(filter.id);
        if (!/^[a-z][a-z0-9-]*$/.test(filter.field)) issue(issues, `${filterBase}/field`, "pattern", "Filter field must be a safe identifier");
        const optionValues = filter.options.map((option) => option?.value);
        if (new Set(optionValues.map((value) => `${typeof value}:${String(value)}`)).size !== optionValues.length) issue(issues, `${filterBase}/options`, "unique", "Filter option values must be unique");
        if (!optionValues.some((value) => valuesEqual(value, filter.defaultValue))) issue(issues, `${filterBase}/defaultValue`, "reference", "Filter defaultValue must match an option value");
      });
      if (!Array.isArray(control.props.targets) || !control.props.targets.length) issue(issues, `${base}/props/targets`, "required", "Filter bar requires targets");
      else for (const target of control.props.targets) {
        if (!sectionIds.has(target) && !componentIds.has(target)) issue(issues, `${base}/props/targets`, "reference", `Filter target ${target} does not exist`);
      }
      if (control.props.placement !== undefined) {
        const placement = control.props.placement;
        if (!isObject(placement) || placement.kind !== "component-header" || typeof placement.targetId !== "string") issue(issues, `${base}/props/placement`, "shape", "Filter placement requires component-header and targetId");
        else if (!componentIds.has(placement.targetId)) issue(issues, `${base}/props/placement/targetId`, "reference", "Filter placement target must be an existing component");
        else if (!control.props.targets.includes(placement.targetId)) issue(issues, `${base}/props/placement/targetId`, "reference", "Filter placement target must also be a filter target");
      }
    } else {
      const items = control.props.items;
      if (!Array.isArray(items) || items.length < 2) issue(issues, `${base}/props/items`, "required", "View tabs require at least two items");
      else {
        tabIds = new Set();
        items.forEach((item, itemIndex) => {
          const itemBase = `${base}/props/items/${itemIndex}`;
          if (!isObject(item) || !item.id || !item.label || !Array.isArray(item.sectionIds) || !item.sectionIds.length) return issue(issues, itemBase, "shape", "Tab requires id, label, and sectionIds");
          if (tabIds.has(item.id)) issue(issues, `${itemBase}/id`, "unique", "View tab ids must be unique");
          tabIds.add(item.id);
          for (const sectionId of item.sectionIds) if (!sectionIds.has(sectionId)) issue(issues, `${itemBase}/sectionIds`, "reference", `View tab section ${sectionId} does not exist`);
        });
        if (!tabIds.has(control.props.defaultValue)) issue(issues, `${base}/props/defaultValue`, "reference", "View tabs defaultValue must match a tab id");
      }
    }
  });
}

function validateWorkspaceShape(workspace) {
  const issues = [];
  if (!isObject(workspace)) {
    issue(issues, "/", "type", "Workspace must be an object");
    return issues;
  }
  if (workspace.version !== WORKSPACE_VERSION) issue(issues, "/version", "const", `Workspace version must be ${WORKSPACE_VERSION}`);

  const document = workspace.document;
  const documentSectionIds = new Set();
  const documentComponentIds = new Set();
  const documentComponents = [];
  if (document !== undefined) {
    if (!isObject(document)) issue(issues, "/document", "type", "Document must be an object");
    else {
      if (typeof document.title !== "string" || !document.title.trim()) issue(issues, "/document/title", "required", "Document title is required");
      if (!Array.isArray(document.sections) || !document.sections.length) issue(issues, "/document/sections", "required", "Document requires sections");
      else document.sections.forEach((section, sectionIndex) => {
        const base = `/document/sections/${sectionIndex}`;
        if (!isObject(section) || !section.id || !section.title || !Array.isArray(section.components) || !section.components.length) {
          issue(issues, base, "shape", "Document section requires id, title, and components");
          return;
        }
        if (documentSectionIds.has(section.id)) issue(issues, `${base}/id`, "unique", "Document section ids must be unique");
        documentSectionIds.add(section.id);
        section.components.forEach((component, componentIndex) => {
          const componentBase = `${base}/components/${componentIndex}`;
          if (!isObject(component) || !component.id || !Object.hasOwn(COMPONENT_RULES, component.type) || !component.title || !isObject(component.props)) {
            issue(issues, componentBase, "shape", "Component requires id, registered type, title, and props");
            return;
          }
          documentComponents.push({ component, sectionId: section.id, path: componentBase });
          for (const requiredProp of COMPONENT_RULES[component.type]) {
            if (component.props[requiredProp] === undefined) issue(issues, `${componentBase}/props/${requiredProp}`, "required", `${component.type} requires ${requiredProp}`);
          }
          if (component.type === "chart" && component.props.chartType !== undefined && !CHART_TYPES.has(component.props.chartType)) {
            issue(issues, `${componentBase}/props/chartType`, "enum", `Unsupported chart type: ${component.props.chartType}`);
          }
          if (documentComponentIds.has(component.id)) issue(issues, `${componentBase}/id`, "unique", "Document component ids must be unique");
          documentComponentIds.add(component.id);
        });
      });
      validatePageControls(document, documentSectionIds, documentComponentIds, issues);
    }
  }

  const theme = workspace.theme;
  if (!isObject(theme)) issue(issues, "/theme", "required", "Theme is required");
  else {
    if (typeof theme.preset !== "string" || !theme.preset) issue(issues, "/theme/preset", "type", "Preset must be a non-empty string");
    if (!PAGE_TYPES.has(theme.pageType)) issue(issues, "/theme/pageType", "enum", "Page type must be dashboard or report");
    if (!LANGUAGES.has(theme.language)) issue(issues, "/theme/language", "enum", "Language must be zh or en");
    if (typeof theme.accent !== "string" || !/^#[0-9a-f]{6}$/i.test(theme.accent)) issue(issues, "/theme/accent", "pattern", "Accent must be a 6-digit hex color");
    if (!MODES.has(theme.mode)) issue(issues, "/theme/mode", "enum", "Mode must be light or dark");
    if (theme.paletteVersion !== undefined && !PALETTE_VERSIONS.has(theme.paletteVersion)) issue(issues, "/theme/paletteVersion", "enum", "Palette version is not supported");
    for (const field of ["sectionIcons", "sectionSubtitles", "cardOverrides"]) {
      if (theme[field] !== undefined && !isObject(theme[field])) issue(issues, `/theme/${field}`, "type", `${field} must be an object`);
    }
  }

  const layout = workspace.layout;
  if (!isObject(layout)) issue(issues, "/layout", "required", "Layout is required");
  else if (!Array.isArray(layout.sections)) issue(issues, "/layout/sections", "type", "Layout sections must be an array");
  else {
    const sectionIds = new Set();
    const itemIds = new Set();
    layout.sections.forEach((section, sectionIndex) => {
      const base = `/layout/sections/${sectionIndex}`;
      if (!isObject(section)) return issue(issues, base, "type", "Section must be an object");
      if (typeof section.id !== "string" || !section.id) issue(issues, `${base}/id`, "type", "Section id is required");
      else if (sectionIds.has(section.id)) issue(issues, `${base}/id`, "unique", "Section ids must be unique");
      else sectionIds.add(section.id);
      if (section.layout !== null && typeof section.layout !== "string") issue(issues, `${base}/layout`, "type", "Section layout must be a string or null");
      if (section.span !== undefined && ![4, 6, 8, 12].includes(section.span)) issue(issues, `${base}/span`, "enum", "Section span must use a supported grid width");
      if (!Array.isArray(section.items)) return issue(issues, `${base}/items`, "type", "Section items must be an array");
      section.items.forEach((item, itemIndex) => {
        const itemBase = `${base}/items/${itemIndex}`;
        if (!isObject(item)) return issue(issues, itemBase, "type", "Layout item must be an object");
        if (typeof item.id !== "string" || !item.id) issue(issues, `${itemBase}/id`, "type", "Item id is required");
        else if (itemIds.has(item.id)) issue(issues, `${itemBase}/id`, "unique", "Item ids must be unique across the workspace");
        else itemIds.add(item.id);
        if (!Number.isInteger(item.span) || item.span < 1 || item.span > 12) issue(issues, `${itemBase}/span`, "range", "Item span must be an integer from 1 to 12");
      });
    });
    if (document !== undefined) {
      for (const sectionId of sectionIds) if (!documentSectionIds.has(sectionId)) issue(issues, "/layout/sections", "reference", `Layout section ${sectionId} is missing from document`);
      for (const componentId of itemIds) if (!documentComponentIds.has(componentId)) issue(issues, "/layout/sections", "reference", `Layout item ${componentId} is missing from document`);
      for (const componentId of documentComponentIds) if (!itemIds.has(componentId)) issue(issues, "/document/sections", "reference", `Document component ${componentId} is missing from layout`);
    }
    if (layout.canvasOrder !== undefined) {
      if (!Array.isArray(layout.canvasOrder)) issue(issues, "/layout/canvasOrder", "type", "Canvas order must be an array");
      else if (new Set(layout.canvasOrder).size !== layout.canvasOrder.length) issue(issues, "/layout/canvasOrder", "unique", "Canvas order ids must be unique");
    }
  }

  if (workspace.logo !== undefined && workspace.logo !== null) {
    if (!isObject(workspace.logo) || typeof workspace.logo.src !== "string" || !workspace.logo.src) issue(issues, "/logo", "type", "Logo must be null or contain src");
  }
  if (workspace.resources !== undefined && !isObject(workspace.resources)) issue(issues, "/resources", "type", "Resources must be an object");
  const datasets = isObject(workspace.resources?.datasets) ? workspace.resources.datasets : {};
  for (const [datasetId, dataset] of Object.entries(datasets)) {
    if (!isObject(dataset) || !Array.isArray(dataset.records) || typeof dataset.portable !== "boolean") issue(issues, `/resources/datasets/${datasetId}`, "shape", "Dataset requires records and a portable policy");
    else if (dataset.records.some((record) => !isObject(record))) issue(issues, `/resources/datasets/${datasetId}/records`, "type", "Dataset records must be objects");
  }
  for (const { component, path } of documentComponents) {
    if (component.binding === undefined) continue;
    if (!isObject(component.binding) || !["aggregate", "series", "rows", "ranking"].includes(component.binding.kind)) {
      issue(issues, `${path}/binding`, "shape", "Data binding kind is invalid");
      continue;
    }
    if (!component.dataRef || !datasets[component.dataRef]) {
      issue(issues, `${path}/dataRef`, "reference", "Bound component dataRef must reference a workspace dataset");
      continue;
    }
    const expectedKinds = { kpi: ["aggregate"], chart: ["series"], table: ["rows"], list: ["ranking"] };
    if (!expectedKinds[component.type]?.includes(component.binding.kind)) issue(issues, `${path}/binding/kind`, "compatibility", `${component.type} does not support ${component.binding.kind} binding`);
    const records = datasets[component.dataRef].records ?? [];
    const fields = new Set(records.flatMap((record) => Object.keys(record)));
    const bindingFields = component.binding.kind === "aggregate" ? [component.binding.field]
      : component.binding.kind === "series" ? [component.binding.categoryField, component.binding.valueField]
      : component.binding.kind === "rows" ? (component.binding.columns ?? []).map(({ field }) => field)
      : [component.binding.labelField, component.binding.valueField];
    for (const field of bindingFields.filter(Boolean)) if (!fields.has(field)) issue(issues, `${path}/binding`, "reference", `Binding field ${field} does not exist in dataset ${component.dataRef}`);
  }
  for (const [controlIndex, pageControl] of (document?.controls ?? []).entries()) {
    if (pageControl.type !== "filter-bar") continue;
    for (const [filterIndex, filter] of (pageControl.props?.controls ?? []).entries()) {
      const filterPath = `/document/controls/${controlIndex}/props/controls/${filterIndex}/field`;
      const targets = new Set(pageControl.props.targets ?? []);
      const boundTargets = documentComponents.filter(({ component, sectionId }) => component.binding && (targets.has(component.id) || targets.has(sectionId)));
      for (const { component } of boundTargets) {
        const records = datasets[component.dataRef]?.records ?? [];
        if (records.length && !records.some((record) => Object.hasOwn(record, filter.field))) issue(issues, filterPath, "reference", `Filter field ${filter.field} does not exist in target dataset ${component.dataRef}`);
      }
    }
  }
  if (workspace.interactions !== undefined) {
    if (!isObject(workspace.interactions)) issue(issues, "/interactions", "type", "Interactions must be an object");
    else {
      const filters = workspace.interactions.filters;
      if (filters !== undefined && !isObject(filters)) issue(issues, "/interactions/filters", "type", "Interaction filters must be an object");
      const filterDefinitions = new Map();
      for (const pageControl of document?.controls ?? []) for (const filter of pageControl.type === "filter-bar" ? pageControl.props?.controls ?? [] : []) filterDefinitions.set(filter.id, filter);
      for (const [filterId, value] of Object.entries(filters ?? {})) {
        const filter = filterDefinitions.get(filterId);
        if (!filter) issue(issues, `/interactions/filters/${filterId}`, "reference", "Interaction filter does not exist");
        else if (!filter.options.some((option) => valuesEqual(option.value, value))) issue(issues, `/interactions/filters/${filterId}`, "reference", "Interaction filter value must match an option");
      }
      if (workspace.interactions.activeView !== undefined) {
        const viewIds = new Set((document?.controls ?? []).filter(({ type }) => type === "view-tabs").flatMap(({ props }) => (props?.items ?? []).map(({ id }) => id)));
        if (!viewIds.has(workspace.interactions.activeView)) issue(issues, "/interactions/activeView", "reference", "Active view does not exist");
      }
      const visibility = workspace.interactions.chartSeriesVisibility;
      if (visibility !== undefined && !isObject(visibility)) issue(issues, "/interactions/chartSeriesVisibility", "type", "Chart series visibility must be an object");
      else for (const [componentId, series] of Object.entries(visibility ?? {})) {
        const component = documentComponents.find(({ component }) => component.id === componentId)?.component;
        if (!component || component.type !== "chart") issue(issues, `/interactions/chartSeriesVisibility/${componentId}`, "reference", "Series visibility target must be an existing chart");
        else if (!isObject(series) || Object.values(series).some((value) => typeof value !== "boolean")) issue(issues, `/interactions/chartSeriesVisibility/${componentId}`, "type", "Series visibility values must be boolean");
      }
    }
  }
  return issues;
}

export function validateWorkspace(workspace) {
  const issues = validateWorkspaceShape(workspace);
  return { valid: issues.length === 0, issues };
}

export function assertWorkspace(workspace) {
  const result = validateWorkspace(workspace);
  if (!result.valid) throw new ContractError("Workspace validation failed", result.issues);
  return workspace;
}

export function migrateWorkspace(input) {
  if (!isObject(input)) throw new ContractError("Workspace migration failed", [{ path: "/", code: "type", message: "Workspace must be an object" }]);
  const workspace = cloneValue(input);
  if (workspace.version === 1) {
    workspace.version = WORKSPACE_VERSION;
    workspace.theme ||= {};
    workspace.theme.headerAlign ||= workspace.theme.pageType === "report" ? "center" : "left";
    workspace.theme.paletteVersion ||= "1.0.0";
    workspace.layout ||= { sections: [] };
    workspace.layout.sections ||= [];
  }
  assertWorkspace(workspace);
  return workspace;
}

function decodePointer(pointer) {
  if (pointer === "" || pointer === "/") return [];
  if (typeof pointer !== "string" || !pointer.startsWith("/")) throw new ContractError("Invalid command path", [{ path: "/commands", code: "pointer", message: `Invalid JSON Pointer: ${pointer}` }]);
  return pointer.slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function locate(root, pointer, allowAppend = false) {
  const parts = decodePointer(pointer);
  if (!parts.length) return { root: true };
  let parent = root;
  for (const part of parts.slice(0, -1)) {
    if ((isObject(parent) || Array.isArray(parent)) && Object.prototype.hasOwnProperty.call(parent, part)) parent = parent[part];
    else throw new ContractError("Command path does not exist", [{ path: pointer, code: "missing", message: `Missing path segment: ${part}` }]);
  }
  const key = parts.at(-1);
  if (Array.isArray(parent)) {
    if (allowAppend && key === "-") return { parent, key: parent.length };
    if (!/^\d+$/.test(key) || Number(key) > parent.length) throw new ContractError("Invalid array command path", [{ path: pointer, code: "index", message: "Array index is invalid" }]);
    return { parent, key: Number(key) };
  }
  if (!isObject(parent)) throw new ContractError("Command parent is not a container", [{ path: pointer, code: "type", message: "Command parent must be an object or array" }]);
  return { parent, key };
}

function readAt(root, pointer) {
  const location = locate(root, pointer);
  if (location.root) return root;
  if (!Object.prototype.hasOwnProperty.call(location.parent, location.key)) throw new ContractError("Command source does not exist", [{ path: pointer, code: "missing", message: "Command source does not exist" }]);
  return location.parent[location.key];
}

function writeAt(root, pointer, value, { insert = false, requireExisting = false } = {}) {
  const location = locate(root, pointer, insert);
  if (location.root) return cloneValue(value);
  if (requireExisting && !Object.prototype.hasOwnProperty.call(location.parent, location.key)) throw new ContractError("Command target does not exist", [{ path: pointer, code: "missing", message: "Command target does not exist" }]);
  if (Array.isArray(location.parent) && insert) location.parent.splice(location.key, 0, cloneValue(value));
  else location.parent[location.key] = cloneValue(value);
  return root;
}

function removeAt(root, pointer) {
  const location = locate(root, pointer);
  if (location.root) throw new ContractError("Cannot remove workspace root", [{ path: pointer, code: "root", message: "Workspace root cannot be removed" }]);
  if (!Object.prototype.hasOwnProperty.call(location.parent, location.key)) throw new ContractError("Command target does not exist", [{ path: pointer, code: "missing", message: "Command target does not exist" }]);
  if (Array.isArray(location.parent)) location.parent.splice(location.key, 1);
  else delete location.parent[location.key];
  return root;
}

function validateCommandOperation(operation, index) {
  const base = `/commands/operations/${index}`;
  if (!isObject(operation) || !COMMANDS.has(operation.op) || typeof operation.path !== "string") {
    throw new ContractError("Command operation is invalid", [{ path: base, code: "shape", message: "Operation requires a supported op and path" }]);
  }
  if (operation.op === "move" && typeof operation.from !== "string") {
    throw new ContractError("Move source is required", [{ path: `${base}/from`, code: "required", message: "Move requires from" }]);
  }
}

function applyCommandOperation(root, operation, index) {
  validateCommandOperation(operation, index);
  if (operation.op === "set") return writeAt(root, operation.path, operation.value);
  if (operation.op === "replace") return writeAt(root, operation.path, operation.value, { requireExisting: true });
  if (operation.op === "insert") return writeAt(root, operation.path, operation.value, { insert: true });
  if (operation.op === "unset" || operation.op === "remove") return removeAt(root, operation.path);
  const value = cloneValue(readAt(root, operation.from));
  const withoutSource = removeAt(root, operation.from);
  return writeAt(withoutSource, operation.path, value, { insert: true });
}

function actualInsertPath(root, pointer) {
  const location = locate(root, pointer, true);
  if (location.root || !Array.isArray(location.parent) || !pointer.endsWith("/-")) return pointer;
  return `${pointer.slice(0, -1)}${location.key}`;
}

export function applyCommandBatch(input, batch) {
  if (!isObject(batch) || !Array.isArray(batch.operations) || !batch.batchId || !["agent", "user", "system"].includes(batch.source)) {
    throw new ContractError("Command batch is invalid", [{ path: "/commands", code: "shape", message: "batchId, source, and operations are required" }]);
  }
  let next = cloneValue(input);
  for (const [index, operation] of batch.operations.entries()) {
    try {
      next = applyCommandOperation(next, operation, index);
    } catch (error) {
      if (error instanceof ContractError) throw new ContractError(`Command batch failed atomically at operation ${index}`, error.issues);
      throw error;
    }
  }
  assertWorkspace(next);
  return next;
}

function encodePointerPart(value) {
  return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
}

export function diffWorkspaces(before, after, { limit = 100 } = {}) {
  const changes = [];
  const hasStableIds = (values) => values.length > 0
    && values.every((value) => isObject(value) && typeof value.id === "string" && value.id)
    && new Set(values.map(({ id }) => id)).size === values.length;
  const walk = (left, right, path) => {
    if (changes.length >= limit || Object.is(left, right)) return;
    const leftArray = Array.isArray(left);
    const rightArray = Array.isArray(right);
    const leftObject = isObject(left);
    const rightObject = isObject(right);
    if (leftArray && rightArray && hasStableIds(left) && hasStableIds(right)) {
      const leftById = new Map(left.map((value, index) => [value.id, { value, index }]));
      const rightById = new Map(right.map((value, index) => [value.id, { value, index }]));
      for (const { value, index } of leftById.values()) {
        if (changes.length >= limit) break;
        if (!rightById.has(value.id)) changes.push({ path: `${path}/${index}`, kind: "removed", before: cloneValue(value) });
      }
      for (const { value, index } of rightById.values()) {
        if (changes.length >= limit) break;
        if (!leftById.has(value.id)) changes.push({ path: `${path}/${index}`, kind: "added", after: cloneValue(value) });
        else walk(leftById.get(value.id).value, value, `${path}/${index}`);
      }
      const leftCommon = left.map(({ id }) => id).filter((id) => rightById.has(id));
      const rightCommon = right.map(({ id }) => id).filter((id) => leftById.has(id));
      if (changes.length < limit && leftCommon.join("|") !== rightCommon.join("|")) {
        changes.push({ path, kind: "reordered", before: leftCommon, after: rightCommon });
      }
      return;
    }
    if (leftArray && rightArray && left.length === right.length) {
      left.forEach((value, index) => walk(value, right[index], `${path}/${index}`));
      return;
    }
    if (leftObject && rightObject) {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys) {
        if (changes.length >= limit) break;
        const nextPath = `${path}/${encodePointerPart(key)}`;
        if (!Object.hasOwn(left, key)) changes.push({ path: nextPath, kind: "added", after: cloneValue(right[key]) });
        else if (!Object.hasOwn(right, key)) changes.push({ path: nextPath, kind: "removed", before: cloneValue(left[key]) });
        else walk(left[key], right[key], nextPath);
      }
      return;
    }
    changes.push({
      path: path || "/",
      kind: left === undefined ? "added" : right === undefined ? "removed" : "changed",
      ...(left === undefined ? {} : { before: cloneValue(left) }),
      ...(right === undefined ? {} : { after: cloneValue(right) })
    });
  };
  walk(before, after, "");
  return changes;
}

export function createInverseCommandBatch(baseWorkspace, batch) {
  const baseline = migrateWorkspace(baseWorkspace);
  if (!isObject(batch) || !Array.isArray(batch.operations) || !batch.batchId || !["agent", "user", "system"].includes(batch.source)) {
    throw new ContractError("Command batch is invalid", [{ path: "/commands", code: "shape", message: "batchId, source, and operations are required" }]);
  }
  let candidate = cloneValue(baseline);
  const inverseOperations = [];
  for (const [index, operation] of batch.operations.entries()) {
    validateCommandOperation(operation, index);
    if (operation.op === "set") {
      const location = locate(candidate, operation.path);
      const existed = location.root || Object.prototype.hasOwnProperty.call(location.parent, location.key);
      inverseOperations.push(existed
        ? { op: "replace", path: operation.path, value: cloneValue(location.root ? candidate : location.parent[location.key]) }
        : { op: "unset", path: operation.path });
      candidate = writeAt(candidate, operation.path, operation.value);
    } else if (operation.op === "replace") {
      inverseOperations.push({ op: "replace", path: operation.path, value: cloneValue(readAt(candidate, operation.path)) });
      candidate = writeAt(candidate, operation.path, operation.value, { requireExisting: true });
    } else if (operation.op === "insert") {
      const insertedPath = actualInsertPath(candidate, operation.path);
      inverseOperations.push({ op: "remove", path: insertedPath });
      candidate = writeAt(candidate, operation.path, operation.value, { insert: true });
    } else if (operation.op === "unset" || operation.op === "remove") {
      const location = locate(candidate, operation.path);
      const previous = cloneValue(readAt(candidate, operation.path));
      inverseOperations.push({ op: Array.isArray(location.parent) ? "insert" : "set", path: operation.path, value: previous });
      candidate = removeAt(candidate, operation.path);
    } else {
      const value = cloneValue(readAt(candidate, operation.from));
      candidate = removeAt(candidate, operation.from);
      const movedPath = actualInsertPath(candidate, operation.path);
      candidate = writeAt(candidate, operation.path, value, { insert: true });
      inverseOperations.push({ op: "move", from: movedPath, path: operation.from });
    }
  }
  assertWorkspace(candidate);
  const operations = inverseOperations.toReversed();
  const inverse = {
    batchId: `undo-${batch.batchId}`,
    source: "system",
    reason: `撤销 ${batch.reason || batch.batchId}`,
    operations
  };
  if (JSON.stringify(applyCommandBatch(candidate, inverse)) !== JSON.stringify(baseline)) {
    throw new ContractError("Inverse command batch does not restore its baseline", [{ path: "/commands", code: "inverse", message: "Generated inverse commands are not lossless" }]);
  }
  return inverse;
}

export function validateGenerationBundle(bundle) {
  const issues = [];
  if (!isObject(bundle)) issue(issues, "/", "type", "Generation bundle must be an object");
  else {
    if (bundle.version !== GENERATION_VERSION) issue(issues, "/version", "const", `Generation version must be ${GENERATION_VERSION}`);
    for (const field of ["request", "plan", "workspace", "commands", "provenance"]) if (!isObject(bundle[field])) issue(issues, `/${field}`, "required", `${field} is required`);
    const dataInputIds = new Set();
    if (isObject(bundle.request)) {
      if (typeof bundle.request.prompt !== "string" || !bundle.request.prompt.trim()) issue(issues, "/request/prompt", "required", "Prompt is required");
      if (bundle.request.scope !== undefined) {
        if (!isObject(bundle.request.scope) || !["workspace", "section", "component"].includes(bundle.request.scope.kind)) issue(issues, "/request/scope", "shape", "Request scope must be workspace, section, or component");
        else if (["section", "component"].includes(bundle.request.scope.kind) && (typeof bundle.request.scope.id !== "string" || !bundle.request.scope.id)) issue(issues, "/request/scope/id", "required", "Section and component scopes require an id");
      }
      for (const [index, input] of (bundle.request.dataInputs ?? []).entries()) {
        if (!isObject(input) || typeof input.id !== "string" || !input.id) issue(issues, `/request/dataInputs/${index}`, "shape", "Data input requires an id");
        else if (dataInputIds.has(input.id)) issue(issues, `/request/dataInputs/${index}/id`, "unique", "Data input ids must be unique");
        else dataInputIds.add(input.id);
      }
    }
    const componentIds = new Set();
    if (isObject(bundle.plan)) {
      if (!Array.isArray(bundle.plan.sections) || !bundle.plan.sections.length) issue(issues, "/plan/sections", "required", "Plan requires at least one section");
      for (const [sectionIndex, section] of (bundle.plan.sections ?? []).entries()) {
        for (const [componentIndex, component] of (section.components ?? []).entries()) {
          const componentPath = `/plan/sections/${sectionIndex}/components/${componentIndex}`;
          if (!component?.id) issue(issues, `${componentPath}/id`, "required", "Component id is required");
          else if (componentIds.has(component.id)) issue(issues, `${componentPath}/id`, "unique", "Plan component ids must be unique");
          else componentIds.add(component.id);
          if (component?.dataInputId && !dataInputIds.has(component.dataInputId)) issue(issues, `${componentPath}/dataInputId`, "reference", "Component data input does not exist");
        }
      }
    }
    if (isObject(bundle.workspace)) issues.push(...validateWorkspaceShape(bundle.workspace).map((entry) => ({ ...entry, path: `/workspace${entry.path === "/" ? "" : entry.path}` })));
    if (isObject(bundle.workspace) && !isObject(bundle.workspace.document)) issue(issues, "/workspace/document", "required", "Generated first drafts require a document model");
    if (isObject(bundle.commands) && !Array.isArray(bundle.commands.operations)) issue(issues, "/commands/operations", "type", "Command operations must be an array");
    if (isObject(bundle.provenance)) {
      if (!["real", "mixed", "sample"].includes(bundle.provenance.mode)) issue(issues, "/provenance/mode", "enum", "Provenance mode is invalid");
      if (!isObject(bundle.provenance.components)) issue(issues, "/provenance/components", "type", "Component provenance is required");
      else {
        for (const componentId of componentIds) if (!bundle.provenance.components[componentId]) issue(issues, `/provenance/components/${componentId}`, "required", "Every planned component requires provenance");
        for (const [componentId, source] of Object.entries(bundle.provenance.components)) {
          if (!componentIds.has(componentId)) issue(issues, `/provenance/components/${componentId}`, "reference", "Provenance component is not present in the plan");
          if (source?.dataInputId && !dataInputIds.has(source.dataInputId)) issue(issues, `/provenance/components/${componentId}/dataInputId`, "reference", "Provenance data input does not exist");
          if (source?.source === "sample" && !String(source.label || "").trim()) issue(issues, `/provenance/components/${componentId}/label`, "required", "Sample data requires a visible label");
        }
        const sources = new Set(Object.values(bundle.provenance.components).map((entry) => entry?.source));
        const expectedMode = sources.size === 1 && sources.has("sample") ? "sample" : sources.size === 1 && sources.has("real") ? "real" : "mixed";
        if (sources.size && bundle.provenance.mode !== expectedMode) issue(issues, "/provenance/mode", "consistency", `Provenance mode must be ${expectedMode}`);
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

export function materializeGenerationBundle(baseWorkspace, bundle) {
  const validation = validateGenerationBundle(bundle);
  if (!validation.valid) throw new ContractError("Generation bundle validation failed", validation.issues);
  const baseline = migrateWorkspace(baseWorkspace);
  const next = applyCommandBatch(baseline, bundle.commands);
  if (JSON.stringify(next) !== JSON.stringify(bundle.workspace)) {
    throw new ContractError("Generation commands do not produce the declared workspace", [{ path: "/commands", code: "mismatch", message: "Applied command result differs from bundle.workspace" }]);
  }
  return next;
}

export const contractVersions = Object.freeze({ workspace: WORKSPACE_VERSION, generation: GENERATION_VERSION });
