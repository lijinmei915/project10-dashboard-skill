import assert from "node:assert/strict";
import test from "node:test";
import { applyChartSelection, chartSelectionDescriptor, chartSelectionFilters, selectionTargetIds } from "../studio/analysis-state.mjs";

function fixture(scope = "section") {
  const chart = (id, dataRef = "sales") => ({
    id, type: "chart", title: id, dataRef,
    binding: { kind: "series", categoryField: "region", valueField: "revenue", operation: "sum" },
    props: { labels: ["华东", "华南"], values: [1, 2], selection: { enabled: true, targetScope: scope } }
  });
  return {
    sections: [
      { id: "overview", title: "概览", components: [chart("source"), { id: "kpi", type: "kpi", title: "收入", dataRef: "sales", binding: { kind: "aggregate", field: "revenue", operation: "sum" }, props: { value: "3" } }, chart("other-source", "other")] },
      { id: "detail", title: "明细", components: [chart("detail-chart")] }
    ]
  };
}

test("resolves component, section and page selection targets within one dataset", () => {
  assert.deepEqual(selectionTargetIds(fixture("component"), chartSelectionDescriptor(fixture("component"), "source")), ["source"]);
  assert.deepEqual(selectionTargetIds(fixture("section"), chartSelectionDescriptor(fixture("section"), "source")), ["source", "kpi"]);
  assert.deepEqual(selectionTargetIds(fixture("page"), chartSelectionDescriptor(fixture("page"), "source")), ["source", "kpi", "detail-chart"]);
});

test("applies and clears a chart selection without mutating the prior state", () => {
  const document = fixture("page");
  const initial = { filters: { year: "2026" } };
  const applied = applyChartSelection(document, initial, { componentId: "source", value: "华东" });
  assert.equal(applied.status, "applied");
  assert.deepEqual(applied.interactions.chartSelections, { source: "华东" });
  assert.deepEqual(initial, { filters: { year: "2026" } });
  const cleared = applyChartSelection(document, applied.interactions, { componentId: "source", value: "华东" });
  assert.equal(cleared.status, "cleared");
  assert.equal(cleared.interactions.chartSelections, undefined);
});

test("projects selected values into controlled filters for affected targets only", () => {
  const document = fixture("section");
  const state = { chartSelections: { source: "华东" } };
  assert.deepEqual(chartSelectionFilters(document, state, "kpi"), {
    filters: [{ id: "chart-selection-source", field: "region", defaultValue: "华东" }],
    values: { "chart-selection-source": "华东" }
  });
  assert.deepEqual(chartSelectionFilters(document, state, "detail-chart"), { filters: [], values: {} });
  assert.equal(applyChartSelection(document, state, { componentId: "missing", value: "华东" }).status, "ignored");
});
