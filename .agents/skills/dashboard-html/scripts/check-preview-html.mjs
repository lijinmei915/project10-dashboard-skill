import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const previewPath = path.resolve(scriptDir, "../../../../.dashboard-preset-preview.html");
const markup = await readFile(previewPath, "utf8");
const scripts = [...markup.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)].filter((match) => !/\ssrc=/.test(match[1] || "")).map((match) => match[2]);
const editorRuntimePath = path.resolve(scriptDir, "../../../../studio/editor-runtime.js");
const editorRuntime = await readFile(editorRuntimePath, "utf8");
const authSessionControllerPath = path.resolve(scriptDir, "../../../../studio/auth-session-controller.mjs");
const authSessionController = await readFile(authSessionControllerPath, "utf8");
const workspaceRendererPath = path.resolve(scriptDir, "../../../../studio/workspace-renderer.mjs");
const workspaceRenderer = await readFile(workspaceRendererPath, "utf8");
const workspaceControlRendererPath = path.resolve(scriptDir, "../../../../studio/workspace-control-renderer.mjs");
const workspaceControlRenderer = await readFile(workspaceControlRendererPath, "utf8");
const workspaceChartAdapterPath = path.resolve(scriptDir, "../../../../studio/workspace-chart-adapter.mjs");
const workspaceChartAdapter = await readFile(workspaceChartAdapterPath, "utf8");
const projectCenterPath = path.resolve(scriptDir, "../../../../studio/project-center.mjs");
const projectCenter = await readFile(projectCenterPath, "utf8");
const studioRouterPath = path.resolve(scriptDir, "../../../../studio/studio-router.mjs");
const studioRouter = await readFile(studioRouterPath, "utf8");
const studioApiClientPath = path.resolve(scriptDir, "../../../../studio/studio-api-client.mjs");
const studioApiClient = await readFile(studioApiClientPath, "utf8");
const publicationCenterPath = path.resolve(scriptDir, "../../../../studio/publication-center.mjs");
const publicationCenter = await readFile(publicationCenterPath, "utf8");
const dataSourceCenterPath = path.resolve(scriptDir, "../../../../studio/data-source-center.mjs");
const dataSourceCenter = await readFile(dataSourceCenterPath, "utf8");
const aiComposerCenterPath = path.resolve(scriptDir, "../../../../studio/ai-composer-center.mjs");
const aiComposerCenter = await readFile(aiComposerCenterPath, "utf8");
const exportCenterPath = path.resolve(scriptDir, "../../../../studio/export-center.mjs");
const exportCenter = await readFile(exportCenterPath, "utf8");
const workspaceSessionPath = path.resolve(scriptDir, "../../../../studio/workspace-session.mjs");
const workspaceSession = await readFile(workspaceSessionPath, "utf8");
const workspaceStateCorePath = path.resolve(scriptDir, "../../../../studio/workspace-state-core.mjs");
const workspaceStateCore = await readFile(workspaceStateCorePath, "utf8");
const workspaceCoreClientPath = path.resolve(scriptDir, "../../../../studio/workspace-core-client.mjs");
const workspaceCoreClient = await readFile(workspaceCoreClientPath, "utf8");
const workspaceLayoutInteractionPath = path.resolve(scriptDir, "../../../../studio/workspace-layout-interaction.mjs");
const workspaceLayoutInteraction = await readFile(workspaceLayoutInteractionPath, "utf8");
const workspaceLayoutControllerPath = path.resolve(scriptDir, "../../../../studio/workspace-layout-controller.mjs");
const workspaceLayoutController = await readFile(workspaceLayoutControllerPath, "utf8");
const workspaceStructureSynchronizerPath = path.resolve(scriptDir, "../../../../studio/workspace-structure-synchronizer.mjs");
const workspaceStructureSynchronizer = await readFile(workspaceStructureSynchronizerPath, "utf8");
const resourceApplicationProtocolPath = path.resolve(scriptDir, "../../../../studio/resource-application-protocol.mjs");
const resourceApplicationProtocol = await readFile(resourceApplicationProtocolPath, "utf8");
const html = `${markup}\n${editorRuntime}\n${workspaceRenderer}\n${workspaceControlRenderer}\n${workspaceChartAdapter}\n${workspaceSession}\n${workspaceStateCore}\n${workspaceLayoutInteraction}\n${workspaceLayoutController}\n${workspaceStructureSynchronizer}`;

