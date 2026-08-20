import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("resource center consumes shared catalogs and exposes all resource views", async () => {
  const [html, runtime, server, components, charts, standards, studioRuntime, studioHtml] = await Promise.all([
    readFile(path.join(root, ".studio-resources.html"), "utf8"),
    readFile(path.join(root, "studio/resource-center.mjs"), "utf8"),
    readFile(path.join(root, ".agents/skills/dashboard-html/scripts/preview-server.mjs"), "utf8"),
    readFile(path.join(root, ".agents/skills/dashboard-html/data/component-registry.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, ".agents/skills/dashboard-html/data/chart-catalog.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, ".agents/skills/dashboard-html/data/design-standards.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "studio/editor-runtime.js"), "utf8"),
    readFile(path.join(root, ".dashboard-preset-preview.html"), "utf8")
  ]);
  for (const tab of ["charts", "components", "icons", "guide"]) assert(html.includes(`data-tab="${tab}"`));
  for (const endpoint of ["/api/charts/catalog", "/api/components/catalog", "/api/icons/search", "/api/design/standards"]) assert(runtime.includes(endpoint));
  assert(server.includes('url.pathname === "/api/design/standards"'));
  assert.equal(components.length, 8);
  assert.equal(charts.length, 18);
  assert.deepEqual(standards.groups.map(({ id }) => id), ["color", "type", "space", "shape", "accessibility"]);
  assert(!runtime.includes("共 18 种图表"), "resource counts must come from catalogs");
  assert(studioHtml.includes('id="mobileCanvasToggle"') && studioHtml.includes('id="mobileSettingsReturn"'));
  assert(studioRuntime.includes('setMobileDesignView("canvas")') && studioRuntime.includes('setMobileDesignView("settings")'));
});
