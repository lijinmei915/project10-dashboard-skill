import assert from "node:assert/strict";
import test from "node:test";
import { applyDrilldown, drilldownContext, drilldownDescriptor } from "../studio/drilldown-state.mjs";

const document = { sections: [{ id: "geo", title: "地域", components: [{
  id: "geo-chart", type: "chart", title: "收入", dataRef: "sales",
  binding: { kind: "series", categoryField: "region", valueField: "revenue", operation: "sum" },
  props: { labels: [], values: [], drilldown: { enabled: true, hierarchyId: "geo", targetScope: "component", levels: [{ field: "region", label: "区域" }, { field: "province", label: "省份" }, { field: "city", label: "城市" }] } }
}]}] };

test("derives the current level exclusively from the registered path", () => {
  assert.equal(drilldownDescriptor(document, "geo-chart").hierarchyId, "geo");
  assert.deepEqual(drilldownContext(document, {}, "geo-chart"), { ...drilldownDescriptor(document, "geo-chart"), path: [], level: 0, current: { field: "region", label: "区域" }, terminal: false });
  assert.equal(drilldownContext(document, null, "geo-chart").level, 0);
  assert.equal(drilldownContext({ sections: [{ id: "empty", components: [] }, ...document.sections] }, null, "geo-chart").level, 0);
});

test("advances, stops at the terminal level and returns to an earlier depth", () => {
  const region = applyDrilldown(document, {}, { componentId: "geo-chart", type: "advance", value: "华东" });
  assert.equal(region.context.current.field, "province");
  const province = applyDrilldown(document, region.interactions, { componentId: "geo-chart", type: "advance", value: "浙江" });
  assert.equal(province.context.current.field, "city");
  assert.equal(province.context.terminal, true);
  assert.equal(applyDrilldown(document, province.interactions, { componentId: "geo-chart", type: "advance", value: "杭州" }).status, "ignored");
  const back = applyDrilldown(document, province.interactions, { componentId: "geo-chart", type: "back", depth: 1 });
  assert.deepEqual(back.context.path, ["华东"]);
  assert.equal(back.context.current.field, "province");
});
