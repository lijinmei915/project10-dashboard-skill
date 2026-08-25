import assert from "node:assert/strict";
import test from "node:test";
import { buildSemanticQuery, createOnlineDataRuntime, materializeSemanticResult } from "../studio/online-data-runtime.mjs";

const dataSource = {
  id: "sales-online",
  semanticModel: {
    version: 3,
    dimensions: [{ id: "dimension-region", fieldId: "region", label: "区域", type: "string" }],
    metrics: [{ id: "metric-revenue", fieldId: "revenue", label: "收入", aggregation: "sum", format: { suffix: " 元" } }],
    hierarchies: []
  }
};
const chart = { id: "sales-chart", type: "chart", dataRef: "sales-online", binding: { kind: "series", categoryField: "region", valueField: "revenue", operation: "sum" }, props: {} };
const result = {
  datasetId: "sales-online", datasetFingerprint: "sha256-sales", datasetUpdatedAt: "2026-08-23T00:00:00.000Z", semanticVersion: 3,
  columns: [{ id: "dimension-region", label: "区域", role: "dimension", type: "string" }, { id: "metric-revenue", label: "收入", role: "metric", type: "number", format: { suffix: " 元" } }],
  rows: [["华东", 1200], ["华南", 900]], totalRows: 2, sourceRowCount: 2
};

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}

test("maps controlled workspace bindings and filters to semantic query identifiers", () => {
  assert.deepEqual(buildSemanticQuery(chart, dataSource, {
    filterDefinitions: [{ id: "region-filter", field: "region", defaultValue: "" }],
    filterValues: { "region-filter": "华东" }
  }), {
    dimensions: ["dimension-region"], metrics: ["metric-revenue"],
    filters: [{ dimensionId: "dimension-region", operator: "equals", value: "华东" }], limit: 100
  });
  assert.throws(() => buildSemanticQuery({ ...chart, binding: { ...chart.binding, valueField: "physical-secret" } }, dataSource), /没有可用语义定义/);
});

test("moves to the next registered hierarchy level and keeps ancestor filters", () => {
  const hierarchical = { ...dataSource, semanticModel: { ...dataSource.semanticModel,
    dimensions: [
      { id: "dimension-region", fieldId: "region", label: "区域", type: "string" },
      { id: "dimension-province", fieldId: "province", label: "省份", type: "string" },
      { id: "dimension-city", fieldId: "city", label: "城市", type: "string" }
    ],
    hierarchies: [{ id: "geo", label: "地域", levels: ["dimension-region", "dimension-province", "dimension-city"] }]
  } };
  const query = buildSemanticQuery(chart, hierarchical, { drilldown: {
    hierarchyId: "geo", levels: [{ field: "region" }, { field: "province" }, { field: "city" }], path: ["华东"]
  } });
  assert.deepEqual(query.dimensions, ["dimension-province"]);
  assert.deepEqual(query.filters, [{ dimensionId: "dimension-region", operator: "equals", value: "华东" }]);
  assert.throws(() => buildSemanticQuery(chart, hierarchical, { drilldown: {
    hierarchyId: "geo", levels: [{ field: "region" }, { field: "city" }, { field: "province" }], path: ["华东"]
  } }), /不一致/);
});

test("materializes query rows without exposing the server response shape to components", () => {
  assert.deepEqual(materializeSemanticResult(chart, result), { labels: ["华东", "华南"], values: [1200, 900], empty: false });
  const kpi = { binding: { kind: "aggregate", field: "revenue", operation: "sum", format: { suffix: " 元" } } };
  assert.deepEqual(materializeSemanticResult(kpi, { ...result, rows: [[2100]], columns: [result.columns[1]] }), { value: "2,100 元" });
  const ranking = { binding: { kind: "ranking", labelField: "region", valueField: "revenue", operation: "sum", limit: 1 } };
  assert.deepEqual(materializeSemanticResult(ranking, result), { items: [{ label: "华东", value: 1200 }], empty: false });
  const table = { binding: { kind: "rows", columns: [{ field: "revenue", label: "收入" }, { field: "region", label: "区域" }], limit: 2 } };
  assert.deepEqual(materializeSemanticResult(table, { ...result, semanticModel: dataSource.semanticModel }), { columns: ["收入", "区域"], rows: [[1200, "华东"], [900, "华南"]], empty: false });
});

