import { expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAccountRepository } from "../../.agents/skills/dashboard-html/scripts/studio-account-repository.mjs";
import { createStudioAuthService } from "../../.agents/skills/dashboard-html/scripts/studio-auth-service.mjs";
import { startPreviewServer } from "../../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createDataSourceRepository } from "../../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";
import { createJobRepository } from "../../.agents/skills/dashboard-html/scripts/studio-job-repository.mjs";
import { createProjectRepository } from "../../.agents/skills/dashboard-html/scripts/studio-project-repository.mjs";
import { createRefreshScheduleRepository } from "../../.agents/skills/dashboard-html/scripts/studio-refresh-schedule-repository.mjs";
import { appendProjectRevision, createProject } from "../../.agents/skills/dashboard-html/scripts/project-store.mjs";

const fixture = JSON.parse(await readFile(new URL("../fixtures/sales-dashboard-generation.json", import.meta.url), "utf8"));

test("personal account login recovers, registers, restores sessions, and preserves deep links", async ({ page }, testInfo) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-browser-password-auth-"));
  const accounts = createAccountRepository({ directory: path.join(root, "accounts") });
  const authService = createStudioAuthService({ mode: "password", accountRepository: accounts });
  const projectRepository = createProjectRepository({ directory: path.join(root, "projects") });
  const server = startPreviewServer({
    listenPort: 0,
    silent: true,
    authService,
    projectRepository,
    dataSourceRepository: createDataSourceRepository({ directory: path.join(root, "datasets") }),
    jobRepository: createJobRepository({ directory: path.join(root, "jobs") }),
    refreshScheduleRepository: createRefreshScheduleRepository({ directory: path.join(root, "schedules") })
  });
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    let statusUnavailable = true;
    await page.route("**/api/auth/status", async (route) => {
      if (statusUnavailable) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Service unavailable" }) });
      return route.continue();
    });
    await page.goto(`${endpoint}/studio/projects/project-login-deep-link?design=1&ci=password-auth`);

    await expect(page.locator("#studioAuthGate")).toBeVisible();
    await expect(page.locator("#studioAuthTitle")).toHaveText("暂时无法登录");
    await expect(page.locator("#studioAuthForm")).toBeHidden();
    await expect(page.locator("#studioAuthRetry")).toBeVisible();
    statusUnavailable = false;
    await page.locator("#studioAuthRetry").click();
    await expect(page.locator("#studioAuthTitle")).toHaveText("登录你的工作台");
    await expect(page.locator("#studioAuthForm")).toBeVisible();
    await expect(page.locator("#studioAuthSwitch")).toHaveText("没有账号？创建账号");
    await expect(page.locator("#studioAuthForgot")).toBeVisible();

    await page.locator("#studioAuthEmail").fill("not-an-email");
    await page.locator("#studioAuthPassword").fill("long-enough-password");
    await page.locator("#studioAuthSubmit").click();
    expect(await page.locator("#studioAuthEmail").evaluate((input) => input.validity.valid)).toBe(false);

    await page.locator("#studioAuthEmail").fill("person@example.com");
    await page.locator("#studioAuthPassword").fill("incorrect-password");
    await page.locator("#studioAuthSubmit").click();
    await expect(page.locator("#studioAuthStatus")).toHaveText("邮箱或密码不正确");
    await expect(page.locator("#studioAuthEmail")).toHaveValue("person@example.com");
    await expect(page.locator("#studioAuthPassword")).toHaveValue("");

    await page.locator("#studioAuthForgot").click();
    await expect(page.locator("#studioAuthStatus")).toContainText("尚未配置密码找回");
    await page.locator("#studioAuthSwitch").click();
    await expect(page.locator("#studioAuthTitle")).toHaveText("创建个人账号");
    await expect(page.locator("#studioAuthNameField")).toBeVisible();
    await page.locator("#studioAuthName").fill("个人用户");
    await page.locator("#studioAuthPassword").fill("personal-password-2026");
    await expect(page.locator("#studioAuthPasswordToggle")).toHaveAttribute("aria-pressed", "false");
    await page.locator("#studioAuthPasswordToggle").click();
    await expect(page.locator("#studioAuthPassword")).toHaveAttribute("type", "text");
    await expect(page.locator("#studioAuthPasswordToggle")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#studioAuthSubmit").click();
    await expect(page.locator("#studioAuthGate")).toBeHidden();
    await expect(page.locator("body")).toHaveAttribute("data-actor-role", "editor");

    const authenticated = await (await page.request.get(`${endpoint}/api/auth/status`)).json();
    expect(authenticated.actor.name).toBe("个人用户");
    const project = appendProjectRevision(createProject({
      id: "project-login-deep-link",
      name: "登录回跳项目",
      ownerId: authenticated.actor.id,
      organizationId: authenticated.actor.organizationId
    }), {
      id: "revision-login-deep-link",
      createdAt: "2026-08-22T08:00:00.000Z",
      source: "user",
      workspace: fixture.workspace
    });
    await projectRepository.update(project.id, { expectedRevisionId: null, seed: project }, (current) => current);

    await page.reload();
    await expect(page.locator("#studioAuthGate")).toBeHidden();
    await page.locator("#studioProjectControl").click();
    await page.locator("#studioAuthControl").click();
    await expect(page.locator("#studioAuthGate")).toBeVisible();
    await page.goto(`${endpoint}/studio/projects/project-login-deep-link?design=1&ci=password-auth-return`);
    await page.locator("#studioAuthEmail").fill("person@example.com");
    await page.locator("#studioAuthPassword").fill("personal-password-2026");
    await page.locator("#studioAuthSubmit").click();
    await expect(page.locator("#studioAuthGate")).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.DashboardProjectCenter?.currentProjectId() || null)).toBe("project-login-deep-link");
    expect(new URL(page.url()).pathname).toBe("/studio/projects/project-login-deep-link");

    await page.locator("#studioProjectControl").click();
    await page.locator("#studioAuthControl").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#studioAuthGate")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const panel = await page.locator(".studio-auth-panel").boundingBox();
    expect(panel.width).toBeLessThanOrEqual(358);
    await page.screenshot({ path: testInfo.outputPath("password-login-mobile.png"), fullPage: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
