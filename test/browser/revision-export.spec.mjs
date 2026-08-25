import { expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendProjectRevision, createProject } from "../../.agents/skills/dashboard-html/scripts/project-store.mjs";
import { createDeterministicDraft } from "../../.agents/skills/dashboard-html/scripts/draft-generator.mjs";
import { commitGenerationPreview } from "../../.agents/skills/dashboard-html/scripts/generation-pipeline.mjs";
import { exportProjectRevision } from "../../.agents/skills/dashboard-html/scripts/revision-exporter.mjs";
import { createXlsxFixture } from "../fixtures/xlsx-fixture.mjs";
import { createStudioAuthService } from "../../.agents/skills/dashboard-html/scripts/studio-auth-service.mjs";
import { startPreviewServer } from "../../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createDataSourceRepository } from "../../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";
import { createProjectRepository } from "../../.agents/skills/dashboard-html/scripts/studio-project-repository.mjs";
import { createJobRepository } from "../../.agents/skills/dashboard-html/scripts/studio-job-repository.mjs";
import { createRefreshScheduleRepository } from "../../.agents/skills/dashboard-html/scripts/studio-refresh-schedule-repository.mjs";
import { createOrganizationRepository } from "../../.agents/skills/dashboard-html/scripts/studio-organization-repository.mjs";
import { createOrganizationService } from "../../.agents/skills/dashboard-html/scripts/organization-service.mjs";
import { createPublicationRepository } from "../../.agents/skills/dashboard-html/scripts/studio-publication-repository.mjs";
import { createPublicationAccessRepository } from "../../.agents/skills/dashboard-html/scripts/studio-publication-access-repository.mjs";
import { createPublicationApprovalPolicy } from "../../.agents/skills/dashboard-html/scripts/publication-approval-policy.mjs";
import { createProviderFromEnv } from "../../.agents/skills/dashboard-html/scripts/provider-gateway.mjs";
import { createOrganizationProviderManager, createProviderProfileRepository } from "../../.agents/skills/dashboard-html/scripts/provider-profile-service.mjs";

const baseline = {
  version: 2,
  theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" },
  layout: { sections: [] },
  logo: null
};

const studioBuildScript = path.resolve(import.meta.dirname, "../../.agents/skills/dashboard-html/scripts/build-studio-web.mjs");