if (scripts.length) throw new Error("Preview must not contain inline runtime scripts");
if (!/<script type="module" src="\/studio\/editor-runtime\.js(?:\?v=[^"]+)?"><\/script>/.test(markup)) throw new Error("Preview must load the Studio editor runtime as an ES module");
if (!editorRuntime.includes('import { composeWorkspaceSnapshot, normalizeWorkspaceSnapshot, workspaceSlices } from "/studio/workspace-state-core.mjs";')) throw new Error("Studio editor runtime must use the workspace state core");
if (!workspaceCoreClient.includes('export { diffWorkspaces, migrateWorkspace, validateWorkspace } from "../.agents/skills/dashboard-html/scripts/workspace-core.mjs";')) throw new Error("Studio workspace core client must reuse the shared portable core");
if (!workspaceStateCore.includes('import { migrateWorkspace, validateWorkspace } from "./workspace-core-client.mjs";')) throw new Error("Workspace state core must use the Studio core client boundary");
if (!editorRuntime.includes('import { createWorkspaceSession, PROJECT_STATE_SCRIPT_ID } from "/studio/workspace-session.mjs";')) throw new Error("Studio editor runtime must use the workspace session boundary");
if (!editorRuntime.includes('import { createAuthSessionController } from "/studio/auth-session-controller.mjs";') || !editorRuntime.includes("const studioAuth = createAuthSessionController({")) throw new Error("Studio editor runtime must delegate auth session orchestration");
if (!editorRuntime.includes('import { createWorkspaceRenderer } from "/studio/workspace-renderer.mjs";') || !editorRuntime.includes("workspaceRenderer.render(documentModel)")) throw new Error("Studio editor runtime must delegate document projection to the workspace renderer");
if (!editorRuntime.includes('import { createWorkspaceControlRenderer } from "/studio/workspace-control-renderer.mjs";') || !editorRuntime.includes("workspaceControlRenderer.render(controls, workspaceInteractions)")) throw new Error("Studio editor runtime must delegate interaction control projection to the control renderer");
if (!editorRuntime.includes('import { createWorkspaceChartAdapter } from "/studio/workspace-chart-adapter.mjs";') || !editorRuntime.includes("workspaceChartAdapter.render(component)")) throw new Error("Studio editor runtime must delegate asynchronous chart rendering to the chart adapter");
if (!editorRuntime.includes('from "/studio/workspace-layout-interaction.mjs";') || !editorRuntime.includes("reorderCanvasIds({") || !editorRuntime.includes("shouldStartPointerDrag(")) throw new Error("Studio editor runtime must use the layout interaction rules adapter");
if (!editorRuntime.includes('import { createWorkspaceLayoutController } from "/studio/workspace-layout-controller.mjs";') || !editorRuntime.includes("window.DashboardLayoutEditor = createWorkspaceLayoutController({")) throw new Error("Studio editor runtime must delegate layout config DOM mapping to the layout controller");
if (!editorRuntime.includes('import { createWorkspaceStructureSynchronizer } from "/studio/workspace-structure-synchronizer.mjs";') || !editorRuntime.includes("const workspaceStructureSynchronizer = createWorkspaceStructureSynchronizer({")) throw new Error("Studio editor runtime must delegate card structure coordination to the structure synchronizer");
if (!editorRuntime.includes("composeWorkspaceSnapshot({") || !editorRuntime.includes("const normalized = normalizeWorkspaceSnapshot(input);") || !editorRuntime.includes("workspaceSlices(saved)")) throw new Error("Studio editor runtime must compose and restore through the state core");
for (const forbidden of ["const workspace = migrateWorkspace(input);", "const validation = validateWorkspace(workspace);"]) {
  if (editorRuntime.includes(forbidden)) throw new Error(`Workspace migration and validation must not remain in the editor runtime: ${forbidden}`);
}
try { new Function(editorRuntime.replace(/^import[^\n]+\n/gm, "")); } catch (error) { throw new Error(`Studio editor runtime does not parse: ${error.message}`); }
try { new Function(authSessionController.replace(/^export /gm, "")); } catch (error) { throw new Error(`Studio auth session controller does not parse: ${error.message}`); }
if (!html.includes('<script type="module" src="/studio/project-center.mjs"></script>')) throw new Error("Preview must load the Studio Project Center module");
if (!html.includes('<script type="module" src="/studio/studio-router.mjs"></script>')) throw new Error("Preview must load the Studio Router module");
if (!html.includes('<script type="module" src="/studio/publication-center.mjs"></script>')) throw new Error("Preview must load the Studio Publication Center module");
if (!html.includes('<script type="module" src="/studio/data-source-center.mjs"></script>')) throw new Error("Preview must load the Studio Data Source Center module");
if (!html.includes('<script type="module" src="/studio/ai-composer-center.mjs"></script>')) throw new Error("Preview must load the Studio AI Composer Center module");
if (!html.includes('<script type="module" src="/studio/export-center.mjs"></script>')) throw new Error("Preview must load the Studio Export Center module");
if (!html.includes("window.DashboardStudioBridge = Object.freeze")) throw new Error("Preview must expose the narrow Studio workspace bridge");
if (!editorRuntime.includes('from "/studio/resource-application-protocol.mjs";') || !editorRuntime.includes("validateChartApplication(event.data")) throw new Error("Studio must validate resource applications through the shared protocol");
if (!resourceApplicationProtocol.includes('kind: "apply-chart"') || !resourceApplicationProtocol.includes("selectedTarget.id !== message.targetId")) throw new Error("Resource application protocol must bind chart actions to the current target");
if (html.includes("function openProjectDialog()") || html.includes("function renderProjects(projects)")) throw new Error("Project Center implementation must not remain in the preview runtime");
if (!projectCenter.includes('import { createStudioApiClient } from "/studio/studio-api-client.mjs";') || !projectCenter.includes("const { request } = createStudioApiClient();")) throw new Error("Project Center must use the shared Studio API client");
if (!projectCenter.includes("openOrganization, currentProjectId: () => bridge.getCurrentProject()?.id || null") || !studioRouter.includes("projectIdFromPath") || !studioRouter.includes('window.location.pathname === "/studio/organizations/current"')) throw new Error("Studio Router must use the narrow Project Center route boundary");
if (!projectCenter.includes("function beginAiProject()") || !projectCenter.includes("bridge.beginAiProject()") || !projectCenter.includes("DashboardAiComposerCenter?.setEmbedded(ui.projectComposerView") || !projectCenter.includes('addEventListener("dashboard-generation-job-started", closeProjectDialog)')) throw new Error("Project Center must embed AI input through the narrow bridge and close after Job creation");
if (!publicationCenter.includes('import { createStudioApiClient } from "/studio/studio-api-client.mjs";') || !publicationCenter.includes("const { request } = createStudioApiClient();")) throw new Error("Publication Center must use the shared Studio API client");
if (!publicationCenter.includes("async function openPublication(publicationId)") || !publicationCenter.includes("window.DashboardPublicationCenter = Object.freeze({ openDialog, openPublication })") || !studioRouter.includes("publicationIdFromPath") || !studioRouter.includes("dashboard-publication-center-ready")) throw new Error("Studio publication routes must delegate through the Publication Center boundary");
if (!dataSourceCenter.includes('import { createStudioApiClient } from "/studio/studio-api-client.mjs";') || !dataSourceCenter.includes("errorMessage: (payload) => payload.issues?.[0]?.message || payload.error || \"请求失败\"")) throw new Error("Data Source Center must use the shared Studio API client with its validation message policy");
if (!studioApiClient.includes("export function createStudioApiClient") || !studioApiClient.includes("return Object.freeze({ request, get, post, put, patch });")) throw new Error("Studio API client must expose the standard request methods");
if (html.includes("function openPublicationDialog()") || html.includes("function renderPublications(items)")) throw new Error("Publication Center implementation must not remain in the preview runtime");
if (html.includes("function dataSchemaSelect(") || html.includes("function enqueueRestRefresh()")) throw new Error("Data Source Center implementation must not remain in the preview runtime");
if (html.includes('aiComposerToggle.addEventListener("click"') || html.includes('document.querySelectorAll("[data-prompt-template]").forEach')) throw new Error("AI Composer shell implementation must not remain in the preview runtime");
if (html.includes("async function fetchRevisionExport()") || html.includes("async function downloadCleanReport()")) throw new Error("Export orchestration must not remain in the preview runtime");
try { new Function(projectCenter.replace(/^import[^\n]+\n/gm, "")); } catch (error) { throw new Error(`Studio Project Center module does not parse: ${error.message}`); }
try { new Function(studioRouter.replace(/^export /gm, "")); } catch (error) { throw new Error(`Studio Router module does not parse: ${error.message}`); }
try { new Function(studioApiClient.replace(/^export /gm, "")); } catch (error) { throw new Error(`Studio API Client module does not parse: ${error.message}`); }
try { new Function(publicationCenter.replace(/^import[^\n]+\n/gm, "")); } catch (error) { throw new Error(`Studio Publication Center module does not parse: ${error.message}`); }
try { new Function(dataSourceCenter.replace(/^import[^\n]+\n/gm, "")); } catch (error) { throw new Error(`Studio Data Source Center module does not parse: ${error.message}`); }
try { new Function(aiComposerCenter.replace(/^import[^\n]+\n/gm, "")); } catch (error) { throw new Error(`Studio AI Composer Center module does not parse: ${error.message}`); }
try { new Function(exportCenter); } catch (error) { throw new Error(`Studio Export Center module does not parse: ${error.message}`); }
try { new Function(workspaceSession.replace(/^export /gm, "")); } catch (error) { throw new Error(`Studio Workspace Session module does not parse: ${error.message}`); }
try { new Function(workspaceStateCore.replace(/^import[^\n]+\n/gm, "").replace(/^export /gm, "")); } catch (error) { throw new Error(`Studio Workspace State Core module does not parse: ${error.message}`); }
try { new Function(workspaceLayoutInteraction.replace(/^export /gm, "")); } catch (error) { throw new Error(`Studio Workspace Layout Interaction module does not parse: ${error.message}`); }
try { new Function(workspaceLayoutController.replace(/^export /gm, "")); } catch (error) { throw new Error(`Studio Workspace Layout Controller module does not parse: ${error.message}`); }
try { new Function(workspaceStructureSynchronizer.replace(/^export /gm, "")); } catch (error) { throw new Error(`Studio Workspace Structure Synchronizer module does not parse: ${error.message}`); }
try { new Function(workspaceRenderer.replace(/^export /gm, "")); } catch (error) { throw new Error(`Studio Workspace Renderer module does not parse: ${error.message}`); }
try { new Function(workspaceControlRenderer.replace(/^export /gm, "")); } catch (error) { throw new Error(`Studio Workspace Control Renderer module does not parse: ${error.message}`); }
try { new Function(workspaceChartAdapter.replace(/^export /gm, "")); } catch (error) { throw new Error(`Studio Workspace Chart Adapter module does not parse: ${error.message}`); }
for (const forbidden of ["function readWorkspaceState()", "function readUrlWorkspaceState()", "function writeUrlWorkspaceState(", "function readProjectState()"] ) {
  if (editorRuntime.includes(forbidden)) throw new Error(`Workspace persistence must not remain in the editor runtime: ${forbidden}`);
}
for (const forbidden of ["function setGeneratedText(", "function legacyWorkspaceDocumentProjectionRemoved("]) {
  if (editorRuntime.includes(forbidden)) throw new Error(`Workspace DOM projection must not remain in the editor runtime: ${forbidden}`);
}
for (const forbidden of ['bar.className = "dashboard-filter-bar"', 'tabs.className = "dashboard-view-tabs"']) {
  if (editorRuntime.includes(forbidden)) throw new Error(`Workspace control DOM must not remain in the editor runtime: ${forbidden}`);
}
for (const forbidden of ["async function renderWorkspaceChart(", 'fetch("/api/charts/render"']) {
  if (editorRuntime.includes(forbidden)) throw new Error(`Asynchronous chart rendering must not remain in the editor runtime: ${forbidden}`);
}
for (const forbidden of ["function nearestLayoutSpan(", "Math.hypot(moveEvent.clientX - startX", "const sameRow = Math.abs(event.clientY"]) {
  if (editorRuntime.includes(forbidden)) throw new Error(`Layout interaction rules must not remain in the editor runtime: ${forbidden}`);
}
for (const forbidden of ["getConfig: () => ({", "applyConfig: (config) =>", "const configuredSectionIds = new Set(config.sections"]) {
  if (editorRuntime.includes(forbidden)) throw new Error(`Layout config DOM mapping must not remain in the editor runtime: ${forbidden}`);
}
for (const forbidden of ["const desiredIds = new Set(documentModel.sections.flatMap", "const componentById = new Map(sectionModel.components", "const orderedIds = ["]) {
  if (editorRuntime.includes(forbidden)) throw new Error(`Workspace structure planning must not remain in the editor runtime: ${forbidden}`);
}
for (const contract of ["getExportContext()", "prepareRevision()", "setExportStatus(message)"]) {
  if (!html.includes(contract)) throw new Error(`Preview export bridge is missing: ${contract}`);
}
for (const contract of ["async function fetchRevisionExport()", "async function saveClean()", "window.DashboardFileExporter = Object.freeze"]) {
  if (!exportCenter.includes(contract)) throw new Error(`Studio Export Center contract is missing: ${contract}`);
}
for (const forbidden of ["serializeFallbackExport", "getCleanHtml", "兼容成品", "document.documentElement.cloneNode(true)"]) {
  if (html.includes(forbidden) || exportCenter.includes(forbidden)) throw new Error(`Studio export must be revision-only: ${forbidden}`);
}

