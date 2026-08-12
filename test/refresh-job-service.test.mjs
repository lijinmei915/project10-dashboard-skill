import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseDataSource } from "../.agents/skills/dashboard-html/scripts/data-source-service.mjs";
import { createRefreshJobService } from "../.agents/skills/dashboard-html/scripts/refresh-job-service.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createDataSourceRepository } from "../.agents/skills/dashboard-html/scripts/studio-data-source-repository.mjs";
import { createJobRepository } from "../.agents/skills/dashboard-html/scripts/studio-job-repository.mjs";
import { createRefreshScheduleRepository } from "../.agents/skills/dashboard-html/scripts/studio-refresh-schedule-repository.mjs";
import { createRefreshScheduleService } from "../.agents/skills/dashboard-html/scripts/refresh-schedule-service.mjs";

async function waitFor(read, predicate, timeoutMs = 2000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    const value = await read();
    last = value;
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for refresh job: ${JSON.stringify(last)}`);
}

function restSource(id = "rest-job") {
  const source = parseDataSource({ id, name: "任务数据", format: "json", content: JSON.stringify([{ region: "east", revenue: 1200 }]), now: "2026-08-10T07:00:00.000Z" });
  source.kind = "rest";
  source.connector = { type: "rest", url: "https://api.example.com/data", recordsPath: "" };
  return source;
}

test("retries REST refresh jobs with bounded exponential backoff", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-refresh-job-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataSourceRepository = createDataSourceRepository({ directory: path.join(root, "datasets") });
  const jobRepository = createJobRepository({ directory: path.join(root, "jobs") });
  await dataSourceRepository.put(restSource());
  let calls = 0;
  const restConnector = {
    async refresh(source, { now }) {
      calls += 1;
      if (calls < 3) throw new Error(`temporary failure ${calls}`);
      return { ...source, updatedAt: now, fingerprint: `${source.fingerprint}-refreshed`, records: [{ region: "east", revenue: 2600 }], refresh: { status: "ready", attempt: calls, refreshedAt: now, lastSuccessfulAt: now } };
    }
  };
  const service = createRefreshJobService({ jobRepository, dataSourceRepository, restConnector, baseDelayMs: 5 });
  const queued = await service.enqueue({ id: "job-retry", datasetId: "rest-job", maxAttempts: 3 });
  assert.equal(queued.status, "queued");
  await assert.rejects(() => service.enqueue({ id: "job-duplicate", datasetId: "rest-job" }), /active refresh job/);
  const completed = await waitFor(() => service.get("job-retry"), ({ status }) => status === "succeeded");
  assert.equal(completed.attempts, 3);
  assert.equal(calls, 3);
  assert.equal((await dataSourceRepository.get("rest-job")).records[0].revenue, 2600);
  assert.equal(JSON.stringify(completed).includes("temporary failure 1"), false);
});

test("resumes persisted jobs and exposes job status over HTTP", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-refresh-resume-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataSourceRepository = createDataSourceRepository({ directory: path.join(root, "datasets") });
  const jobRepository = createJobRepository({ directory: path.join(root, "jobs") });
  const refreshScheduleRepository = createRefreshScheduleRepository({ directory: path.join(root, "schedules") });
  await dataSourceRepository.put(restSource("rest-resume"));
  await jobRepository.put({ version: 1, id: "job-resume", type: "dataset-refresh", datasetId: "rest-resume", status: "retrying", attempts: 1, maxAttempts: 3, createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:01.000Z", nextAttemptAt: "2020-01-01T00:00:01.000Z", lastError: { code: "upstream", message: "temporary" } });
  const restConnector = { async refresh(source, { now }) { return { ...source, updatedAt: now, fingerprint: `${source.fingerprint}-resumed`, refresh: { status: "ready", attempt: 2, refreshedAt: now, lastSuccessfulAt: now } }; } };
  const jobService = createRefreshJobService({ jobRepository, dataSourceRepository, restConnector, baseDelayMs: 5 });
  const server = startPreviewServer({ listenPort: 0, silent: true, dataSourceRepository, jobRepository, jobService, restConnector, refreshScheduleRepository });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await jobService.resume();
  const completed = await waitFor(() => jobService.get("job-resume"), ({ status }) => status === "succeeded");
  assert.equal(completed.attempts, 2);
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const detail = await fetch(`${endpoint}/api/jobs/job-resume`);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).job.status, "succeeded");
  const list = await fetch(`${endpoint}/api/jobs`);
  assert.equal((await list.json()).jobs.length, 1);
  const enqueue = await fetch(`${endpoint}/api/data-sources/rest-resume/refresh-jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "job-http", maxAttempts: 2 }) });
  assert.equal(enqueue.status, 202);
  await waitFor(async () => (await (await fetch(`${endpoint}/api/jobs/job-http`)).json()).job, ({ status }) => status === "succeeded");
  const scheduleResponse = await fetch(`${endpoint}/api/data-sources/rest-resume/refresh-schedule`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intervalMinutes: 60 }) });
  assert.equal(scheduleResponse.status, 200);
  assert.equal((await scheduleResponse.json()).schedule.intervalMinutes, 60);
  const schedules = await fetch(`${endpoint}/api/refresh-schedules`);
  assert.equal((await schedules.json()).schedules.length, 1);
  const disable = await fetch(`${endpoint}/api/refresh-schedules/schedule-rest-resume/disable`, { method: "POST" });
  assert.equal(disable.status, 200);
  assert.equal((await disable.json()).schedule.enabled, false);
});