function buildStudioWeb(output) {
  const result = spawnSync(process.execPath, [studioBuildScript, "--output", output], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Studio Web build failed");
}

async function authenticateTokenSession(page, endpoint, token) {
  const response = await page.request.post(`${endpoint}/api/auth/login`, { data: { token } });
  expect(response.status()).toBe(200);
  await page.reload();
  await expect(page.locator("#studioAuthGate")).toBeHidden();
  if (await page.locator("#projectDialog").isVisible()) await page.locator("#projectDialogClose").click();
}

async function closeTokenSession(page, endpoint) {
  const response = await page.request.post(`${endpoint}/api/auth/logout`, { headers: { Origin: endpoint } });
  expect(response.status()).toBe(200);
  await page.goto(`${endpoint}/studio/projects?design=1&ci=token-session`);
  await expect(page.locator("#studioAuthGate")).toBeVisible();
}

async function acceptGeneratedPreview(page) {
  await expect(page.locator("#canvasGenerationAccept")).toBeVisible();
  await page.locator("#canvasGenerationAccept").click();
}

test("Studio token mode gates the app and applies viewer/editor sessions", async ({ page }) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-browser-auth-"));
  const studioWebRoot = path.join(root, "studio-web");
  buildStudioWeb(studioWebRoot);
  const users = [
    { id: "viewer-browser", name: "浏览用户", role: "viewer", token: "viewer-browser-token", organizationId: "default" },
    { id: "editor-browser", name: "编辑用户", role: "admin", token: "editor-browser-token", organizationId: "default" }
  ];
  const organizationRepository = createOrganizationRepository({ directory: path.join(root, "organizations") });
  const organizationService = createOrganizationService({ repository: organizationRepository, identities: users });
  const authService = createStudioAuthService({ mode: "token", users, organizationService });
  const provider = createOrganizationProviderManager({
    repository: createProviderProfileRepository({ configurationDirectory: path.join(root, "provider-profiles"), secretDirectory: path.join(root, "provider-secrets") }),
    fallbackProvider: createProviderFromEnv({}),
    fetchImpl: async (url) => url.endsWith("/models")
      ? new Response(JSON.stringify({ data: [{ id: "browser-model" }, { id: "browser-model-fast" }] }), { status: 200 })
      : new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { status: 200 })
  });
  const server = startPreviewServer({
    listenPort: 0, silent: true, authService, provider,
    projectRepository: createProjectRepository({ directory: path.join(root, "projects") }),
    dataSourceRepository: createDataSourceRepository({ directory: path.join(root, "datasets") }),
    jobRepository: createJobRepository({ directory: path.join(root, "jobs") }),
    refreshScheduleRepository: createRefreshScheduleRepository({ directory: path.join(root, "schedules") }),
    organizationRepository, organizationService, studioWebRoot
  });
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${endpoint}/studio/projects?design=1&ci=auth`);
    await expect(page.locator("#studioAuthGate")).toBeVisible();
    await expect(page.locator("#studioAuthForm")).toBeHidden();
    await expect(page.locator("#studioAuthStatus")).toContainText("旧版访问令牌");
    expect((await page.request.post(`${endpoint}/api/auth/login`, { data: { token: "wrong-token" } })).status()).toBe(401);
    await authenticateTokenSession(page, endpoint, "viewer-browser-token");
    await expect(page.locator("body")).toHaveAttribute("data-actor-role", "viewer");
    await expect(page.locator("#aiComposer")).toBeHidden();
    const viewerStatus = await page.request.get(`${endpoint}/api/auth/status`);
    expect((await viewerStatus.json()).actor.role).toBe("viewer");
    await closeTokenSession(page, endpoint);
    await authenticateTokenSession(page, endpoint, "editor-browser-token");
    await expect(page.locator("body")).toHaveAttribute("data-actor-role", "admin");
    await expect(page.locator("#aiComposer")).toBeVisible();
    await page.locator("#studioProjectControl").click();
    await page.locator("#projectNewAi").click();
    await page.locator("#aiPromptInput").fill("生成团队权限验收 Dashboard");
    await page.locator("#aiGenerateButton").click();
    await expect(page.locator("#canvasGenerationAccept")).toBeVisible();
    await page.locator("#canvasGenerationAccept").click();
    await expect(page.locator("#aiGenerationStatus")).toContainText("已接受");
    await page.goto(`${endpoint}/studio/organizations/current?design=1&ci=auth-organization`);
    await expect(page.locator("#studioAuthGate")).toBeHidden();
    await expect(page.locator("#projectDialog")).toBeVisible();
    await expect(page.locator("#organizationDialog")).toBeHidden();
    await expect(page.locator("#projectSettingsView")).toBeVisible();
    await expect(page.locator("#organizationControl")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".organization-metrics")).toBeHidden();
    await expect(page.locator(".organization-readiness")).toBeHidden();
    await expect(page.locator("#organizationMemberList")).toBeHidden();
    await expect(page.locator("#organizationProviderSelect")).toHaveValue("deterministic-local");
    await expect(page.locator("#organizationProviderTest")).toBeDisabled();
    await expect(page.locator("#organizationProviderModels")).toBeDisabled();
    await page.getByRole("button", { name: "新增连接" }).click();
    await expect(page.locator("#providerProfileDialog")).toBeVisible();
    await page.locator("#providerProfileName").fill("浏览器测试模型");
    await page.locator("#providerProfileApiBase").fill("https://browser-provider.example/v1");
    await page.locator("#providerProfileApiKey").fill("browser-provider-secret");
    await page.locator("#providerProfileLoadModels").click();
    await expect(page.locator("#providerProfileModel")).toContainText("browser-model-fast");
    await page.locator("#providerProfileModel").selectOption("browser-model-fast");
    await page.locator("#providerProfileSave").click();
    await expect(page.locator("#providerProfileDialog")).toBeVisible();
    await expect(page.locator("#organizationProviderSelect")).toHaveValue(/provider-/);
    await expect(page.locator("#providerProfileStatus")).toContainText("已保存并启用");
    await expect(page.locator("#organizationProviderCurrentModel")).toContainText("browser-model-fast");
    await page.locator("#organizationProviderTest").click();
    await expect(page.locator("#organizationProviderStatus")).toContainText("连接正常");
    await page.setViewportSize({ width: 390, height: 844 });
    const metricsOverflow = await page.locator("#organizationMetricsGrid").evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(metricsOverflow).toBeLessThanOrEqual(1);
    const readinessOverflow = await page.locator("#organizationReadinessGrid").evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(readinessOverflow).toBeLessThanOrEqual(1);
    const providerOverflow = await page.locator(".organization-provider").evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(providerOverflow).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1440, height: 900 });
    page.once("dialog", (dialog) => dialog.accept());
    const activeProviderCard = page.locator('.provider-connection-card[data-active="true"]');
    await activeProviderCard.hover();
    await expect(activeProviderCard.locator(".provider-card-delete")).toBeVisible();
    await activeProviderCard.locator(".provider-card-delete").click();
    await expect(page.locator("#organizationProviderSelect")).toHaveValue("deterministic-local");
    await expect(page.locator("#organizationProviderStatus")).toContainText("本地演示模式");
    await page.locator("#projectDialogClose").click();
    await page.locator("#studioProjectControl").click();
    await expect(page.locator("#organizationControl")).toBeVisible();
    await page.locator("#organizationControl").click();
    await expect(page.locator("#organizationDialog")).toBeHidden();
    await expect(page.locator("#projectSettingsView")).toBeVisible();
    await expect(page.locator("#organizationMemberList")).toBeHidden();
    await expect(page.locator("#organizationAudit")).toBeHidden();
    await page.locator("#projectListTab").click();
    const editorProjectId = await page.evaluate(() => window.DashboardProjectCenter.currentProjectId());
    const editorProjectResponse = await page.request.get(`${endpoint}/api/projects/${encodeURIComponent(editorProjectId)}`);
    const editorProject = (await editorProjectResponse.json()).project;
    const grantResponse = await page.request.put(`${endpoint}/api/projects/${encodeURIComponent(editorProjectId)}/access`, {
      headers: { Origin: endpoint },
      data: { expectedUpdatedAt: editorProject.updatedAt, members: [{ actorId: "viewer-browser", role: "viewer" }] }
    });
    expect(grantResponse.status()).toBe(200);
    await page.locator("#projectDialogClose").click();
    await closeTokenSession(page, endpoint);
    await authenticateTokenSession(page, endpoint, "viewer-browser-token");
    expect((await page.request.get(`${endpoint}/api/generation/metrics`)).status()).toBe(403);
    const viewerProviders = await page.request.get(`${endpoint}/api/ai-providers`);
    expect(viewerProviders.status()).toBe(200);
    expect(JSON.stringify(await viewerProviders.json())).not.toContain("apiKey");
    await page.locator("#studioProjectControl").click();
    await expect(page.locator("#organizationControl")).toBeVisible();
    const viewerProject = page.locator(".project-row").first();
    await expect(viewerProject).toBeVisible();
    await expect(viewerProject.getByRole("button", { name: "成员" })).toHaveCount(0);
    await expect(viewerProject.getByRole("button", { name: "复制" })).toHaveCount(0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("Studio shows pending publication approval and activates the original link after admin approval", async ({ page }) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-browser-publication-approval-"));
  const users = [
    { id: "approval-editor-browser", name: "审批编辑者", role: "editor", token: "approval-editor-browser-token", organizationId: "approval-org" },
    { id: "approval-admin-browser", name: "审批管理员", role: "admin", token: "approval-admin-browser-token", organizationId: "approval-org" }
  ];
  const organizationRepository = createOrganizationRepository({ directory: path.join(root, "organizations") });
  const organizationService = createOrganizationService({ repository: organizationRepository, identities: users });
  const authService = createStudioAuthService({ mode: "token", users, organizationService });
  const server = startPreviewServer({
    listenPort: 0,
    silent: true,
    authService,
    organizationRepository,
    organizationService,
    projectRepository: createProjectRepository({ directory: path.join(root, "projects") }),
    dataSourceRepository: createDataSourceRepository({ directory: path.join(root, "datasets") }),
    publicationRepository: createPublicationRepository({ directory: path.join(root, "publications") }),
    publicationAccessRepository: createPublicationAccessRepository({ directory: path.join(root, "publication-access") }),
    jobRepository: createJobRepository({ directory: path.join(root, "jobs") }),
    refreshScheduleRepository: createRefreshScheduleRepository({ directory: path.join(root, "schedules") }),
    publicationApprovalPolicy: createPublicationApprovalPolicy({ organizationIds: ["approval-org"] })
  });
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${endpoint}/.dashboard-preset-preview.html?design=1&ci=publication-approval`);
    await authenticateTokenSession(page, endpoint, "approval-editor-browser-token");
    await page.locator("#studioProjectControl").click();
    await page.locator("#projectNewAi").click();
    await page.locator("#aiPromptInput").fill("生成待审批销售看板");
    await page.locator("#aiGenerateButton").click();
    await expect(page.locator("#canvasGenerationAccept")).toBeVisible();
    await page.locator("#canvasGenerationAccept").click();
    await page.locator("#designPublishControl").click();
    await page.locator("#publicationVisibility").selectOption("unlisted");
    await page.locator("#publicationSubmit").click();
    await expect(page.locator("#publicationStatus")).toContainText("已提交审批");
    await expect(page.locator("#publicationList .publication-row strong")).toContainText("待审批");
    await expect(page.getByRole("button", { name: "批准发布" })).toHaveCount(0);
    const shareUrl = await page.locator("#publicationShareInput").inputValue();
    expect((await page.request.get(shareUrl)).status()).toBe(404);
    await page.locator("#publicationClose").click();
    await closeTokenSession(page, endpoint);
    await authenticateTokenSession(page, endpoint, "approval-admin-browser-token");
    await page.locator("#designPublishControl").click();
    await expect(page.locator("#publicationList .publication-row strong")).toContainText("待审批");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "批准发布" }).click();
    await expect(page.locator("#publicationStatus")).toContainText("发布已批准");
    await expect(page.locator("#publicationList .publication-row strong")).toContainText("已发布");
    expect((await page.request.get(shareUrl)).status()).toBe(200);
    await page.locator("#publicationClose").click();
    const auditResponse = await page.request.get(`${endpoint}/api/audit-events`);
    expect(auditResponse.status()).toBe(200);
    const auditActions = (await auditResponse.json()).events.map(({ action }) => action);
    expect(auditActions).toContain("publication.submitted");
    expect(auditActions).toContain("publication.approved");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("revision artifact keeps filters, tabs, and responsive layout", async ({ page }, testInfo) => {
  const run = createDeterministicDraft({
    id: "browser-export-ci",
    prompt: "生成销售经营看板，支持区域筛选和视图切换",
    language: "zh",
    pageType: "dashboard",
    dataInputs: []
  }, baseline, { runId: "run-browser-export-ci", now: "2026-08-10T05:00:00.000Z" });
  const committed = commitGenerationPreview(run, { revisionId: "revision-browser-export-ci", at: "2026-08-10T05:00:01.000Z" });
  const project = appendProjectRevision(createProject({ id: "project-browser-export-ci", name: "浏览器导出验收", createdAt: "2026-08-10T05:00:00.000Z" }), committed.revision);
  const artifact = exportProjectRevision(project);
  const output = testInfo.outputPath("dashboard.html");
  await writeFile(output, artifact.html);

  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`file://${output}`);
  const kpi = page.locator('[data-component-id="opportunity-value"] .kpi-value');
  await expect(kpi).toHaveText("3,750 万");
  await page.locator('[data-dashboard-filter="region"]').selectOption("east");
  await expect(kpi).toHaveText("1,110 万");
  const eastChart = await page.locator('[data-component-id="opportunity-trend"] .chart').innerHTML();
  await page.locator('[data-dashboard-filter="region"]').selectOption("south");
  await expect.poll(() => page.locator('[data-component-id="opportunity-trend"] .chart').innerHTML()).not.toBe(eastChart);

  await page.locator("[data-dashboard-view]").nth(1).click();
  await expect(page.locator("[data-section-id][hidden]")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  expect(errors).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await expect(page.locator("[data-dashboard-root]")).toBeVisible();
});

