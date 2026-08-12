import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  outputDir: "./test-results/playwright",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "line",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:8766",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node test/clean-browser-stores.mjs && npm start",
    url: "http://127.0.0.1:8766/api/generation/health",
    env: { PORT: "8766", DASHBOARD_PROJECTS_DIR: "./test-results/project-store", DASHBOARD_DATA_SOURCES_DIR: "./test-results/data-source-store", DASHBOARD_PUBLICATIONS_DIR: "./test-results/publication-store", DASHBOARD_PUBLICATION_ACCESS_DIR: "./test-results/publication-access-store", DASHBOARD_JOBS_DIR: "./test-results/job-store", DASHBOARD_REFRESH_SCHEDULES_DIR: "./test-results/refresh-schedule-store", DASHBOARD_AUDIT_DIR: "./test-results/audit-store", DASHBOARD_PROVIDER_PROFILES_DIR: "./test-results/provider-profile-store", DASHBOARD_PROVIDER_SECRETS_DIR: "./test-results/provider-secret-store" },
    reuseExistingServer: false,
    timeout: 30_000
  }
});
