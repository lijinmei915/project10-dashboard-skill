function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function semanticMaps(dataSource) {
  const model = dataSource?.semanticModel || {};
  return {
    dimensions: new Map((model.dimensions || []).map((item) => [item.fieldId, item])),
    metrics: new Map((model.metrics || []).map((item) => [item.fieldId, item]))
  };
}

function requireSemantic(map, fieldId, role) {
  const item = map.get(fieldId);
  if (!item) throw new Error(`${role}字段 ${fieldId} 没有可用语义定义`);
  return item;
}

export function buildSemanticQuery(component, dataSource, { filterDefinitions = [], filterValues = {}, drilldown = null, binding: bindingOverride = null } = {}) {
  if (!component?.binding || !component.dataRef) throw new Error("在线查询需要 dataRef 和 binding");
  const { dimensions, metrics } = semanticMaps(dataSource);
  let binding = bindingOverride || component.binding;
  let effectiveFilterDefinitions = filterDefinitions;
  let effectiveFilterValues = filterValues;
  if (drilldown) {
    const hierarchy = (dataSource.semanticModel?.hierarchies || []).find(({ id }) => id === drilldown.hierarchyId);
    if (!hierarchy) throw new Error(`语义层级 ${drilldown.hierarchyId} 不存在`);
    const bySemanticId = new Map((dataSource.semanticModel?.dimensions || []).map((item) => [item.id, item]));
    const registered = hierarchy.levels.map((id) => bySemanticId.get(id));
    if (registered.some((item) => !item) || registered.length !== drilldown.levels.length || registered.some((item, index) => item.fieldId !== drilldown.levels[index].field)) throw new Error("Workspace 下钻层级与授权语义层级不一致");
    if (drilldown.path.length >= registered.length) throw new Error("下钻路径超出语义层级");
    binding = { ...binding, categoryField: registered[drilldown.path.length].fieldId };
    const pathFilters = drilldown.path.map((value, index) => ({ id: `drilldown-${index}`, field: registered[index].fieldId, defaultValue: value }));
    effectiveFilterDefinitions = [...filterDefinitions, ...pathFilters];
    effectiveFilterValues = { ...filterValues, ...Object.fromEntries(pathFilters.map(({ id, defaultValue }) => [id, defaultValue])) };
  }
  let dimensionItems = [];
  let metricItems = [];
  if (binding.kind === "aggregate") metricItems = [requireSemantic(metrics, binding.field, "指标")];
  if (binding.kind === "series") {
    dimensionItems = [requireSemantic(dimensions, binding.categoryField, "维度")];
    metricItems = [requireSemantic(metrics, binding.valueField, "指标")];
  }
  if (binding.kind === "ranking") {
    dimensionItems = [requireSemantic(dimensions, binding.labelField, "维度")];
    metricItems = [requireSemantic(metrics, binding.valueField, "指标")];
  }
  if (binding.kind === "rows") {
    for (const column of binding.columns || []) {
      const dimension = dimensions.get(column.field);
      const metric = metrics.get(column.field);
      if (!dimension && !metric) throw new Error(`表格字段 ${column.field} 没有可用语义定义`);
      if (dimension) dimensionItems.push(dimension);
      if (metric) metricItems.push(metric);
    }
  }
  const filters = effectiveFilterDefinitions.flatMap((definition) => {
    const value = effectiveFilterValues[definition.id] ?? definition.defaultValue;
    if (value === "" || value === null || value === undefined) return [];
    const dimension = requireSemantic(dimensions, definition.field, "筛选维度");
    return [{ dimensionId: dimension.id, operator: Array.isArray(value) ? "in" : "equals", value: clone(value) }];
  });
  return {
    dimensions: [...new Map(dimensionItems.map((item) => [item.id, item])).keys()],
    metrics: [...new Map(metricItems.map((item) => [item.id, item])).keys()],
    filters,
    limit: Math.min(200, binding.limit || (binding.kind === "ranking" ? 10 : 100))
  };
}

function formatMetric(value, format = {}) {
  const number = Number(value);
  const formatted = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: format.maximumFractionDigits ?? 0 }).format((Number.isFinite(number) ? number : 0) * (format.multiplier ?? 1));
  return `${format.prefix || ""}${formatted}${format.suffix || ""}`;
}

export function materializeSemanticResult(component, result, bindingOverride = null) {
  const binding = bindingOverride || component.binding;
  const columnIndex = new Map(result.columns.map((column, index) => [column.id, index]));
  if (binding.kind === "aggregate") {
    const metric = result.columns.find(({ role }) => role === "metric");
    return { value: formatMetric(result.rows[0]?.[columnIndex.get(metric?.id)], binding.format || metric?.format) };
  }
  if (binding.kind === "series") {
    const dimension = result.columns.find(({ role }) => role === "dimension");
    const metric = result.columns.find(({ role }) => role === "metric");
    return {
      labels: result.rows.map((row) => String(row[columnIndex.get(dimension.id)] ?? "")),
      values: result.rows.map((row) => Number(row[columnIndex.get(metric.id)]) || 0),
      empty: result.rows.length === 0
    };
  }
  if (binding.kind === "ranking") {
    const dimension = result.columns.find(({ role }) => role === "dimension");
    const metric = result.columns.find(({ role }) => role === "metric");
    return {
      items: result.rows.map((row) => ({ label: String(row[columnIndex.get(dimension.id)] ?? ""), value: Number(row[columnIndex.get(metric.id)]) || 0 }))
        .sort((left, right) => right.value - left.value).slice(0, binding.limit || 10),
      empty: result.rows.length === 0
    };
  }
  const fields = semanticMaps({ semanticModel: result.semanticModel });
  const fieldToSemanticId = new Map([
    ...fields.dimensions.entries(), ...fields.metrics.entries()
  ].map(([fieldId, item]) => [fieldId, item.id]));
  return {
    columns: binding.columns.map(({ label }) => label),
    rows: result.rows.slice(0, binding.limit || 100).map((row) => binding.columns.map(({ field }) => row[columnIndex.get(fieldToSemanticId.get(field))] ?? "")),
    empty: result.rows.length === 0
  };
}