test("Studio synchronizes added and removed workspace sections before revision export", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/.dashboard-preset-preview.html?design=1&ci=section-structure");
  await page.locator("#aiComposerToggle").click();
  await page.locator("#aiPromptInput").fill("生成销售经营看板");
  await page.locator("#aiGenerateButton").click();
  await expect(page.locator("#aiReview")).toBeVisible();
  await acceptGeneratedPreview(page);
  await expect(page.locator("#aiGenerationStatus")).toContainText("已接受");
  const baseWorkspace = await page.evaluate(() => window.DashboardStudioBridge.getAiTransactionContext().currentWorkspace);
  await page.evaluate((workspace) => {
    const next = structuredClone(workspace);
    next.document.sections.push({
      id: "appendix",
      title: "附录说明",
      subtitle: "口径与范围",
      components: [{ id: "appendix-note", type: "text", title: "阅读说明", props: { body: "此分区由 Workspace 结构同步创建。" } }]
    });
    next.layout.sections.push({ id: "appendix", grouped: false, span: 12, layout: null, items: [{ id: "appendix-note", span: 12 }] });
    next.layout.canvasOrder = [...(next.layout.canvasOrder || []), "appendix-note"];
    window.DashboardStudioBridge.applyAiPreview(next);
  }, baseWorkspace);

  const appendix = page.locator('[data-section-id="appendix"]');
  await expect(appendix.locator(":scope > .section-heading h2")).toHaveText("附录说明");
  await expect(appendix.locator('[data-item-id="appendix-note"] .workspace-text-body')).toContainText("结构同步创建");
  const artifact = await page.evaluate(() => window.DashboardFileExporter.getRevisionHtml());
  expect(artifact.html).toContain("附录说明");
  expect(artifact.html).toContain("此分区由 Workspace 结构同步创建。");

  await page.evaluate((workspace) => window.DashboardStudioBridge.applyAiPreview(workspace), baseWorkspace);
  await expect(appendix).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Studio pointer drag reorders dashboard cards and clears transient state", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/.dashboard-preset-preview.html?design=1&ci=layout-pointer");
  const source = page.locator('[data-item-id="customer-health"]');
  const target = page.locator('[data-item-id="opportunity-trend"]');
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  const order = () => page.evaluate(() => [...document.querySelectorAll(".report-body > .section[data-grouped='true'], .report-body > .section[data-grouped='false'] > .layout-group > .layout-item[data-item-id]")]
    .sort((left, right) => Number(left.style.order) - Number(right.style.order))
    .map((element) => element.dataset.sectionId ? `group:${element.dataset.sectionId}` : element.dataset.itemId));
  expect(await order()).toEqual(["group:metrics", "opportunity-trend", "source-ranking", "customer-health", "risk-items"]);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + 42);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 20, { steps: 16 });
  await expect(source).toHaveClass(/layout-pointer-dragging/);
  await expect(target).toHaveClass(/layout-drop-target/);
  await page.mouse.up();
  await expect.poll(order).toEqual(["group:metrics", "customer-health", "opportunity-trend", "source-ranking", "risk-items"]);
  await expect(page.locator(".layout-grid-placeholder")).toHaveCount(0);
  await expect(page.locator(".layout-dragging, .layout-pointer-dragging")).toHaveCount(0);
  await expect(page.locator("#designSaveStatus")).toContainText("有未保存更改");
  await page.locator("#designSaveControl").click();
  await expect(page.locator("#designSaveStatus")).toContainText("已保存到本地");
  await page.reload();
  await expect.poll(order).toEqual(["group:metrics", "customer-health", "opportunity-trend", "source-ranking", "risk-items"]);
  expect(await page.locator("html").getAttribute("data-runtime-error")).toBeNull();
  expect(errors).toEqual([]);
});

