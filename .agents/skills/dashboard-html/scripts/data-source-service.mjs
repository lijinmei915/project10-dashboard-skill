import { createHash, randomUUID } from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import readExcelFile from "read-excel-file/node";
import { parse as parseHtml } from "parse5";
import { ContractError } from "./workspace-core.mjs";

export const DATA_SOURCE_LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, rows: 10_000, columns: 100, previewRows: 20, portableRows: 500, sampleRows: 12 });

function fail(message, path = "/content", code = "invalid") {
  throw new ContractError(message, [{ path, code, message }]);
}

function safeFieldId(label, index, used) {
  const base = String(label || `field-${index + 1}`).trim().toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `field-${index + 1}`;
  let id = /^[a-z]/.test(base) ? base : `field-${base}`;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  used.add(id);
  return id;
}

function parseJson(content) {
  let value;
  try { value = JSON.parse(content); } catch { fail("JSON 内容无法解析"); }
  const records = Array.isArray(value) ? value : value?.records;
  if (!Array.isArray(records)) fail("JSON 必须是对象数组，或包含 records 数组");
  if (records.some((record) => !record || typeof record !== "object" || Array.isArray(record))) fail("JSON 每一行必须是对象");
  return records;
}

function parseCsvContent(content) {
  try {
    return parseCsv(content, { columns: true, bom: true, skip_empty_lines: true, relax_column_count: false, trim: true });
  } catch (error) {
    fail(`CSV 内容无法解析：${error.message}`);
  }
}

function htmlElements(node, tagName, result = []) {
  if (node?.tagName === tagName) result.push(node);
  for (const child of node?.childNodes || []) htmlElements(child, tagName, result);
  return result;
}

function htmlText(node) {
  if (node?.nodeName === "#text") return node.value || "";
  if (["script", "style", "template", "noscript", "svg", "canvas", "iframe"].includes(node?.tagName)) return "";
  return (node?.childNodes || []).map(htmlText).join("");
}

function parseHtmlContent(content) {
  let document;
  try { document = parseHtml(content); } catch { fail("HTML 内容无法解析"); }
  const table = htmlElements(document, "table").find((candidate) => htmlElements(candidate, "tr").length > 1);
  if (table) {
    const rows = htmlElements(table, "tr").map((row) => {
      const directCells = (row.childNodes || []).filter(({ tagName }) => tagName === "th" || tagName === "td");
      return directCells.map((cell) => htmlText(cell).replace(/\s+/g, " ").trim());
    }).filter((row) => row.length);
    if (rows.length >= 2) {
      const width = Math.max(...rows.map((row) => row.length));
      const used = new Map();
      const labels = Array.from({ length: width }, (_, index) => {
        const base = rows[0][index] || `列 ${index + 1}`;
        const count = (used.get(base) || 0) + 1;
        used.set(base, count);
        return count === 1 ? base : `${base} ${count}`;
      });
      return { contentKind: "table", rawRecords: rows.slice(1).map((row) => Object.fromEntries(labels.map((label, index) => [label, row[index] || null]))) };
    }
  }

  const records = [];
  const seen = new Set();
  let section = htmlElements(document, "title").map(htmlText).join(" ").replace(/\s+/g, " ").trim().slice(0, 240) || "页面内容";
  const add = (type, text) => {
    const content = text.replace(/\s+/g, " ").trim().slice(0, 1200);
    if (!content || seen.has(`${type}:${content}`)) return;
    seen.add(`${type}:${content}`);
    records.push({ 内容类型: type, 分区: section, 内容: content });
  };
  const walk = (node) => {
    if (["script", "style", "template", "noscript", "svg", "canvas", "iframe", "form"].includes(node?.tagName)) return;
    if (["h1", "h2", "h3", "h4"].includes(node?.tagName)) {
      const heading = htmlText(node).replace(/\s+/g, " ").trim();
      if (heading) { section = heading.slice(0, 240); add("标题", heading); }
      return;
    }
    if (["p", "li", "dt", "dd", "figcaption", "blockquote"].includes(node?.tagName)) {
      add(node.tagName === "li" ? "列表项" : "正文", htmlText(node));
      return;
    }
    for (const child of node?.childNodes || []) walk(child);
  };
  walk(document);
  if (!records.length) add("正文", htmlText(htmlElements(document, "body")[0] || document));
  if (!records.length) fail("HTML 页面没有可分析的可见内容", "/content", "required");
  return { contentKind: "page", rawRecords: records.slice(0, 500) };
}