for (const requiredId of ["aiComposer", "aiComposerToggle", "aiPromptInput", "aiGenerateButton", "aiReview", "dashboardPreview", "projectNewAi"]) {
  if (!html.includes(`id="${requiredId}"`)) throw new Error(`Preview is missing required AI Studio element: ${requiredId}`);
}
for (const requiredId of ["aiScope", "aiScopeName", "aiRefineTemplates", "aiChartRefineTemplates", "aiReviewDiff", "aiUndoButton", "aiHistoryCompare", "aiHistoryCompareList"]) {
  if (!html.includes(`id="${requiredId}"`)) throw new Error(`Preview is missing required AI refinement element: ${requiredId}`);
}
for (const contract of ["function syncAiComposerScope()", "getAiTransactionContext()", "applyAiPreview(workspace", "applyAiCommit(payload)", "applyAiUndo(payload)", "beginAiProject() {"]) {
  if (!html.includes(contract)) throw new Error(`Preview AI transaction bridge is missing: ${contract}`);
}
for (const contract of ['import { diffWorkspaces } from "/studio/workspace-core-client.mjs";', "function renderReview(run)", "async function requestCandidate()", "async function cancelActiveGeneration()", "function streamGenerationJob(jobId, token)", 'new EventSource(`/api/generation/jobs/${encodeURIComponent(jobId)}/events`)', "async function resumeGenerationJob()", "async function acceptCandidate()", "async function undoAcceptedChange()", "function compareRevision(revisionId)", "async function loadChartCatalog()", "function renderChartRefinementTemplates(charts)", 'fetch("/api/components/catalog"', 'fetch("/api/generation/jobs"', 'fetch("/api/generation/undo"']) {
  if (!aiComposerCenter.includes(contract)) throw new Error(`Studio AI transaction orchestration is missing: ${contract}`);
}
for (const forbidden of ["function renderAiReview(run)", "function requestAiDraft()", "function acceptAiDraft()", "function undoAcceptedAiChange()", 'fetch(isRefinement ? "/api/generation/refine"', 'fetch("/api/generation/undo"']) {
  if (html.includes(forbidden)) throw new Error(`AI transaction orchestration must not remain in the preview runtime: ${forbidden}`);
}
for (const requiredId of ["cardChartTypeField", "cardChartTypeControl", "cardChartPaletteField", "cardChartPaletteControl"]) {
  if (!html.includes(`id="${requiredId}"`)) throw new Error(`Preview is missing chart card control: ${requiredId}`);
}
for (const contract of ["function createPortableChartSvg(", "function renderWorkspaceCharts(", "function requestChartSvg(", 'fetcher("/api/charts/render"']) {
  if (!html.includes(contract)) throw new Error(`Preview chart runtime contract is missing: ${contract}`);
}
for (const [value, label] of [["line", "折线图"], ["time-series", "时序图"], ["area", "面积图"], ["bar", "基础柱图"], ["grouped-bar", "分组柱图"], ["stacked-bar", "堆叠柱图"], ["percent-stacked-bar", "百分比堆叠柱图"], ["histogram", "直方图"], ["horizontal-bar", "基础条图"], ["grouped-horizontal-bar", "分组条图"], ["stacked-horizontal-bar", "堆叠条图"], ["percent-stacked-horizontal-bar", "百分比堆叠条图"], ["diverging-bar", "双向条图"], ["ranking-bar", "排名图"], ["gantt", "甘特图"], ["sector-pie", "饼图"], ["pie", "环图"], ["rose", "玫瑰图"]]) {
  if (!html.includes(`<option value="${value}">${label}</option>`)) {
    throw new Error(`Chart card controls are missing the controlled option: ${value}/${label}`);
  }
}
for (const requiredId of ["customPresetSave", "customPresetRow", "customPresetList", "customPresetPopover", "customPresetUpdate", "customPresetRename", "customPresetDelete", "customPresetDialog"]) {
  if (!html.includes(`id="${requiredId}"`)) throw new Error(`Preview is missing custom preset control: ${requiredId}`);
}
if (!html.includes('aria-label="保存为自定义预设"') || !html.includes("function isCurrentCustomPresetModified()") || !html.includes('more.className = "custom-preset-more"')) {
  throw new Error("Custom presets must use a separate add command, direct tabs, and modified-state detection");
}
if (!html.includes('class="preset-strip"') || !html.includes('class="preset-strip-divider"') || html.includes('class="custom-preset-row-label"')) {
  throw new Error("Built-in and custom presets must share one compact strip separated without a second group label");
}
if (html.includes('>保存自定义</button>') || html.includes('window.prompt("自定义预设名称"') || html.includes('id="customPresetMenuTrigger"')) {
  throw new Error("Custom presets must not use the legacy command tab, prompt, or selection dropdown");
}
if (!exportCenter.includes("await bridge.prepareRevision()") || !exportCenter.includes('/api/projects/${encodeURIComponent(project.id)}')) throw new Error("Standalone export must save and request an immutable project revision");
if (!aiComposerCenter.includes('fetch("/api/generation/health"')) throw new Error("AI composer must check generation service availability");
if (!aiComposerCenter.includes("AI 生成服务未启动")) throw new Error("AI composer must show an actionable service error");
if (!html.includes('id="aiPromptInput"') || !html.includes('id="aiDraftTemplates"')) throw new Error("AI composer must keep an editable prompt and optional template mount point");
if (!html.includes("数据来源：${documentModel.sampleDataLabel}")) throw new Error("Sample provenance must render once in the header metadata");
if (!html.includes("sectionModel.subtitle === documentModel.sampleDataLabel")) throw new Error("Sample provenance must not repeat in section headings");
if (!html.includes("function syncInheritedOptionLabels()")) throw new Error("Inherited local options must expose their resolved global or group value");
if (!html.includes('if (workspaceDocument) applyWorkspaceDocument(workspaceDocument)')) throw new Error("Generated document content must survive visual refinements");
if (!html.includes('class="dashboard-controls"') || !html.includes("dashboard:filters-change")) throw new Error("Generated interaction controls and event contract must be present");
if (!html.includes('binding.kind === "aggregate"') || !html.includes("materializeWorkspaceDocumentForPreview")) throw new Error("Filter controls must materialize bound component data");
if (!html.includes('section.querySelectorAll(":scope > [data-item-id]")')) throw new Error("Ungrouped cards must remain represented in serialized layout sections");
if (!html.includes('.dashboard[data-page-type="report"] .report-body > .section,') || !html.includes('order: initial !important;')) {
  throw new Error("Report layout must ignore Dashboard canvas order and follow section DOM order");
}
if (/\.dashboard\[data-page-type="report"\][^{]*\.metric\s*\{[^}]*border:\s*0[;}]/.test(html)) {
  throw new Error("Report KPI cards must not override the global card border");
}
if (!html.includes('<span>卡片间距</span><select class="control-select" id="cardGapControl">')
  || !html.includes('<span>内容密度</span><span class="segmented" id="spacingControls">')
  || html.includes("<span>组内间距</span>")
  || html.includes("<span>组间距</span>")) {
  throw new Error("Layout controls must distinguish card gap from content density");
}
for (const contract of [
  'const pagePresetDefaults = {',
  '"fx-orange": {\n          accent: "#ff8000"',
  'radius: 10,\n          cardGap: 12,\n          cardTitleFont: 16,\n          cardSubtitle: "none"',
  'chartPalette: "categorical"',
  'const preset = { ...basePreset, ...(pagePresetDefaults[pageType]?.[name] || {}) }',
  'cardTitleFont: preset.cardTitleFont ?? 14, cardSubtitle: preset.cardSubtitle ?? "below"'
]) {
  if (!html.includes(contract)) throw new Error(`Dashboard standard preset contract is missing: ${contract}`);
}

console.log("Preview HTML contract OK: external editor runtime + 14 Studio modules, zero inline scripts");