test("Studio project center opens, renames, copies, and keeps Report creation behind its API", async ({ page, context }) => {
  const run = createDeterministicDraft({ id: "project-center-ci", prompt: "生成项目中心验收看板", language: "zh", pageType: "dashboard", dataInputs: [] }, baseline, { runId: "run-project-center-ci", now: "2026-08-10T06:00:00.000Z" });
  const committed = commitGenerationPreview(run, { revisionId: "revision-project-center-ci", at: "2026-08-10T06:00:01.000Z" });
  const project = appendProjectRevision(createProject({ id: "project-center-ci", name: "项目中心验收", createdAt: "2026-08-10T06:00:00.000Z" }), committed.revision);
  expect((await page.request.post("/api/projects/project-center-ci/migrate", { data: { project } })).status()).toBe(201);
  await page.goto("/studio/projects/project-center-ci?design=1&ci=project-center");
  await expect(page.locator("#studioProjectControl")).toBeVisible();
  await expect(page.locator("#studioProjectLabel")).toHaveText("项目 / AI");
  await expect(page.locator("#studioProjectControl")).toHaveAttribute("title", "项目中心验收");
  await expect(page.locator(".hero-title")).toHaveText(committed.revision.workspace.document.title);
  await expect(page).toHaveURL(/\/studio\/projects\/project-center-ci/);

  await page.locator("#studioProjectControl").click();
  const row = page.locator(".project-row", { hasText: "项目中心验收" });
  await expect(row).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept("重命名后的项目"));
  await page.locator(".project-row", { hasText: "项目中心验收" }).getByRole("button", { name: "重命名" }).click();
  await expect(page.locator("#studioProjectControl")).toHaveAttribute("title", "重命名后的项目");
  page.once("dialog", (dialog) => dialog.accept("独立项目副本"));
  await page.locator(".project-row", { hasText: "重命名后的项目" }).getByRole("button", { name: "复制" }).click();
  await expect(page.locator(".project-row", { hasText: "独立项目副本" })).toBeVisible();

  await expect(page.locator(".project-row", { hasText: "重命名后的项目" }).getByRole("button", { name: "生成报告" })).toHaveCount(0);
  const reportResponse = await page.request.post(`/api/projects/${project.id}/report-copy`, { data: { id: "project-center-report-copy", name: "固定经营报告" } });
  expect(reportResponse.status()).toBe(201);
  const reportProject = (await reportResponse.json()).project;
  expect(reportProject.id).not.toBe(project.id);
  expect(reportProject.name).toBe("固定经营报告");
  expect(reportProject.revisions).toHaveLength(1);
  const reportWorkspace = reportProject.revisions[0].workspace;
  expect(reportWorkspace.theme.pageType).toBe("report");
  expect(reportWorkspace.interactions).toBeUndefined();
  expect(reportWorkspace.resources?.datasets).toBeUndefined();
  expect(reportWorkspace.document.controls).toBeUndefined();
  expect(reportWorkspace.document.sections.flatMap(({ components }) => components).every((component) => !component.binding && !component.dataRef && !component.props.refreshPolicy)).toBe(true);

  const reportRequests = [];
  const reportPage = await context.newPage();
  reportPage.on("request", (request) => reportRequests.push(request.url()));
  await reportPage.goto(`/studio/projects/${reportProject.id}?design=1`);
  await expect(reportPage.locator(".dashboard")).toHaveAttribute("data-page-type", "report");
  await expect(reportPage.locator("[data-chart-rendered=true] .chart-render svg").first()).toBeVisible();
  expect(await reportPage.locator("[data-chart-rendered=true] .chart-render canvas").count()).toBe(0);
  expect(reportRequests.filter((url) => url.endsWith("/vendor/echarts.mjs"))).toEqual([]);
  await reportPage.setViewportSize({ width: 390, height: 844 });
  expect(await reportPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await reportPage.locator("#designDrawerClose").click();
  await expect(reportPage.locator("#designDrawer")).toHaveAttribute("aria-hidden", "true");
  await reportPage.waitForTimeout(250);
  await reportPage.screenshot({ path: "/tmp/dashboard-m6-report-copy-mobile.png", fullPage: true });

  const dashboardRequests = [];
  reportPage.on("request", (request) => dashboardRequests.push(request.url()));
  await reportPage.goto(`/studio/projects/${project.id}?design=1`);
  await expect(reportPage.locator(".dashboard")).toHaveAttribute("data-page-type", "dashboard");
  await expect(reportPage.locator("[data-chart-rendered=true] .chart-render canvas").first()).toBeVisible();
  expect(dashboardRequests.some((url) => url.endsWith("/vendor/echarts.mjs"))).toBe(true);
  const originalAfterReport = await reportPage.evaluate(() => window.DashboardStudioBridge.getCurrentProject());
  expect(originalAfterReport.id).toBe(project.id);
  expect(originalAfterReport.revisions).toHaveLength(1);
  await reportPage.close();

  const cleanHtml = (await page.evaluate(() => window.DashboardFileExporter.getRevisionHtml())).html;
  expect(cleanHtml).not.toContain("project-center.mjs");
  expect(cleanHtml).not.toContain("studio-router.mjs");
  expect(cleanHtml).not.toContain("publication-center.mjs");
  expect(cleanHtml).not.toContain("data-source-center.mjs");
  expect(cleanHtml).not.toContain("ai-composer-center.mjs");
  expect(cleanHtml).not.toContain("export-center.mjs");
  expect(cleanHtml).not.toContain("editor-runtime.js");
  expect(cleanHtml).not.toContain("studioProjectControl");
  expect(cleanHtml).not.toContain("memberDialog");
  expect(cleanHtml).not.toContain("organizationDialog");
  expect(cleanHtml).not.toContain("AI 运行概览");
});

test("Studio starts a new AI project without persisting an empty project", async ({ page }) => {
  await page.goto("/.dashboard-preset-preview.html?design=1&ci=new-ai-project");
  await page.locator("#aiComposerToggle").click();
  await page.locator("#aiPromptInput").fill("生成销售经营看板");
  await page.locator("#aiGenerateButton").click();
  await expect(page.locator("#aiReview")).toBeVisible();
  await acceptGeneratedPreview(page);
  await expect(page.locator("#aiGenerationStatus")).toContainText("已接受");
  const previousProjectId = await page.evaluate(() => window.DashboardStudioBridge.getCurrentProject()?.id);
  expect(previousProjectId).toBeTruthy();

  await page.locator("#studioProjectControl").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#projectNewAi").click();
  await expect(page.locator("#projectDialog")).toBeVisible();
  await expect(page.locator("#projectComposerView")).toBeVisible();
  await expect(page.locator("#aiComposer")).toHaveAttribute("data-embedded", "true");
  await expect(page.locator("#aiComposer")).toHaveAttribute("data-open", "true");
  await expect.poll(() => page.evaluate(() => window.DashboardStudioBridge.getCurrentProject())).toBeNull();

  await page.locator("#aiPromptInput").fill("生成项目交付 Dashboard，展示里程碑和风险");
  await page.locator("#aiGenerateButton").click();
  await expect(page.locator("#aiReview")).toBeVisible();
  await acceptGeneratedPreview(page);
  await expect(page.locator("#aiGenerationStatus")).toContainText("已接受");
  const nextProject = await page.evaluate(() => window.DashboardStudioBridge.getCurrentProject());
  expect(nextProject.id).not.toBe(previousProjectId);
  expect(nextProject.revisions).toHaveLength(1);
});

