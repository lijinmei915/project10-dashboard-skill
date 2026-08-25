import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const buildScript = path.join(repoRoot, ".agents/skills/dashboard-html/scripts/build-studio-web.mjs");

async function walk(root, current = "") {
  const entries = await readdir(path.join(root, current), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = path.posix.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, relativePath));
    else files.push(relativePath);
  }
  return files;
}

function build(output) {
  const result = spawnSync(process.execPath, [buildScript, "--output", output], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("Studio Web build is deterministic, browser-only and independently deployable", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "dashboard-studio-web-"));
  try {
    const first = path.join(tempRoot, "first");
    const second = path.join(tempRoot, "second");
    build(first);
    build(second);

    const firstFiles = await walk(first);
    const secondFiles = await walk(second);
    assert.deepEqual(firstFiles, secondFiles);
    assert(firstFiles.includes("index.html"));
    assert(firstFiles.includes("studio/workspace-core-runtime.mjs"));
    assert(firstFiles.includes("studio/chart-spec-runtime.mjs"));
    assert(firstFiles.includes("studio/custom-chart-extension-runtime.mjs"));
    assert(firstFiles.includes("studio/client-echarts-runtime.mjs"));
    assert(firstFiles.includes("studio/kpi-sparkline-runtime.mjs"));
    assert(firstFiles.includes("vendor/echarts.mjs"));
    assert(firstFiles.includes("studio/resource-center.mjs"));
    assert(firstFiles.includes("studio/resource-application-protocol.mjs"));
    assert(firstFiles.includes("build-manifest.json"));
    assert(!firstFiles.some((name) => name.includes(".agents") || /(?:server|service|repository|test)\.mjs$/.test(name)));

    for (const relativePath of firstFiles) {
      const [firstBytes, secondBytes] = await Promise.all([
        readFile(path.join(first, relativePath)),
        readFile(path.join(second, relativePath))
      ]);
      assert.equal(digest(firstBytes), digest(secondBytes), `${relativePath} is not deterministic`);
      if (/\.(?:html|mjs|js)$/.test(relativePath)) {
        const source = firstBytes.toString("utf8");
        assert(!source.includes(".agents/"), `${relativePath} retains a repository-only import`);
        assert(!source.includes("DASHBOARD_AUTH_USERS_JSON"), `${relativePath} contains server configuration`);
      }
    }

    const html = await readFile(path.join(first, "index.html"), "utf8");
    assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), "Studio HTML must not contain inline scripts");
    assert(html.includes('id="aiPageTypeControls"'), "New project flow must expose page type selection");
    assert(!html.includes('aria-label="AI 生成配置摘要"'), "New project flow must not restore the passive generation summary");
    assert(html.includes('id="projectOwnership" aria-label="项目归属" hidden'), "Project ownership filtering must stay hidden until permission UI is enabled");
    assert(html.includes('id="kpiCardOrganizationControl"'), "KPI groups must expose card organization");
    assert(html.includes('id="kpiSparklineDisplayControl"'), "KPI controls must expose trend visibility");
    assert(html.includes('id="kpiSparklinePointsControl"'), "KPI controls must expose trend period");
    assert(html.includes('id="kpiSparklineStyleControl"'), "KPI controls must expose trend style");
    assert(html.includes('.metric:has(> .kpi-sparkline) > :is(strong, em) { max-width: 100%; }'), "Mobile KPI values must not share a row with their trend chart");
    assert(html.includes('.kpi-sparkline { position: absolute !important; right: var(--space); bottom: calc(var(--space) - 2px);'), "Desktop KPI trends must keep their bottom-right position after ECharts initialization");
    assert(html.includes('.kpi-sparkline { position: relative !important; right: auto; bottom: auto; width: 100%; height: 54px; margin-top: 12px; }'), "Mobile KPI trends must use stable in-flow dimensions");
    assert(html.includes('.hero-attribution .generated-data-separator'), "Dashboard must only hide the generated data-source separator");
    assert(!html.includes('.hero-attribution .attribution-separator,\n    .dashboard[data-page-type="dashboard"] .hero-attribution .attribution-item:last-child'), "Dashboard must keep the configured header metadata separator visible");
    assert(html.includes('data-kpi-card-organization="separate"'), "KPI cards must default to separate organization");
    assert(html.includes('[data-kpi-card-organization="joined"] .metric-grid'), "Joined KPI cards must have a visual contract");
    assert(html.includes('padding: var(--kpi-group-inset) !important'), "Joined KPI cards must keep equal inset spacing around the group surface");
    assert(html.includes('gap: var(--kpi-group-inset) !important'), "Joined KPI cards must keep consistent spacing between cards");
    assert(html.includes('--kpi-group-inset: var(--card-gap)'), "Joined KPI spacing must match the global card gap");
    assert(html.includes('> .section-heading { display: flex !important'), "Joined KPI cards must expose their section title as a card title");
    assert(html.includes('font-size: var(--card-title-size)'), "Joined KPI titles must inherit the card title size");
    const editorRuntime = await readFile(path.join(first, "studio/editor-runtime.js"), "utf8");
    assert(editorRuntime.includes('container.dataset.dataSource = usesMockData ? "mock" : "bound"'), "Sample KPI trends must remain distinguishable from bound history");
    assert(editorRuntime.includes('const mockData = (!documentModel || documentModel.sampleDataLabel) ? sampleKpiSparklines[component.id] : null'), "KPI mock trends must stay limited to built-in or explicitly labeled sample dashboards");
    assert(editorRuntime.includes('const data = component.props?.sparkline || mockData'), "Bound or materialized KPI history must take precedence over mock trends");
    assert(editorRuntime.includes('styles.getPropertyValue("--accent-structure")'), "KPI trends must follow the current theme accent independently from icon and card color modes");
    assert(editorRuntime.includes('createContextGroupLabel("趋势线", "kpi-trend-group-label")'), "Local KPI settings must expose a dedicated trend group");
    assert(editorRuntime.includes('from "/studio/kpi-sparkline-runtime.mjs"'), "Dashboard must load the controlled KPI trend runtime");
    assert(editorRuntime.includes("createStaticKpiSparklineSvg"), "Report must render KPI history without initializing client ECharts");
    assert(editorRuntime.includes('["separate", "joined"].includes(state.kpiCardOrganization)'), "KPI organization must validate restored state");
    assert(editorRuntime.includes("dashboard.dataset.kpiCardOrganization = state.kpiCardOrganization"), "KPI organization must apply to the canvas");
    assert(editorRuntime.includes('icon.classList.toggle("card-title-icon", usesCardTitleStyle)'), "Joined KPI title icons must use card title styling");
    assert(editorRuntime.includes('kpiCardOrganization: "joined",\n          kpiCardBackground: "multi"'), "Standard Dashboard must retain the accepted joined KPI presentation");
    assert(editorRuntime.includes('kpiIconColor: "colorful",\n          kpiIconContainer: "glow"'), "Standard Dashboard must retain the accepted colorful glow KPI icons");
    assert(editorRuntime.includes('kpiGlowStyleVersion: preset.kpiGlowStyleVersion ?? 1'), "Preset selection must preserve the current KPI glow contract");
    assert(editorRuntime.includes('headerMetaStyle: "surface"'), "Standard Dashboard must retain the accepted header metadata surface");
    const composerClient = await readFile(path.join(first, "studio/ai-composer-center.mjs"), "utf8");
    assert(composerClient.includes("pageType: generationPageType"), "Selected page type must be submitted to generation");
    assert(composerClient.includes('selectedPageType === "report" ? "analysis-report" : selectedPageType'), "Report creation must use the online report runtime");
    assert.equal((html.match(/name="aiPageType"/g) || []).length, 2, "New project flow must expose exactly Dashboard and Report choices");
    assert(!html.includes('data-value="analysis-report"'), "Visual settings must not expose an internal online report type");
    const projectCenter = await readFile(path.join(first, "studio/project-center.mjs"), "utf8");
    assert(projectCenter.includes("[ui.projectSort].forEach(mountProjectFilterSelect)"), "Hidden project ownership filtering must not mount a visible custom select");
    assert(projectCenter.includes('actionButton("删除", () => deleteProject(project), "destructive")'), "Project deletion must use the shared destructive button variant");
    assert(projectCenter.includes('button.disabled = true'), "Project actions must prevent duplicate submissions while pending");
    assert(projectCenter.includes('if (button.isConnected) button.disabled = false'), "Canceled or failed project actions must be retryable");
    assert(projectCenter.includes('cache: "no-store"'), "Project deletion must refresh metadata before optimistic deletion");
    const coreClient = await readFile(path.join(first, "studio/workspace-core-client.mjs"), "utf8");
    assert(coreClient.includes('from "./workspace-core-runtime.mjs"'));
    const chartSpecClient = await readFile(path.join(first, "studio/chart-spec-client.mjs"), "utf8");
    assert(chartSpecClient.includes('from "./chart-spec-runtime.mjs"'));
    const chartAdapter = await readFile(path.join(first, "studio/workspace-chart-adapter.mjs"), "utf8");
    assert(chartAdapter.includes('from "./client-echarts-runtime.mjs"'));

    const manifest = JSON.parse(await readFile(path.join(first, "build-manifest.json"), "utf8"));
    assert.equal(manifest.mountPath, "/");
    assert.equal(manifest.spaFallback, "/index.html");
    assert.deepEqual(Object.keys(manifest.assets).sort(), firstFiles.filter((name) => name !== "build-manifest.json").sort());
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