function excelScalar(value) {
  if (value instanceof Date) return value.toISOString();
  return scalar(value);
}

function recordsFromSheet(data) {
  const rows = data.filter((row) => row.some((value) => excelScalar(value) !== null));
  if (!rows.length) return [];
  const width = Math.max(...rows.map((row) => row.length));
  const used = new Map();
  const labels = Array.from({ length: width }, (_, index) => {
    const base = String(excelScalar(rows[0][index]) ?? `列 ${index + 1}`).trim() || `列 ${index + 1}`;
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base} ${count}`;
  });
  return rows.slice(1).map((row) => Object.fromEntries(labels.map((label, index) => [label, excelScalar(row[index])])));
}

async function parseExcelContent(contentBase64, requestedSheet) {
  if (typeof contentBase64 !== "string" || !/^[a-zA-Z0-9+/]*={0,2}$/.test(contentBase64)) fail("Excel 内容必须是 Base64", "/contentBase64", "format");
  const buffer = Buffer.from(contentBase64, "base64");
  if (!buffer.length) fail("Excel 文件不能为空", "/contentBase64", "required");
  if (buffer.length > DATA_SOURCE_LIMITS.bytes) fail("数据文件不能超过 2 MB", "/contentBase64", "limit");
  let sheets;
  try { sheets = await readExcelFile(buffer); } catch (error) { fail(`Excel 工作簿无法解析：${error.message}`, "/contentBase64", "format"); }
  const availableSheets = sheets.map(({ sheet }) => sheet);
  const selected = requestedSheet
    ? sheets.find(({ sheet }) => sheet === requestedSheet)
    : sheets.find(({ data }) => recordsFromSheet(data).length);
  if (!selected) fail(requestedSheet ? `工作表 ${requestedSheet} 不存在或没有数据` : "Excel 工作簿没有可导入的数据", "/sheetName", "reference");
  return { rawRecords: recordsFromSheet(selected.data), sheetName: selected.sheet, availableSheets, binary: buffer };
}

function scalar(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  return JSON.stringify(value);
}

function inferType(values) {
  const present = values.filter((value) => value !== null);
  if (!present.length) return "string";
  if (present.every((value) => typeof value === "boolean" || /^(true|false|是|否)$/i.test(String(value)))) return "boolean";
  if (present.every((value) => typeof value === "number" || /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(String(value).replaceAll(",", "")))) return "number";
  if (present.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)))) return "date";
  if (present.every((value) => !Number.isNaN(Date.parse(String(value))) && /[-/:T]/.test(String(value)))) return "datetime";
  return "string";
}

function coerce(value, type) {
  if (value === null) return null;
  if (type === "number") return Number(String(value).replaceAll(",", ""));
  if (type === "boolean") return typeof value === "boolean" ? value : /^(true|是)$/i.test(String(value));
  return String(value);
}

function semanticId(prefix, fieldId) {
  return `${prefix}-${fieldId}`.replace(/[^a-z0-9-]/g, "-");
}

function metricFormat(field) {
  const label = field.label.toLowerCase();
  if (/率|占比|比例|percent|rate|ratio/.test(label)) return { maximumFractionDigits: 1, multiplier: 100, suffix: "%" };
  if (/金额|收入|营收|销售额|成本|利润|预算|revenue|sales|amount|cost|profit/.test(label)) return { maximumFractionDigits: 0 };
  return { maximumFractionDigits: Number.isInteger(field.samples.find((value) => typeof value === "number")) ? 0 : 2 };
}

function normalizeMetricFormat(format, fallback) {
  const source = format && typeof format === "object" ? format : fallback;
  const result = {};
  if (typeof source.prefix === "string") result.prefix = source.prefix.slice(0, 20);
  if (typeof source.suffix === "string") result.suffix = source.suffix.slice(0, 20);
  if (Number.isFinite(Number(source.multiplier))) result.multiplier = Math.max(-1_000_000, Math.min(1_000_000, Number(source.multiplier)));
  if (Number.isInteger(Number(source.maximumFractionDigits))) result.maximumFractionDigits = Math.max(0, Math.min(6, Number(source.maximumFractionDigits)));
  return result;
}

export function inferSemanticModel(fields, { version = 1 } = {}) {
  const dimensions = [];
  const metrics = [];
  for (const field of fields) {
    if (field.type === "number") {
      const format = metricFormat(field);
      metrics.push({
        id: semanticId("metric", field.id), fieldId: field.id, label: field.label,
        aggregation: format.suffix === "%" ? "average" : "sum", format
      });
    } else {
      dimensions.push({
        id: semanticId("dimension", field.id), fieldId: field.id, label: field.label, type: field.type,
        ...(["date", "datetime"].includes(field.type) ? { timeGrain: "auto" } : {})
      });
    }
  }
  return { version, dimensions, metrics, hierarchies: [] };
}

function strictCoerce(value, type, field) {
  if (value === null) return null;
  if (type === "string" || type === "date" || type === "datetime") return String(value);
  if (type === "number") {
    const next = Number(String(value).replaceAll(",", ""));
    if (!Number.isFinite(next)) fail(`${field.label} 包含无法转换为数字的值`, `/fields/${field.id}/type`, "conversion");
    return next;
  }
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    if (/^(true|false|是|否)$/i.test(String(value))) return /^(true|是)$/i.test(String(value));
    fail(`${field.label} 包含无法转换为布尔值的值`, `/fields/${field.id}/type`, "conversion");
  }
  fail(`不支持字段类型 ${type}`, `/fields/${field.id}/type`, "enum");
}

function profileField(field, records, type) {
  const values = records.map((record) => record[field.id]);
  const next = {
    ...field, type, nullable: values.includes(null), nullCount: values.filter((value) => value === null).length,
    uniqueCount: new Set(values.map((value) => JSON.stringify(value))).size,
    samples: [...new Set(values.filter((value) => value !== null).map((value) => JSON.stringify(value)))].slice(0, 5).map(JSON.parse)
  };
  next.issues = qualityIssues(next, records.length);
  return next;
}

export function updateDataSourceSchema(source, { fieldTypes = {}, semanticModel, portable = source.portable, now = new Date().toISOString() } = {}) {
  const allowedTypes = new Set(["string", "number", "boolean", "date", "datetime"]);
  const fieldIds = new Set(source.fields.map(({ id }) => id));
  for (const [fieldId, type] of Object.entries(fieldTypes)) {
    if (!fieldIds.has(fieldId)) fail(`字段 ${fieldId} 不存在`, `/fieldTypes/${fieldId}`, "reference");
    if (!allowedTypes.has(type)) fail(`字段类型 ${type} 不受支持`, `/fieldTypes/${fieldId}`, "enum");
  }
  const records = (source.rawRecords || source.records).map((record) => Object.fromEntries(source.fields.map((field) => [field.id, strictCoerce(record[field.id], fieldTypes[field.id] || field.type, field)])));
  const fields = source.fields.map((field) => profileField(field, records, fieldTypes[field.id] || field.type));
  const inferred = inferSemanticModel(fields, { version: (source.semanticModel?.version || 0) + 1 });
  const candidate = semanticModel ? normalizeSemanticModel(semanticModel, fields, inferred.version) : inferred;
  return {
    ...source, portable: Boolean(portable), updatedAt: now, fields, records, semanticModel: candidate,
    quality: { issueCount: fields.reduce((sum, field) => sum + field.issues.length, 0), issues: fields.flatMap((field) => field.issues.map((issue) => ({ fieldId: field.id, ...issue }))) }
  };
}

export function normalizeSemanticModel(input, fields, version = 1) {
  if (!input || typeof input !== "object") fail("语义模型无效", "/semanticModel", "type");
  const byId = new Map(fields.map((field) => [field.id, field]));
  const usedFields = new Set();
  const dimensions = (input.dimensions || []).map((dimension, index) => {
    const field = byId.get(dimension.fieldId);
    if (!field) fail(`维度字段 ${dimension.fieldId} 不存在`, `/semanticModel/dimensions/${index}/fieldId`, "reference");
    if (usedFields.has(field.id)) fail(`字段 ${field.id} 被重复使用`, "/semanticModel", "unique");
    usedFields.add(field.id);
    return { id: semanticId("dimension", field.id), fieldId: field.id, label: String(dimension.label || field.label).slice(0, 80), type: field.type, ...(["date", "datetime"].includes(field.type) ? { timeGrain: ["auto", "day", "week", "month", "quarter", "year"].includes(dimension.timeGrain) ? dimension.timeGrain : "auto" } : {}) };
  });
  const metrics = (input.metrics || []).map((metric, index) => {
    const field = byId.get(metric.fieldId);
    if (!field || field.type !== "number") fail(`指标字段 ${metric.fieldId} 必须是数字`, `/semanticModel/metrics/${index}/fieldId`, "compatibility");
    if (usedFields.has(field.id)) fail(`字段 ${field.id} 被重复使用`, "/semanticModel", "unique");
    usedFields.add(field.id);
    const aggregation = ["sum", "average", "min", "max", "count"].includes(metric.aggregation) ? metric.aggregation : "sum";
    const format = normalizeMetricFormat(metric.format, metricFormat(field));
    return { id: semanticId("metric", field.id), fieldId: field.id, label: String(metric.label || field.label).slice(0, 80), aggregation, format };
  });
  const dimensionIds = new Set(dimensions.map(({ id }) => id));
  const hierarchyIds = new Set();
  const hierarchies = (input.hierarchies || []).map((hierarchy, index) => {
    const id = String(hierarchy.id || "");
    if (!/^[a-z][a-z0-9-]*$/.test(id) || hierarchyIds.has(id)) fail("层级 ID 无效或重复", `/semanticModel/hierarchies/${index}/id`, "unique");
    hierarchyIds.add(id);
    const levels = Array.isArray(hierarchy.levels) ? hierarchy.levels.map(String) : [];
    if (levels.length < 2 || levels.length > 8 || new Set(levels).size !== levels.length) fail("层级必须包含 2 到 8 个不重复维度", `/semanticModel/hierarchies/${index}/levels`, "range");
    for (const [levelIndex, dimensionId] of levels.entries()) if (!dimensionIds.has(dimensionId)) fail(`层级维度 ${dimensionId} 不存在`, `/semanticModel/hierarchies/${index}/levels/${levelIndex}`, "reference");
    return { id, label: String(hierarchy.label || id).slice(0, 80), levels };
  });
  return { version, dimensions, metrics, hierarchies };
}

function qualityIssues(field, rowCount) {
  const issues = [];
  if (field.nullCount) issues.push({ code: "missing-values", severity: field.nullCount === rowCount ? "error" : "warning", count: field.nullCount, message: `${field.label} 有 ${field.nullCount} 个空值` });
  if (rowCount > 1 && field.uniqueCount === 1) issues.push({ code: "constant-field", severity: "info", count: rowCount, message: `${field.label} 仅有一个值` });
  return issues;
}

function aggregateValues(records, metric) {
  if (metric.aggregation === "count") return records.filter((record) => record[metric.fieldId] !== null).length;
  const values = records.map((record) => Number(record[metric.fieldId])).filter(Number.isFinite);
  if (!values.length) return 0;
  if (metric.aggregation === "average") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (metric.aggregation === "min") return Math.min(...values);
  if (metric.aggregation === "max") return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0);
}

function timeBucket(value, grain) {
  if (!value || grain === "auto" || !grain) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  if (grain === "year") return String(year);
  if (grain === "quarter") return `${year}-Q${Math.ceil(month / 3)}`;
  if (grain === "month") return `${year}-${String(month).padStart(2, "0")}`;
  if (grain === "week") {
    const start = new Date(Date.UTC(year, 0, 1));
    return `${year}-W${String(Math.ceil((((date - start) / 86400000) + start.getUTCDay() + 1) / 7)).padStart(2, "0")}`;
  }
  return date.toISOString().slice(0, 10);
}

function matchesFilter(record, filter, dimension) {
  const actual = record[dimension.fieldId];
  if (filter.operator === "in") return Array.isArray(filter.value) && filter.value.some((value) => String(value) === String(actual));
  if (filter.operator === "contains") return String(actual ?? "").includes(String(filter.value ?? ""));
  if (filter.operator === "before") return String(actual ?? "") < String(filter.value ?? "");
  if (filter.operator === "after") return String(actual ?? "") > String(filter.value ?? "");
  return String(actual ?? "") === String(filter.value ?? "");
}

function normalizeQueryFilters(model, inputFilters) {
  const dimensionById = new Map(model.dimensions.map((item) => [item.id, item]));
  const filters = Array.isArray(inputFilters) ? inputFilters : [];
  if (filters.length > 12) fail("一次查询最多使用 12 个筛选条件", "/filters", "limit");
  return filters.map((filter, index) => {
    const dimension = dimensionById.get(filter.dimensionId);
    if (!dimension) fail(`筛选维度 ${filter.dimensionId} 不存在`, `/filters/${index}/dimensionId`, "reference");
    if (!["equals", "in", "contains", "before", "after"].includes(filter.operator)) fail(`筛选操作 ${filter.operator} 不受支持`, `/filters/${index}/operator`, "enum");
    return { filter: structuredClone(filter), dimension };
  });
}

export function scopeDataSourceRecords(source, policyFilters = []) {
  if (!policyFilters.length) return structuredClone(source);
  const model = source.semanticModel || inferSemanticModel(source.fields);
  const normalizedFilters = normalizeQueryFilters(model, policyFilters);
  const records = source.records.filter((record) => normalizedFilters.every(({ filter, dimension }) => matchesFilter(record, filter, dimension)));
  return { ...structuredClone(source), records: structuredClone(records), rowCount: records.length };
}

export function executeDataSourceQuery(source, input = {}) {
  const model = source.semanticModel || inferSemanticModel(source.fields);
  const dimensionById = new Map(model.dimensions.map((item) => [item.id, item]));
  const metricById = new Map(model.metrics.map((item) => [item.id, item]));
  const dimensionIds = Array.isArray(input.dimensions) ? input.dimensions : [];
  const metricIds = Array.isArray(input.metrics) && input.metrics.length ? input.metrics : model.metrics.map(({ id }) => id);
  if (dimensionIds.length > 3) fail("一次查询最多使用 3 个维度", "/dimensions", "limit");
  if (metricIds.length > 12) fail("一次查询最多使用 12 个指标", "/metrics", "limit");
  const dimensions = dimensionIds.map((id, index) => dimensionById.get(id) || fail(`维度 ${id} 不存在`, `/dimensions/${index}`, "reference"));
  const metrics = metricIds.map((id, index) => metricById.get(id) || fail(`指标 ${id} 不存在`, `/metrics/${index}`, "reference"));
  const normalizedFilters = normalizeQueryFilters(model, input.filters);
  const filtered = source.records.filter((record) => normalizedFilters.every(({ filter, dimension }) => matchesFilter(record, filter, dimension)));
  const groups = new Map();
  for (const record of filtered) {
    const values = dimensions.map((dimension) => timeBucket(record[dimension.fieldId], dimension.timeGrain));
    const key = JSON.stringify(values);
    const group = groups.get(key) || { values, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }
  if (!dimensions.length) groups.set("[]", { values: [], records: filtered });
  const rows = [...groups.values()].map((group) => [...group.values, ...metrics.map((metric) => aggregateValues(group.records, metric))]);
  const limit = Math.max(1, Math.min(200, Number(input.limit) || 100));
  return {
    datasetId: source.id,
    datasetFingerprint: source.fingerprint,
    datasetUpdatedAt: source.updatedAt,
    semanticVersion: model.version,
    query: { dimensions: dimensionIds, metrics: metricIds, filters: normalizedFilters.map(({ filter }) => structuredClone(filter)), limit },
    columns: [...dimensions.map(({ id, label, type }) => ({ id, label, role: "dimension", type })), ...metrics.map(({ id, label, format }) => ({ id, label, role: "metric", type: "number", format: structuredClone(format) }))],
    rows: rows.slice(0, limit),
    totalRows: rows.length,
    sourceRowCount: filtered.length
  };
}

function buildDataSource({ id, name, format, content, contentKind, rawRecords, portable, now, fingerprintInput, sheetName, availableSheets }) {
  if (!String(name || "").trim()) fail("数据源名称不能为空", "/name", "required");
  if (!rawRecords.length) fail("数据源至少需要一行数据");
  if (rawRecords.length > DATA_SOURCE_LIMITS.rows) fail(`数据源不能超过 ${DATA_SOURCE_LIMITS.rows} 行`, "/content", "limit");
  const labels = [...new Set(rawRecords.flatMap((record) => Object.keys(record)))];
  if (!labels.length || labels.length > DATA_SOURCE_LIMITS.columns) fail(`数据源需要 1-${DATA_SOURCE_LIMITS.columns} 列`, "/content", "limit");
  const used = new Set();
  const mappings = labels.map((label, index) => ({ label, id: safeFieldId(label, index, used) }));
  const normalized = rawRecords.map((record) => Object.fromEntries(mappings.map(({ label, id: fieldId }) => [fieldId, scalar(record[label])])));
  const fields = mappings.map(({ id: fieldId, label }) => {
    const values = normalized.map((record) => record[fieldId]);
    const type = inferType(values);
    const coerced = values.map((value) => coerce(value, type));
    const field = { id: fieldId, label, type, nullable: coerced.includes(null), nullCount: coerced.filter((value) => value === null).length, uniqueCount: new Set(coerced.map((value) => JSON.stringify(value))).size, samples: [...new Set(coerced.filter((value) => value !== null).map((value) => JSON.stringify(value)))].slice(0, 5).map(JSON.parse) };
    field.issues = qualityIssues(field, normalized.length);
    return field;
  });
  const records = normalized.map((record) => Object.fromEntries(fields.map((field) => [field.id, coerce(record[field.id], field.type)])));
  const sourceId = id || `dataset-${randomUUID()}`;
  const hash = createHash("sha256").update(fingerprintInput).digest("hex");
  return {
    id: sourceId,
    name: String(name).trim().slice(0, 120),
    kind: "uploaded",
    format,
    ...(contentKind ? { contentKind } : {}),
    ...(sheetName ? { sheetName, availableSheets } : {}),
    portable: Boolean(portable),
    createdAt: now,
    updatedAt: now,
    fingerprint: `sha256-${hash}`,
    rowCount: records.length,
    columnCount: fields.length,
    fields,
    rawRecords: normalized,
    semanticModel: inferSemanticModel(fields),
    records,
    quality: { issueCount: fields.reduce((sum, field) => sum + field.issues.length, 0), issues: fields.flatMap((field) => field.issues.map((issue) => ({ fieldId: field.id, ...issue }))) }
  };
}

export function parseDataSource({ id, name, format, content, portable = false, now = new Date().toISOString() } = {}) {
  if (!new Set(["csv", "json", "html"]).has(format)) fail("仅支持 CSV、JSON 或 HTML", "/format", "enum");
  if (typeof content !== "string") fail("数据内容必须是文本");
  if (Buffer.byteLength(content) > DATA_SOURCE_LIMITS.bytes) fail("数据文件不能超过 2 MB", "/content", "limit");
  const parsed = format === "html" ? parseHtmlContent(content) : { rawRecords: format === "csv" ? parseCsvContent(content) : parseJson(content) };
  return buildDataSource({ id, name, format, content, ...parsed, portable, now, fingerprintInput: content });
}

export async function parseUploadedDataSource(input = {}) {
  if (input.format !== "xlsx") return parseDataSource(input);
  const parsed = await parseExcelContent(input.contentBase64, input.sheetName);
  return buildDataSource({ ...input, ...parsed, fingerprintInput: parsed.binary, portable: Boolean(input.portable), now: input.now || new Date().toISOString() });
}

export async function refreshUploadedDataSource(source, input = {}) {
  if (!source || source.kind !== "uploaded") fail("当前数据源不支持上传刷新", "/id", "compatibility");
  if (input.format && input.format !== source.format) fail("刷新文件格式必须与原数据源一致", "/format", "compatibility");
  const now = input.now || new Date().toISOString();
  const parsed = await parseUploadedDataSource({
    ...input,
    id: source.id,
    name: source.name,
    format: source.format,
    portable: source.portable,
    sheetName: input.sheetName || source.sheetName,
    now
  });
  const nextIds = new Set(parsed.fields.map(({ id }) => id));
  const fieldTypes = Object.fromEntries(source.fields.filter(({ id }) => nextIds.has(id)).map(({ id, type }) => [id, type]));
  const refreshed = updateDataSourceSchema(parsed, { fieldTypes, semanticModel: source.semanticModel, portable: source.portable, now });
  refreshed.semanticModel.version = source.semanticModel?.version || refreshed.semanticModel.version;
  refreshed.createdAt = source.createdAt;
  if (source.organizationId) refreshed.organizationId = source.organizationId;
  if (source.ownerId) refreshed.ownerId = source.ownerId;
  refreshed.refresh = {
    status: "ready",
    attempt: (source.refresh?.attempt || 0) + 1,
    refreshedAt: now,
    lastSuccessfulAt: now
  };
  return refreshed;
}

export function markDataSourceRefreshFailed(source, error, { now = new Date().toISOString() } = {}) {
  return {
    ...source,
    refresh: {
      status: "failed",
      attempt: (source.refresh?.attempt || 0) + 1,
      failedAt: now,
      lastSuccessfulAt: source.refresh?.lastSuccessfulAt || source.updatedAt,
      error: { code: error?.issues?.[0]?.code || "refresh-failed", message: String(error?.message || "数据刷新失败").slice(0, 240) }
    }
  };
}

export function summarizeDataSource(source, { includePreview = false } = {}) {
  return {
    id: source.id, name: source.name, kind: source.kind, format: source.format, portable: source.portable,
    ...(source.contentKind ? { contentKind: source.contentKind } : {}),
    ...(source.sheetName ? { sheetName: source.sheetName, availableSheets: structuredClone(source.availableSheets) } : {}),
    createdAt: source.createdAt, updatedAt: source.updatedAt, fingerprint: source.fingerprint,
    ...(source.refresh ? { refresh: structuredClone(source.refresh) } : {}),
    rowCount: source.rowCount, columnCount: source.columnCount, fields: structuredClone(source.fields), semanticModel: structuredClone(source.semanticModel || inferSemanticModel(source.fields)), quality: structuredClone(source.quality),
    ...(includePreview ? { records: structuredClone(source.records.slice(0, DATA_SOURCE_LIMITS.previewRows)) } : {})
  };
}

export function createDataContext(source) {
  const sampleRecords = source.records.slice(0, DATA_SOURCE_LIMITS.sampleRows);
  const model = source.semanticModel || inferSemanticModel(source.fields);
  const metricIds = model.metrics.slice(0, 12).map(({ id }) => id);
  const firstDimension = model.dimensions[0];
  const querySnapshots = metricIds.length ? {
    totals: executeDataSourceQuery(source, { metrics: metricIds, limit: 1 }),
    ...(firstDimension ? { series: executeDataSourceQuery(source, { dimensions: [firstDimension.id], metrics: metricIds.slice(0, 3), limit: 12 }) } : {})
  } : {};
  return {
    input: { id: source.id, kind: source.kind, name: source.name, schemaRef: `data-source:${source.id}` },
    context: { datasetId: source.id, name: source.name, ...(source.contentKind ? { contentKind: source.contentKind } : {}), rowCount: source.rowCount, fields: source.fields.map(({ id, label, type, nullable, samples }) => ({ id, label, type, nullable, samples })), semanticModel: structuredClone(model), querySnapshots, sampleRecords },
    portableDataset: source.portable ? { portable: true, records: structuredClone(source.records.slice(0, DATA_SOURCE_LIMITS.portableRows)) } : null
  };
}