test("Studio refines a selected section and atomically undoes the accepted revision", async ({ page }) => {
  await page.goto("/.dashboard-preset-preview.html?design=1&ci=section-refine");
  await page.locator("#aiComposerToggle").click();
  await page.locator("#aiPromptInput").fill("生成销售经营看板，展示指标和趋势");
  await page.locator("#aiGenerateButton").click();
  await expect(page.locator("#aiReview")).toBeVisible();
  await acceptGeneratedPreview(page);
  await expect(page.locator("#aiGenerationStatus")).toContainText("已接受");

  const trends = page.locator('[data-section-id="trends"]:visible');
  await trends.locator(":scope > .layout-section-handle").evaluate((handle) => handle.click());
  await page.locator("#aiComposerToggle").click();
  await expect(page.locator("#aiComposerTitle")).toHaveText("AI 修改分区");
  await expect(page.locator("#aiScope")).toContainText("当前分区");
  await expect(page.locator("#aiScopeName")).toHaveText("趋势与来源");
  await expect(page.locator('[data-section-refine]')).toHaveCount(2);
  await page.locator("#aiPromptInput").fill("分区标题改为“转化分析”");
  await page.locator("#aiGenerateButton").click();
  await expect(page.locator("#aiReview")).toBeVisible();
  await expect(page.locator("#aiReviewDiff")).toContainText("趋势与来源 → 转化分析");
  await acceptGeneratedPreview(page);
  await expect(page.locator("#aiGenerationStatus")).toContainText("已接受");
  await expect(trends.locator(":scope > .section-heading h2")).toHaveText("转化分析");
  const artifact = await page.evaluate(() => window.DashboardFileExporter.getRevisionHtml());
  expect(artifact.html).toContain("转化分析");

  if (await page.locator("#aiComposer").getAttribute("data-open") === "false") await page.locator("#aiComposerToggle").click();
  await page.locator("#aiUndoButton").click();
  await expect(page.locator("#aiGenerationStatus")).toContainText("已整体撤销本次 AI 修改");
  await expect(trends.locator(":scope > .section-heading h2")).toHaveText("趋势与来源");
});

test("Studio export saves an unsaved workspace as an immutable revision before download", async ({ page }) => {
  await page.goto("/.dashboard-preset-preview.html?design=1&ci=revision-only-export");
  await page.locator("#aiComposerToggle").click();
  await page.locator("#aiPromptInput").fill("生成客户经营看板，展示收入趋势和客户排行");
  await page.locator("#aiGenerateButton").click();
  await expect(page.locator("#aiReview")).toBeVisible();
  await acceptGeneratedPreview(page);
  await expect(page.locator("#aiGenerationStatus")).toContainText("已接受");
  const acceptedRevisionId = (await page.evaluate(() => window.DashboardStudioBridge.getExportContext())).revision.id;
  await page.locator('[data-item-id="opportunity-trend"]').click({ position: { x: 80, y: 50 } });
  await page.getByRole("combobox", { name: "图表类型" }).click();
  await page.getByRole("option", { name: "面积图" }).click();
  await page.evaluate(() => Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined }));

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#designDownloadControl").click();
  const download = await downloadPromise;
  const context = await page.evaluate(() => window.DashboardStudioBridge.getExportContext());
  expect(context.project?.id).toBeTruthy();
  expect(context.revision?.id).toMatch(/^revision-user-/);
  expect(context.revision.id).not.toBe(acceptedRevisionId);
  expect(context.project.currentRevisionId).toBe(context.revision.id);
  await expect(page.locator("#designSaveStatus")).toContainText(`已导出版本 ${context.revision.id}`);

  const html = await readFile(await download.path(), "utf8");
  expect(download.suggestedFilename()).toContain("版本成品.html");
  expect(html).toMatch(/^<!DOCTYPE html>/);
  expect(html).not.toMatch(/editor-runtime|export-center|design-drawer|serializeFallbackExport/);
});

test("Studio rejects a stale manual save and explicitly reloads the latest project revision", async ({ page }) => {
  const run = createDeterministicDraft({ id: "project-concurrency-ci", prompt: "生成并发验收看板", language: "zh", pageType: "dashboard", dataInputs: [] }, baseline, { runId: "run-project-concurrency-ci", now: "2026-08-11T06:00:00.000Z" });
  const committed = commitGenerationPreview(run, { revisionId: "revision-project-concurrency-ci", at: "2026-08-11T06:00:01.000Z" });
  const project = appendProjectRevision(createProject({ id: "project-concurrency-ci", name: "并发版本验收", createdAt: "2026-08-11T06:00:00.000Z" }), committed.revision);
  expect((await page.request.post("/api/projects/project-concurrency-ci/migrate", { data: { project } })).status()).toBe(201);

  const secondPage = await page.context().newPage();
  try {
    await Promise.all([
      page.goto("/.dashboard-preset-preview.html?design=1&ci=project-concurrency-first"),
      secondPage.goto("/.dashboard-preset-preview.html?design=1&ci=project-concurrency-second")
    ]);
    for (const candidate of [page, secondPage]) {
      await candidate.locator("#studioProjectControl").click();
      await candidate.locator(".project-row", { hasText: "并发版本验收" }).getByRole("button", { name: "打开" }).click();
      await expect(candidate.locator("#studioProjectLabel")).toHaveText("项目 / AI");
      await expect(candidate.locator("#studioProjectControl")).toHaveAttribute("title", "并发版本验收");
    }

    await page.locator("#headerTitleFontControl").fill("33");
    await page.locator("#designSaveControl").click();
    await expect(page.locator("#designSaveStatus")).toContainText("已保存版本");

    await secondPage.locator("#headerTitleFontControl").fill("34");
    await secondPage.locator("#designSaveControl").click();
    await expect(secondPage.locator("#designSaveStatus")).toContainText("项目已有更新");
    await expect(secondPage.locator("#designSaveControl")).toBeEnabled();

    await secondPage.locator("#studioProjectControl").click();
    secondPage.once("dialog", (dialog) => dialog.accept());
    await secondPage.locator(".project-row", { hasText: "并发版本验收" }).getByRole("button", { name: "重新加载" }).click();
    await expect(secondPage.locator("#projectDialog")).toBeHidden();
    await expect(secondPage.locator("#headerTitleFontControl")).toHaveValue("33");
    await expect(secondPage.locator("#designSaveStatus")).toContainText("已打开 并发版本验收");
  } finally {
    await secondPage.close();
  }
});