export function createOnlineDataRuntime({ fetcher = fetch, onResult = () => {}, onStatus = () => {}, metadataTtlMs = 60_000, clock = () => Date.now() } = {}) {
  const metadataCache = new Map();
  const active = new Map();
  const lastGood = new Map();
  const appliedKeys = new Map();

  async function requestJson(url, options) {
    const response = await fetcher(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error || "在线数据查询失败"), { status: response.status, payload });
    return payload;
  }

  async function metadata(datasetId) {
    const cached = metadataCache.get(datasetId);
    if (cached?.promise) return cached.promise;
    if (cached && cached.expiresAt > clock()) return cached.value;
    const promise = requestJson(`/api/data-sources/${encodeURIComponent(datasetId)}`).then((payload) => {
      metadataCache.set(datasetId, { value: payload.dataSource, expiresAt: clock() + metadataTtlMs });
      return payload.dataSource;
    }).catch((error) => {
      metadataCache.delete(datasetId);
      throw error;
    });
    metadataCache.set(datasetId, { promise, expiresAt: Number.POSITIVE_INFINITY });
    return promise;
  }

  async function resolve(component, context = {}) {
    const componentId = component.id;
    const previous = active.get(componentId);
    previous?.controller.abort();
    const sequence = (previous?.sequence || 0) + 1;
    const controller = new AbortController();
    active.set(componentId, { sequence, controller });
    onStatus({ componentId, status: "loading" });
    try {
      const dataSource = await metadata(component.dataRef);
      if (active.get(componentId)?.sequence !== sequence) return { status: "stale" };
      const bindingEntries = [["primary", component.binding], ...(component.trendBinding ? [["trend", component.trendBinding]] : [])];
      const queries = bindingEntries.map(([role, binding]) => [role, binding, buildSemanticQuery(component, dataSource, { ...context, drilldown: role === "primary" ? context.drilldown : null, binding })]);
      const key = JSON.stringify({ datasetId: component.dataRef, queries: queries.map(([role, binding, query]) => ({ role, binding, query })) });
      if (appliedKeys.get(componentId) === key && lastGood.has(componentId)) {
        const value = clone(lastGood.get(componentId));
        onStatus({ componentId, status: "ready", meta: value.meta });
        return { status: "unchanged", value };
      }
      const payloads = await Promise.all(queries.map(([, , query]) => requestJson(`/api/data-sources/${encodeURIComponent(component.dataRef)}/query`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query), signal: controller.signal
      })));
      if (active.get(componentId)?.sequence !== sequence) return { status: "stale" };
      const primaryPayload = payloads[0];
      const props = materializeSemanticResult(component, { ...primaryPayload.result, semanticModel: dataSource.semanticModel }, component.binding);
      if (component.trendBinding) {
        const trendProps = materializeSemanticResult(component, { ...payloads[1].result, semanticModel: dataSource.semanticModel }, component.trendBinding);
        const limit = component.trendBinding.limit || 30;
        const labels = (trendProps.labels || []).slice(-limit);
        const values = (trendProps.values || []).slice(-limit);
        if (labels.length >= 2 && labels.length === values.length) props.sparkline = { labels, values, ...(component.props?.sparkline?.unit ? { unit: component.props.sparkline.unit } : {}) };
      }
      const result = { props, meta: {
        datasetId: component.dataRef,
        datasetFingerprint: primaryPayload.result.datasetFingerprint,
        datasetUpdatedAt: primaryPayload.result.datasetUpdatedAt,
        semanticVersion: primaryPayload.result.semanticVersion,
        cacheStatus: payloads.every((payload) => payload.cache?.status === "hit") ? "hit" : "miss",
        bindingKey: JSON.stringify({ binding: component.binding, trendBinding: component.trendBinding || null }),
        stale: false
      } };
      appliedKeys.set(componentId, key);
      lastGood.set(componentId, result);
      onResult({ componentId, value: clone(result) });
      onStatus({ componentId, status: "ready", meta: clone(result.meta) });
      return { status: "ready", value: clone(result) };
    } catch (error) {
      if (error?.name === "AbortError" || active.get(componentId)?.sequence !== sequence) return { status: "stale" };
      const fallback = lastGood.get(componentId);
      const value = fallback ? { ...clone(fallback), meta: { ...fallback.meta, stale: true } } : null;
      onStatus({ componentId, status: fallback ? "stale" : "error", error: error.message, meta: value?.meta });
      if (value) onResult({ componentId, value });
      return { status: fallback ? "last-known-good" : "error", value, error };
    }
  }

  function prune(componentIds = []) {
    const retained = new Set(componentIds);
    for (const [componentId, request] of active) {
      if (retained.has(componentId)) continue;
      request.controller.abort();
      active.delete(componentId);
      lastGood.delete(componentId);
      appliedKeys.delete(componentId);
    }
  }

  function invalidateDataset(datasetId) {
    metadataCache.delete(datasetId);
    for (const componentId of appliedKeys.keys()) if (lastGood.get(componentId)?.meta?.datasetId === datasetId) appliedKeys.delete(componentId);
  }

  function dispose() {
    for (const { controller } of active.values()) controller.abort();
    active.clear(); metadataCache.clear(); lastGood.clear(); appliedKeys.clear();
  }

  return Object.freeze({ resolve, prune, invalidateDataset, dispose });
}
