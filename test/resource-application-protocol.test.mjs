import assert from "node:assert/strict";
import test from "node:test";
import { chartApplicationMessage, readResourceContext, resourceCenterUrl, validateChartApplication } from "../studio/resource-application-protocol.mjs";

test("resource center only enables chart application for a complete chart target", () => {
  assert.equal(readResourceContext("http://localhost/studio/resources").canApplyChart, false);
  const url = resourceCenterUrl({ target: { id: "trend", type: "chart" }, session: "session-1" });
  assert.equal(url, "/studio/resources?target=trend&targetType=chart&session=session-1");
  assert.deepEqual(readResourceContext(`http://localhost${url}`), { targetId: "trend", targetType: "chart", session: "session-1", canApplyChart: true, canApplyIcon: true });
});

test("resource context and validation support card and section icons", async () => {
  const { iconApplicationMessage, validateIconApplication } = await import("../studio/resource-application-protocol.mjs");
  const sectionUrl = resourceCenterUrl({ target: { id: "sales", kind: "section" }, session: "session-2" });
  assert.equal(sectionUrl, "/studio/resources?target=sales&targetType=section&session=session-2");
  assert.equal(readResourceContext(`http://localhost${sectionUrl}`).canApplyIcon, true);
  const message = iconApplicationMessage({ iconName: "chart-line-up", targetId: "sales", targetType: "section", session: "session-2" });
  const valid = validateIconApplication(message, { selectedTarget: { id: "sales", targetType: "section" }, session: "session-2" });
  assert.equal(valid.ok, true);
  assert.equal(validateIconApplication({ ...message, iconName: "<svg>" }, { selectedTarget: { id: "sales", targetType: "section" }, session: "session-2" }).reason, "icon-name");
});

test("chart application requires the same session, selected chart and catalog type", () => {
  const message = chartApplicationMessage({ chartType: "rose", targetId: "trend", session: "session-1" });
  const context = { chartTypes: ["line", "rose"], selectedTarget: { id: "trend", type: "chart" }, session: "session-1" };
  assert.deepEqual(validateChartApplication(message, context), { ok: true, value: { chartType: "rose", targetId: "trend" } });
  assert.equal(validateChartApplication({ ...message, session: "wrong" }, context).reason, "session");
  assert.equal(validateChartApplication({ ...message, targetId: "other" }, context).reason, "target");
  assert.equal(validateChartApplication({ ...message, chartType: "unknown" }, context).reason, "chart-type");
});