test("Studio accepts a natural-language draft and exports its committed revision", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/.dashboard-preset-preview.html?design=1&ci=revision-export");
  await page.locator("#aiComposerToggle").click();
  await page.locator("#aiPromptInput").fill("生成销售收入和客户健康看板，支持区域筛选，要求首稿包含文本组件并说明指标口径");
  await page.locator("#aiGenerateButton").click();
  await expect(page.locator("#aiReview")).toBeVisible();
  await acceptGeneratedPreview(page);
  await expect(page.locator("#aiGenerationStatus")).toContainText("已接受");
  await expect(page.locator(".hero-title")).toHaveText("销售经营看板");
  await expect(page.locator('[data-item-id="methodology-note"] .workspace-text-body')).toContainText("指标口径");

  const acceptedArtifact = await page.evaluate(() => window.DashboardFileExporter.getRevisionHtml());
  const migrationResult = await page.evaluate(() => {
    const current = window.DashboardStudioBridge.getAiTransactionContext().currentWorkspace;
    const legacy = structuredClone(current);
    legacy.version = 1;
    delete legacy.theme.headerAlign;
    delete legacy.theme.paletteVersion;
    window.DashboardStudioBridge.applyAiPreview(legacy);
    const restored = window.DashboardStudioBridge.getAiTransactionContext().currentWorkspace;
    return { version: restored.version, headerAlign: restored.theme.headerAlign, paletteVersion: restored.theme.paletteVersion };
  });
  expect(migrationResult).toEqual({ version: 2, headerAlign: "left", paletteVersion: "1.0.0" });
  const titleBeforeInvalidRestore = await page.locator(".hero-title").textContent();
  const invalidRestoreError = await page.evaluate(() => {
    try {
      window.DashboardStudioBridge.applyAiPreview({ version: 2, theme: {}, layout: { sections: [] }, logo: null });
      return "";
    } catch (error) {
      return error.message;
    }
  });
  expect(invalidRestoreError).toContain("AI 预览无法进入当前编辑器");
  await expect(page.locator(".hero-title")).toHaveText(titleBeforeInvalidRestore);
  await page.locator('[data-item-id="opportunity-trend"]').click({ position: { x: 80, y: 50 } });
  await expect(page.locator("#cardChartTypeField")).toBeVisible();
  await page.getByRole("combobox", { name: "图表类型" }).click();
  await page.getByRole("option", { name: "基础条图" }).click();
  await expect(page.locator('[data-item-id="opportunity-trend"]')).toHaveAttribute("data-chart-type", "horizontal-bar");
  await page.locator("#designSaveControl").click();
  await expect(page.locator("#designSaveStatus")).toContainText("已保存版本");
  const artifact = await page.evaluate(() => window.DashboardFileExporter.getRevisionHtml());
  expect(artifact.revisionId).toMatch(/^revision-user-/);
  expect(artifact.revisionId).not.toBe(acceptedArtifact.revisionId);
  expect(artifact.html).toContain("销售经营看板");
  expect(artifact.html).toContain('"chartType":"horizontal-bar"');
  expect(artifact.html).toContain("数据口径说明");
  expect(artifact.html).not.toMatch(/ai-composer|design-drawer|provider-gateway/);
  await page.evaluate(() => Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined }));
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#designDownloadControl").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("版本成品.html");
  const downloadedHtml = await readFile(await download.path(), "utf8");
  expect(downloadedHtml).toContain("销售经营看板");
  expect(downloadedHtml).not.toMatch(/export-center|ai-composer|design-drawer/);
  await page.locator("#designPublishControl").click();
  await expect(page.locator("#publicationDialog")).toBeVisible();
  await page.locator("#publicationVisibility").selectOption("unlisted");
  await page.locator("#publicationSubmit").click();
  await expect(page.locator("#publicationStatus")).toContainText("已发布版本");
  await expect(page.locator("#publicationShareRow")).toBeVisible();
  const shareUrl = await page.locator("#publicationShareInput").inputValue();
  expect(shareUrl).toMatch(/\/p\/publication-.+\?token=/);
  const sharedArtifact = await page.request.get(shareUrl);
  expect(sharedArtifact.status()).toBe(200);
  expect(sharedArtifact.headers()["content-disposition"]).toContain("inline");
  const embeddedArtifact = await page.request.get(shareUrl.replace("/p/", "/embed/"));
  expect(embeddedArtifact.status()).toBe(200);
  expect(embeddedArtifact.headers()["content-security-policy"]).toBe("frame-ancestors *");
  await expect(page.locator("#publicationList .publication-row")).toHaveCount(1);
  const publicationListResponse = await page.request.get("/api/publications");
  const publications = (await publicationListResponse.json()).publications;
  const publication = publications.find((item) => item.revisionId === artifact.revisionId);
  expect(publication).toBeTruthy();
  await page.goto(`/studio/publications/${encodeURIComponent(publication.id)}?design=1&ci=publication-route`);
  await expect(page.locator("#publicationDialog")).toBeVisible();
  await expect(page.locator(`#publicationList [data-publication-id="${publication.id}"]`)).toHaveAttribute("data-current", "true");
  await expect(page.locator("#studioProjectLabel")).toHaveText("项目 / AI");
  const publicationArtifact = await page.request.get(`/api/publications/${publication.id}/artifact`);
  expect(publicationArtifact.status()).toBe(200);
  expect(await publicationArtifact.text()).toContain("销售经营看板");
  const pngArtifact = await page.request.get(`/api/publications/${publication.id}/render?format=png&width=800`);
  expect(pngArtifact.status()).toBe(200);
  expect(pngArtifact.headers()["content-type"]).toBe("image/png");
  expect([...((await pngArtifact.body()).subarray(0, 8))]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('[data-action="revoke"]').click();
  await expect(page.locator("#publicationList .publication-row strong")).toContainText("已撤回");
  await expect(page.locator("#publicationList .publication-row-copy span")).toContainText("访问 2 次");
  expect((await page.request.get(`/api/publications/${publication.id}/artifact`)).status()).toBe(410);
  expect(errors).toEqual([]);
});

test("Studio cancels a running generation job and ignores its late result", async ({ page }) => {
  let getStartedResolve;
  let releaseLateResult;
  const getStarted = new Promise((resolve) => { getStartedResolve = resolve; });
  const lateResult = new Promise((resolve) => { releaseLateResult = resolve; });
  let cancelCalled = false;
  await page.route("**/api/generation/jobs", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ job: { id: "generation-browser-cancel", status: "queued" } }) });
  });
  await page.route("**/api/generation/jobs/generation-browser-cancel", async (route) => {
    getStartedResolve();
    await lateResult;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ job: { id: "generation-browser-cancel", status: "succeeded" } }) });
  });
  await page.route("**/api/generation/jobs/generation-browser-cancel/cancel", async (route) => {
    cancelCalled = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ job: { id: "generation-browser-cancel", status: "canceled" } }) });
    releaseLateResult();
  });

  await page.goto("/.dashboard-preset-preview.html?design=1&ci=generation-cancel");
  const originalTitle = await page.locator(".hero-title").textContent();
  await page.locator("#aiComposerToggle").click();
  await page.locator("#aiPromptInput").fill("生成一个需要较长时间的经营看板");
  await page.locator("#aiGenerateButton").click();
  await expect(page.locator("#canvasGenerationStop")).toBeVisible();
  await getStarted;
  await page.locator("#canvasGenerationStop").click();
  await expect(page.locator("#aiGenerationStatus")).toContainText("已停止生成");
  await page.waitForTimeout(350);
  expect(cancelCalled).toBe(true);
  await expect(page.locator(".hero-title")).toHaveText(originalTitle);
  await expect(page.locator("#aiReview")).toBeHidden();
  await expect(page.locator("#aiGenerateButton")).toHaveText("生成首稿");
});