test("online KPI merges its aggregate value with a separately queried real trend", async () => {
  const kpi = {
    id: "revenue-kpi", type: "kpi", dataRef: "sales-online",
    binding: { kind: "aggregate", field: "revenue", operation: "sum", format: { suffix: " 元" } },
    trendBinding: { kind: "series", categoryField: "region", valueField: "revenue", operation: "sum", limit: 7 },
    props: { sparkline: { labels: ["旧值一", "旧值二"], values: [1, 2], unit: "元" } }
  };
  const queries = [];
  const runtime = createOnlineDataRuntime({ fetcher: async (url, options) => {
    if (!url.endsWith("/query")) return response({ dataSource });
    const query = JSON.parse(options.body);
    queries.push(query);
    if (query.dimensions.length) return response({ result, cache: { status: "hit" } });
    return response({ result: { ...result, columns: [result.columns[1]], rows: [[2100]] }, cache: { status: "hit" } });
  } });

  const resolved = await runtime.resolve(kpi);
  assert.equal(resolved.status, "ready");
  assert.equal(queries.length, 2);
  assert.deepEqual(queries.map(({ dimensions }) => dimensions), [[], ["dimension-region"]]);
  assert.deepEqual(resolved.value.props, {
    value: "2,100 元",
    sparkline: { labels: ["华东", "华南"], values: [1200, 900], unit: "元" }
  });
});

test("online runtime rejects late results and keeps the latest authorized query", async () => {
  const pending = [];
  const applied = [];
  const runtime = createOnlineDataRuntime({
    onResult: (event) => applied.push(event),
    fetcher: async (url) => {
      if (!url.endsWith("/query")) return response({ dataSource });
      return new Promise((resolve) => pending.push(resolve));
    }
  });
  const first = runtime.resolve(chart, { filterDefinitions: [{ id: "region", field: "region", defaultValue: "" }], filterValues: { region: "华东" } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = runtime.resolve(chart, { filterDefinitions: [{ id: "region", field: "region", defaultValue: "" }], filterValues: { region: "华南" } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  pending[1](response({ result: { ...result, rows: [["华南", 950]] }, cache: { status: "miss" } }));
  assert.equal((await second).status, "ready");
  pending[0](response({ result, cache: { status: "miss" } }));
  assert.equal((await first).status, "stale");
  assert.equal(applied.length, 1);
  assert.deepEqual(applied[0].value.props.values, [950]);
});

test("concurrent components share one in-flight metadata request", async () => {
  let metadataRequests = 0;
  let resolveMetadata;
  const runtime = createOnlineDataRuntime({
    fetcher: async (url) => {
      if (!url.endsWith("/query")) {
        metadataRequests += 1;
        return new Promise((resolve) => { resolveMetadata = resolve; });
      }
      return response({ result, cache: { status: "miss" } });
    }
  });
  const first = runtime.resolve(chart);
  const second = runtime.resolve({ ...chart, id: "sales-chart-2" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(metadataRequests, 1);
  resolveMetadata(response({ dataSource }));
  assert.equal((await first).status, "ready");
  assert.equal((await second).status, "ready");
});

test("online runtime returns last-known-good data after a later query failure", async () => {
  let failQuery = false;
  const statuses = [];
  const runtime = createOnlineDataRuntime({
    onStatus: (event) => statuses.push(event),
    fetcher: async (url) => {
      if (!url.endsWith("/query")) return response({ dataSource });
      return failQuery ? response({ error: "upstream unavailable" }, 503) : response({ result, cache: { status: "hit" } });
    }
  });
  assert.equal((await runtime.resolve(chart)).status, "ready");
  failQuery = true;
  const fallback = await runtime.resolve(chart, { filterDefinitions: [{ id: "region", field: "region", defaultValue: "" }], filterValues: { region: "华东" } });
  assert.equal(fallback.status, "last-known-good");
  assert.equal(fallback.value.meta.stale, true);
  assert.equal(statuses.at(-1).status, "stale");
});

test("invalidating one dataset does not evict another dataset query key", async () => {
  const queryCounts = new Map();
  const runtime = createOnlineDataRuntime({
    fetcher: async (url) => {
      const datasetId = url.split("/api/data-sources/")[1].split("/")[0];
      if (!url.endsWith("/query")) return response({ dataSource: { ...dataSource, id: datasetId } });
      queryCounts.set(datasetId, (queryCounts.get(datasetId) || 0) + 1);
      return response({ result: { ...result, datasetId }, cache: { status: "miss" } });
    }
  });
  const first = { ...chart, id: "chart-a", dataRef: "dataset-a" };
  const second = { ...chart, id: "chart-b", dataRef: "dataset-b" };
  await runtime.resolve(first);
  await runtime.resolve(second);
  runtime.invalidateDataset("dataset-a");
  assert.equal((await runtime.resolve(second)).status, "unchanged");
  assert.equal((await runtime.resolve(first)).status, "ready");
  assert.deepEqual(Object.fromEntries(queryCounts), { "dataset-a": 2, "dataset-b": 1 });
});