test("cancels queued and running refresh jobs without committing late data", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-refresh-cancel-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataSourceRepository = createDataSourceRepository({ directory: path.join(root, "datasets") });
  const jobRepository = createJobRepository({ directory: path.join(root, "jobs") });
  await dataSourceRepository.put(restSource("rest-cancel"));
  const callbacks = new Map();
  let callbackId = 0;
  let releaseRefresh;
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  const restConnector = { async refresh(source, { now }) { await refreshGate; return { ...source, updatedAt: now, fingerprint: `${source.fingerprint}-late`, records: [{ region: "west", revenue: 9999 }] }; } };
  const service = createRefreshJobService({
    jobRepository, dataSourceRepository, restConnector,
    timer(callback) { callbackId += 1; callbacks.set(callbackId, callback); return callbackId; },
    clearTimer(id) { callbacks.delete(id); }
  });
  await service.enqueue({ id: "job-cancel-queued", datasetId: "rest-cancel" });
  assert.equal((await service.cancel("job-cancel-queued")).status, "canceled");
  assert.equal(callbacks.size, 0);
  await service.enqueue({ id: "job-cancel-running", datasetId: "rest-cancel" });
  const runningPromise = service.run("job-cancel-running");
  await waitFor(() => service.get("job-cancel-running"), ({ status }) => status === "running");
  assert.equal((await service.cancel("job-cancel-running")).status, "canceled");
  releaseRefresh();
  await runningPromise;
  assert.equal((await service.get("job-cancel-running")).status, "canceled");
  assert.equal((await dataSourceRepository.get("rest-cancel")).records[0].revenue, 1200);
});

test("replaying a deterministic refresh job id is idempotent", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-refresh-idempotent-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataSourceRepository = createDataSourceRepository({ directory: path.join(root, "datasets") });
  const jobRepository = createJobRepository({ directory: path.join(root, "jobs") });
  await dataSourceRepository.put(restSource("rest-idempotent"));
  const service = createRefreshJobService({
    jobRepository,
    dataSourceRepository,
    restConnector: { async refresh(source) { return source; } },
    timer() { return 1; },
    clearTimer() {}
  });
  const first = await service.enqueue({ id: "job-deterministic", datasetId: "rest-idempotent" });
  const replay = await service.enqueue({ id: "job-deterministic", datasetId: "rest-idempotent" });
  assert.deepEqual(replay, first);
  assert.equal((await jobRepository.list()).length, 1);
});

test("persists interval schedules, triggers jobs, and stops disabled schedules", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "dashboard-refresh-schedule-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataSourceRepository = createDataSourceRepository({ directory: path.join(root, "datasets") });
  const scheduleRepository = createRefreshScheduleRepository({ directory: path.join(root, "schedules") });
  await dataSourceRepository.put(restSource("rest-scheduled"));
  let now = Date.parse("2026-08-10T08:00:00.000Z");
  const callbacks = new Map();
  let callbackId = 0;
  const jobs = [];
  const service = createRefreshScheduleService({
    scheduleRepository, dataSourceRepository,
    jobService: { async enqueue(input) { const job = { id: `job-scheduled-${jobs.length + 1}`, ...input }; jobs.push(job); return job; } },
    clock: () => now,
    timer(callback, delay) { callbackId += 1; callbacks.set(callbackId, { callback, delay }); return callbackId; },
    clearTimer(id) { callbacks.delete(id); }
  });
  const schedule = await service.upsert({ datasetId: "rest-scheduled", intervalMinutes: 60, maxAttempts: 4 });
  assert.equal(schedule.enabled, true);
  assert.equal([...callbacks.values()][0].delay, 3_600_000);
  now += 3_600_000;
  await service.trigger(schedule.id);
  assert.equal(jobs.length, 1);
  assert.match(jobs[0].id, /^job-schedule-[a-f0-9]{24}$/);
  assert.equal((await service.get(schedule.id)).lastJobId, jobs[0].id);
  await service.disable(schedule.id);
  assert.equal(service.activeTimerCount, 0);
  await service.trigger(schedule.id);
  assert.equal(jobs.length, 1);
});