test("Studio resumes a persisted generation job after reload", async ({ page }) => {
  const recoveredRun = createDeterministicDraft({
    id: "browser-generation-recovery",
    prompt: "生成销售经营看板",
    language: "zh",
    pageType: "dashboard",
    dataInputs: []
  }, baseline, { runId: "run-browser-generation-recovery", now: "2026-08-11T12:00:00.000Z" });
  await page.addInitScript(() => {
    sessionStorage.setItem("dashboard-generation-job-v1", JSON.stringify({ id: "generation-browser-recovery", refinementCardId: null }));
  });
  await page.route("**/api/generation/jobs/generation-browser-recovery", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ job: { id: "generation-browser-recovery", status: "succeeded", run: recoveredRun } })
  }));

  await page.goto("/.dashboard-preset-preview.html?design=1&ci=generation-recovery");
  await page.locator("#aiComposerToggle").click();
  await expect(page.locator("#aiReview")).toBeVisible();
  await expect(page.locator("#aiGenerationStatus")).toContainText("首稿预览已通过校验");
  await expect(page.locator(".hero-title")).toHaveText("销售经营看板");
  await expect(page.locator("#aiGenerateButton")).toHaveText("生成首稿");
  expect(await page.evaluate(() => sessionStorage.getItem("dashboard-generation-job-v1"))).toBeNull();
});

test("Studio imports portable CSV data, profiles it, and generates bound cards", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/.dashboard-preset-preview.html?design=1&ci=data-import");
  await page.locator("#aiComposerToggle").click();
  await page.locator("#aiDataPortable").evaluate((input) => { input.checked = true; });
  await page.locator("#aiDataSourceInput").setInputFiles({
    name: "sales.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("月份,区域,收入,转化率\n2026-01,华东,1200,0.31\n2026-02,华南,1500,0.35\n2026-03,华东,1800,0.39")
  });
  await expect(page.locator("#aiDataSourceMeta")).toContainText("3 行 · 4 列");
  await expect(page.locator("#aiDataSourceMeta")).toContainText("随成品携带");
  await page.locator("#aiDataSchemaButton").click();
  await expect(page.locator("#dataSchemaDialog")).toBeVisible();
  await expect(page.locator("#dataSchemaRows .data-schema-row")).toHaveCount(4);
  await page.locator('[data-field-id="field-3"] .data-field-detail').selectOption("max");
  await page.locator('[data-field-id="field-3"] .data-field-format').selectOption("currency");
  await page.locator("#dataSchemaSave").click();
  await expect(page.locator("#dataSchemaDialog")).toBeHidden();
  await expect(page.locator("#aiDataSourceMeta")).toContainText("2 个指标 · 2 个维度");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#aiDataSchemaButton").click();
  await expect(page.locator("#dataSchemaDialog")).toBeVisible();
  expect(await page.locator("#dataSchemaDialog .data-schema-panel").evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.locator("#dataSchemaCancel").click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator("#aiPromptInput").fill("根据导入数据生成销售经营 Dashboard");
  await page.locator("#aiGenerateButton").click();
  await expect(page.locator("#aiReview")).toBeVisible();
  await acceptGeneratedPreview(page);
  await expect(page.locator("#aiGenerationStatus")).toContainText("已接受");
  await expect(page.locator('[data-item-id="priority-customers"] strong')).toContainText("¥1,800");
  await expect(page.locator('[data-item-id="opportunity-value"] strong')).toContainText("35%");
  const artifact = await page.evaluate(() => window.DashboardFileExporter.getRevisionHtml());
  expect(artifact.html).toContain("2026-01");
  expect(errors).toEqual([]);
});

test("Studio imports Excel and exposes workbook sheet selection", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/.dashboard-preset-preview.html?design=1&ci=excel-import");
  await page.locator("#aiComposerToggle").click();
  await page.locator("#aiDataSourceInput").setInputFiles({
    name: "sales.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(createXlsxFixture())
  });
  await expect(page.locator("#aiDataSourceMeta")).toContainText("2 行 · 3 列");
  await expect(page.locator("#aiDataSheet")).toBeVisible();
  await expect(page.locator("#aiDataSheet")).toHaveValue("销售数据");
  await expect(page.locator("#aiDataSheet option")).toHaveCount(2);
  await expect(page.locator("#aiDataSchemaButton")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Studio refreshes a dataset and keeps the last good version after failure", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/.dashboard-preset-preview.html?design=1&ci=data-refresh");
  await page.locator("#aiComposerToggle").click();
  await page.locator("#aiDataSourceInput").setInputFiles({ name: "sales.csv", mimeType: "text/csv", buffer: Buffer.from("月份,区域,收入\n2026-01,华东,1200\n2026-02,华南,1800") });
  await expect(page.locator("#aiDataRefreshButton")).toBeVisible();
  await page.locator("#aiDataRefreshButton").click();
  await page.locator("#aiDataSourceInput").setInputFiles({ name: "sales.csv", mimeType: "text/csv", buffer: Buffer.from("月份,区域,收入\n2026-03,华东,2400") });
  await expect(page.locator("#aiDataSourceMeta")).toContainText("1 行 · 3 列");
  await expect(page.locator("#aiGenerationStatus")).toContainText("刷新成功");
  await page.locator("#aiDataRefreshButton").click();
  await page.locator("#aiDataSourceInput").setInputFiles({ name: "sales.csv", mimeType: "text/csv", buffer: Buffer.from("月份,区域\n2026-04,华南") });
  await expect(page.locator("#aiDataSourceMeta")).toContainText("已保留上次成功数据");
  await expect(page.locator("#aiDataSchemaButton")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Studio connects a REST dataset by server-side credential reference", async ({ page }) => {
  const errors = [];
  let requestBody;
  let savedSchedule = null;
  let taskCanceled = false;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/data-sources/connect", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ dataSource: { id: "rest-sales", name: "销售订单 API", kind: "rest", format: "json", portable: false, createdAt: "2026-08-10T06:00:00.000Z", updatedAt: "2026-08-10T06:00:00.000Z", fingerprint: "sha256-rest", rowCount: 2, columnCount: 2, fields: [{ id: "region", label: "region", type: "string", nullable: false, samples: ["east"] }, { id: "revenue", label: "revenue", type: "number", nullable: false, samples: [1200] }], semanticModel: { version: 1, dimensions: [{ id: "dimension-region", fieldId: "region", label: "region", type: "string" }], metrics: [{ id: "metric-revenue", fieldId: "revenue", label: "revenue", aggregation: "sum", format: { maximumFractionDigits: 0 } }] }, quality: { issueCount: 0, issues: [] }, records: [{ region: "east", revenue: 1200 }] } }) });
  });
  await page.route("**/api/data-sources/rest-sales/refresh-jobs", (route) => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ job: { id: "job-rest-refresh", status: "queued", attempts: 0 } }) }));
  await page.route("**/api/jobs/job-rest-refresh", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ job: { id: "job-rest-refresh", status: "succeeded", attempts: 1 } }) }));
  await page.route("**/api/data-sources/rest-sales/preview", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ dataSource: { id: "rest-sales", name: "销售订单 API", kind: "rest", format: "json", portable: false, createdAt: "2026-08-10T06:00:00.000Z", updatedAt: "2026-08-10T06:01:00.000Z", fingerprint: "sha256-rest-new", rowCount: 3, columnCount: 2, fields: [{ id: "region", label: "region", type: "string", nullable: false, samples: ["east"] }, { id: "revenue", label: "revenue", type: "number", nullable: false, samples: [1200] }], semanticModel: { version: 1, dimensions: [{ id: "dimension-region", fieldId: "region", label: "region", type: "string" }], metrics: [{ id: "metric-revenue", fieldId: "revenue", label: "revenue", aggregation: "sum", format: { maximumFractionDigits: 0 } }] }, quality: { issueCount: 0, issues: [] }, records: [{ region: "east", revenue: 1200 }] } }) }));
  await page.route("**/api/refresh-schedules", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schedules: savedSchedule ? [savedSchedule] : [] }) }));
  await page.route("**/api/jobs", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobs: [{ id: "job-active", datasetId: "rest-sales", status: taskCanceled ? "canceled" : "queued", attempts: 0, maxAttempts: 3, createdAt: "2026-08-10T06:02:00.000Z" }, { id: "job-complete", datasetId: "rest-sales", status: "succeeded", attempts: 1, maxAttempts: 3, createdAt: "2026-08-10T06:01:00.000Z" }] }) }));
  await page.route("**/api/jobs/job-active/cancel", async (route) => {
    taskCanceled = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ job: { id: "job-active", status: "canceled" } }) });
  });
  await page.route("**/api/data-sources/rest-sales/refresh-schedule", async (route) => {
    const body = route.request().postDataJSON();
    savedSchedule = { id: "schedule-rest-sales", datasetId: "rest-sales", enabled: true, intervalMinutes: body.intervalMinutes, nextRunAt: "2026-08-10T07:01:00.000Z" };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schedule: savedSchedule }) });
  });
  await page.goto("/.dashboard-preset-preview.html?design=1&ci=rest-connect");
  await page.locator("#aiComposerToggle").click();
  await page.locator("#aiRestConnectButton").click();
  await expect(page.locator("#restConnectorDialog")).toBeVisible();
  await page.locator("#restConnectorName").fill("销售订单 API");
  await page.locator("#restConnectorUrl").fill("https://api.example.com/orders");
  await page.locator("#restConnectorPath").fill("data.items");
  await page.locator("#restConnectorCredential").fill("sales-api");
  await page.locator("#restConnectorSubmit").click();
  await expect(page.locator("#restConnectorDialog")).toBeHidden();
  await expect(page.locator("#aiDataSourceName")).toHaveText("销售订单 API");
  await expect(page.locator("#aiDataRefreshButton")).toHaveText("立即刷新");
  await expect(page.locator("#aiDataSchemaButton")).toBeVisible();
  await page.locator("#aiDataRefreshButton").click();
  await expect(page.locator("#aiDataSourceMeta")).toContainText("3 行 · 2 列");
  await expect(page.locator("#aiGenerationStatus")).toContainText("刷新成功");
  await page.locator("#aiDataScheduleButton").click();
  await expect(page.locator("#refreshScheduleDialog")).toBeVisible();
  await expect(page.locator("#refreshJobList")).toContainText("已完成");
  await page.locator("#refreshJobList button").click();
  await expect(page.locator("#refreshScheduleStatus")).toContainText("已取消");
  await expect(page.locator("#refreshJobList")).toContainText("已取消");
  await page.locator("#refreshScheduleInterval").selectOption("60");
  await page.locator("#refreshScheduleSave").click();
  await expect(page.locator("#refreshScheduleStatus")).toContainText("已保存");
  await expect(page.locator("#refreshScheduleMeta")).toContainText("下次执行");
  expect(savedSchedule.intervalMinutes).toBe(60);
  expect(requestBody.connector).toEqual({ url: "https://api.example.com/orders", recordsPath: "data.items", credentialRef: "sales-api" });
  expect(JSON.stringify(requestBody)).not.toContain("server-only-secret");
  expect(errors).toEqual([]);
});

test("Studio refines, undoes, and restores immutable revisions", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/.dashboard-preset-preview.html?design=1&ci=revision-history");
  await page.locator("#aiComposerToggle").click();
  await page.locator("#aiPromptInput").fill("生成销售经营看板");
  await page.locator("#aiGenerateButton").click();
  await expect(page.locator("#aiReview")).toBeVisible();
  await acceptGeneratedPreview(page);
  await expect(page.locator("#aiGenerationStatus")).toContainText("已接受");

  await page.locator('[data-item-id="opportunity-trend"]').click({ position: { x: 80, y: 50 } });
  if (await page.locator("#aiComposer").getAttribute("data-open") === "false") await page.locator("#aiComposerToggle").click();
  await expect(page.locator("#aiComposer")).toHaveAttribute("data-mode", "refine");
  await expect(page.locator("#aiChartRefineTemplates [data-chart-refine][data-chart-type]")).toHaveCount(23);
  await expect(page.locator("#aiChartRefineTemplates")).toContainText("仪表盘");
  await expect(page.locator("#aiChartRefineTemplates")).toContainText("雷达图");
  await expect(page.locator("#aiChartRefineTemplates")).toContainText("漏斗图");
  await expect(page.locator("#aiChartRefineTemplates")).toContainText("表格");
  await page.locator("#aiPromptInput").fill("改成面积图，卡片标题改为“CI 趋势”");
  await page.locator("#aiGenerateButton").click();
  await expect(page.locator("#aiReview")).toBeVisible();
  await acceptGeneratedPreview(page);
  await expect(page.locator("#aiGenerationStatus")).toContainText("修改已接受");
  await expect(page.locator('[data-item-id="opportunity-trend"] .card-title')).toContainText("CI 趋势");

  if (await page.locator("#aiComposer").getAttribute("data-open") === "false") await page.locator("#aiComposerToggle").click();
  await page.locator("#aiUndoButton").click();
  await expect(page.locator("#aiGenerationStatus")).toContainText("已整体撤销");
  await expect(page.locator('[data-item-id="opportunity-trend"] .card-title')).toContainText("机会金额趋势");

  if (await page.locator("#aiComposer").getAttribute("data-open") === "false") await page.locator("#aiComposerToggle").click();
  await page.locator("#aiHistoryToggle").click();
  await expect(page.locator("#aiHistoryCount")).toContainText("3 个版本");
  const compareButton = page.locator("#aiHistoryList .ai-history-compare-button").first();
  await expect(compareButton).toBeVisible();
  await compareButton.click();
  await expect(page.locator("#aiHistoryCompare")).toBeVisible();
  await expect(page.locator("#aiHistoryCompareMeta")).toContainText("项变更");
  await expect(page.locator("#aiHistoryCompareList li")).not.toHaveCount(0);
  const restoreButton = page.locator("#aiHistoryList .ai-history-restore").first();
  await expect(restoreButton).toBeVisible();
  await restoreButton.evaluate((button) => button.click());
  await expect(page.locator("#aiGenerationStatus")).toContainText("已恢复为历史版本");
  await expect(page.locator('[data-item-id="opportunity-trend"] .card-title')).toContainText("CI 趋势");
  await expect(page.locator("#aiHistoryCount")).toContainText("4 个版本");
  expect(errors).toEqual([]);
});
