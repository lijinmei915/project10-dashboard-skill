import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGenerationJobService, generationJobSummary } from "../.agents/skills/dashboard-html/scripts/generation-job-service.mjs";
import { createProviderFromEnv } from "../.agents/skills/dashboard-html/scripts/provider-gateway.mjs";
import { startPreviewServer } from "../.agents/skills/dashboard-html/scripts/preview-server.mjs";
import { createJobRepository } from "../.agents/skills/dashboard-html/scripts/studio-job-repository.mjs";

const actor = { id: "generation-editor", role: "editor", organizationId: "generation-org" };
const baseline = {
  version: 2,
  theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" },
  layout: { sections: [] },
  logo: null
};
const request = { id: "async-generation", prompt: "生成销售经营看板", language: "zh", pageType: "dashboard", dataInputs: [] };

async function waitFor(read, predicate, timeoutMs = 2_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for generation job");
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "dashboard-generation-jobs-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return createJobRepository({ directory });
}

test("generation jobs persist lifecycle while hiding internal input from summaries", async (t) => {
  const jobRepository = await fixture(t);
  const service = createGenerationJobService({
    jobRepository,
    provider: createProviderFromEnv({}),
    resolveData: async (candidate) => ({ request: candidate, dataContexts: [] })
  });
  const created = await service.create({ id: "generation-success", mode: "draft", request, baseWorkspace: baseline, actor });
  assert.equal(created.status, "queued");
  assert.equal(created.input, undefined);
  await assert.rejects(service.get(created.id, { id: "other-user", role: "editor", organizationId: actor.organizationId }), (error) => error.statusCode === 403);
  await assert.rejects(service.get(created.id, { id: actor.id, role: "admin", organizationId: "other-org" }), (error) => error.statusCode === 403);
  const completed = await waitFor(() => service.get(created.id, actor), ({ status }) => status === "succeeded");
  assert.equal(completed.run.status, "preview-ready");
  assert.equal(completed.input, undefined);
  const eventSnapshot = await service.events(created.id, actor);
  assert.deepEqual(eventSnapshot.events.map(({ type }) => type), ["job.queued", "job.started", "generation.generating", "preview.ready"]);
  assert.equal(eventSnapshot.terminal, true);
  const stored = await jobRepository.get(created.id);
  assert.equal(stored.input.request.prompt, request.prompt);
  assert.equal(JSON.stringify(stored).includes("dataContexts"), false);
  await assert.rejects(service.feedback(created.id, { ...actor, id: "other-user" }, { outcome: "accepted" }), (error) => error.statusCode === 403);
  const feedback = await service.feedback(created.id, actor, { outcome: "accepted", revisionId: "revision-feedback-1" });
  assert.equal(feedback.outcome, "accepted");
  assert.deepEqual(await service.feedback(created.id, actor, { outcome: "accepted", revisionId: "revision-feedback-1" }), feedback);
  await assert.rejects(service.feedback(created.id, actor, { outcome: "dismissed" }), (error) => error.issues?.[0]?.code === "conflict");
  assert.equal((await service.get(created.id, actor)).feedback.revisionId, "revision-feedback-1");
  await jobRepository.put({ ...stored, id: "generation-dismissed", feedback: null });
  const dismissed = await service.feedback("generation-dismissed", actor, { outcome: "dismissed", reasonCodes: ["off-target", "poor-layout"] });
  assert.deepEqual(dismissed.reasonCodes, ["off-target", "poor-layout"]);
  await jobRepository.put({ ...stored, id: "generation-invalid-feedback", feedback: null });
  await assert.rejects(service.feedback("generation-invalid-feedback", actor, { outcome: "dismissed", reasonCodes: ["free-form-reason"] }), (error) => error.issues?.[0]?.path === "/reasonCodes");
});

test("generation job summaries omit provider token usage", () => {
  const summary = generationJobSummary({
    version: 1,
    id: "generation-usage-boundary",
    type: "dashboard-generation",
    mode: "draft",
    status: "succeeded",
    createdAt: "2026-08-11T12:00:00.000Z",
    updatedAt: "2026-08-11T12:00:01.000Z",
    result: { status: "preview-ready", usage: { requests: 2, inputTokens: 120, outputTokens: 80, totalTokens: 200 } }
  });
  assert.deepEqual(summary.run, { status: "preview-ready" });
  assert.equal(JSON.stringify(summary).includes("totalTokens"), false);
});

test("generation job lease lets only one worker call the provider", async (t) => {
  const jobRepository = await fixture(t);
  let providerCalls = 0;
  const baseProvider = createProviderFromEnv({});
  const provider = {
    ...baseProvider,
    async generateCandidate(context) {
      providerCalls += 1;
      return baseProvider.generateCandidate(context);
    }
  };
  const deferredTimer = () => ({ deferred: true });
  const options = { jobRepository, provider, resolveData: async (candidate) => ({ request: candidate, dataContexts: [] }), timer: deferredTimer, clearTimer() {}, leaseDurationMs: 5_000 };
  const first = createGenerationJobService({ ...options, workerId: "worker-a" });
  const second = createGenerationJobService({ ...options, workerId: "worker-b" });
  await first.create({ id: "generation-race", mode: "draft", request, baseWorkspace: baseline, actor });
  await Promise.all([first.run("generation-race"), second.run("generation-race")]);
  assert.equal(providerCalls, 1);
  assert.equal((await first.get("generation-race", actor)).status, "succeeded");
});

test("generation metrics aggregate one organization without exposing job inputs", async (t) => {
  const jobRepository = await fixture(t);
  const now = Date.parse("2026-08-11T12:00:00.000Z");
  const service = createGenerationJobService({
    jobRepository,
    provider: createProviderFromEnv({}),
    resolveData: async (candidate) => ({ request: candidate, dataContexts: [] }),
    clock: () => now,
    timer: () => ({ deferred: true }),
    clearTimer() {}
  });
  const common = { version: 1, type: "dashboard-generation", mode: "draft", actorId: actor.id, organizationId: "generation-org", input: { request, baseWorkspace: baseline }, result: null, lease: null };
  await jobRepository.put({ ...common, id: "metrics-success", status: "succeeded", createdAt: "2026-08-11T11:59:50.000Z", updatedAt: "2026-08-11T11:59:56.000Z", startedAt: "2026-08-11T11:59:52.000Z", completedAt: "2026-08-11T11:59:56.000Z", telemetry: { queueMs: 2_000, executionMs: 4_000, totalMs: 6_000, repairAttempts: 1 }, feedback: { version: 1, outcome: "accepted", reasonCodes: [], revisionId: "revision-metrics", createdAt: "2026-08-11T11:59:57.000Z" } });
  await jobRepository.put({ ...common, id: "metrics-failed", status: "failed", createdAt: "2026-08-11T11:59:40.000Z", updatedAt: "2026-08-11T11:59:45.000Z", startedAt: "2026-08-11T11:59:41.000Z", completedAt: "2026-08-11T11:59:45.000Z", error: { code: "provider_timeout", message: "redacted" } });
  await jobRepository.put({ ...common, id: "metrics-queued", status: "queued", createdAt: "2026-08-11T11:59:58.000Z", updatedAt: "2026-08-11T11:59:58.000Z" });
  await jobRepository.put({ ...common, id: "metrics-other-org", organizationId: "other-org", status: "failed", createdAt: "2026-08-11T11:59:30.000Z", updatedAt: "2026-08-11T11:59:31.000Z", completedAt: "2026-08-11T11:59:31.000Z", error: { code: "must-not-leak", message: "hidden" } });

  await assert.rejects(service.metrics(actor), (error) => error.statusCode === 403 && error.code === "organization-admin-required");
  const metrics = await service.metrics({ ...actor, organizationRole: "admin" });
  assert.deepEqual(metrics.totals, { created: 3, queued: 1, running: 0, succeeded: 1, failed: 1, canceled: 0 });
  assert.deepEqual(metrics.rates, { success: 0.5, failure: 0.5, repair: 0.5, acceptance: 1 });
  assert.deepEqual(metrics.feedback, { accepted: 1, dismissed: 0, unrated: 0 });
  assert.deepEqual(metrics.latencyMs.queue, { average: 1_500, p50: 1_000, p95: 2_000 });
  assert.deepEqual(metrics.latencyMs.execution, { average: 4_000, p50: 4_000, p95: 4_000 });
  assert.deepEqual(metrics.latencyMs.total, { average: 5_500, p50: 5_000, p95: 6_000 });
  assert.deepEqual(metrics.failures, [{ code: "provider_timeout", count: 1 }]);
  assert.equal(/生成销售经营看板|metrics-success|actorId|must-not-leak/.test(JSON.stringify(metrics)), false);
  await assert.rejects(service.metrics({ ...actor, organizationRole: "admin" }, { since: "2026-01-01T00:00:00.000Z" }), (error) => error.issues?.[0]?.path === "/since" && error.issues[0].code === "range");
});

test("canceling a running generation job fences a late provider result", async (t) => {
  const jobRepository = await fixture(t);
  let release;
  const provider = {
    id: "delayed-provider",
    kind: "remote",
    configured: true,
    generateCandidate: ({ signal }) => new Promise((resolve, reject) => {
      release = resolve;
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }),
    repairCandidate: async ({ candidate }) => candidate
  };
  const service = createGenerationJobService({ jobRepository, provider, resolveData: async (candidate) => ({ request: candidate, dataContexts: [] }) });
  await service.create({ id: "generation-cancel", mode: "draft", request, baseWorkspace: baseline, actor });
  await waitFor(() => service.get("generation-cancel", actor), ({ status }) => status === "running");
  const canceled = await service.cancel("generation-cancel", actor);
  assert.equal(canceled.status, "canceled");
  release?.({});
  await new Promise((resolve) => setTimeout(resolve, 20));
  const final = await service.get("generation-cancel", actor);
  assert.equal(final.status, "canceled");
  assert.equal(final.run, undefined);
});

test("limits the complete generation job including provider repair", async (t) => {
  const jobRepository = await fixture(t);
  const provider = {
    id: "never-ending-provider",
    kind: "remote",
    configured: true,
    generateCandidate: ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }),
    repairCandidate: async ({ candidate }) => candidate
  };
  const service = createGenerationJobService({ jobRepository, provider, resolveData: async (candidate) => ({ request: candidate, dataContexts: [] }), maximumDurationMs: 1_000 });
  await service.create({ id: "generation-deadline", mode: "draft", request, baseWorkspace: baseline, actor });
  const completed = await waitFor(() => service.get("generation-deadline", actor), ({ status }) => status === "failed", 2_000);
  assert.equal(completed.error.code, "provider_timeout");
  assert.equal(completed.error.httpStatus, 504);
});

test("generation job HTTP API creates and polls an isolated preview", async (t) => {
  const jobRepository = await fixture(t);
  const server = startPreviewServer({ listenPort: 0, silent: true, jobRepository, provider: createProviderFromEnv({}) });
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const createdResponse = await fetch(`${endpoint}/api/generation/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "draft", request, baseWorkspace: baseline })
  });
  assert.equal(createdResponse.status, 202);
  const created = (await createdResponse.json()).job;
  const completed = await waitFor(async () => {
    const response = await fetch(`${endpoint}/api/generation/jobs/${created.id}`);
    assert.equal(response.status, 200);
    return (await response.json()).job;
  }, ({ status }) => status === "succeeded");
  assert.equal(completed.run.status, "preview-ready");
  assert.equal(completed.input, undefined);
  assert.deepEqual(Object.keys(completed.telemetry).sort(), ["executionMs", "queueMs", "repairAttempts", "totalMs"]);
  const eventResponse = await fetch(`${endpoint}/api/generation/jobs/${created.id}/events`, { headers: { "Last-Event-ID": "2" } });
  assert.equal(eventResponse.status, 200);
  assert.match(eventResponse.headers.get("content-type"), /^text\/event-stream/);
  const eventStream = await eventResponse.text();
  assert.match(eventStream, /event: generation\.generating/);
  assert.match(eventStream, /event: preview\.ready/);
  assert.doesNotMatch(eventStream, /event: job\.queued/);
  const feedbackResponse = await fetch(`${endpoint}/api/generation/jobs/${created.id}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outcome: "accepted", revisionId: "revision-http-feedback" })
  });
  assert.equal(feedbackResponse.status, 200);
  const metricsResponse = await fetch(`${endpoint}/api/generation/metrics`);
  assert.equal(metricsResponse.status, 200);
  const metrics = (await metricsResponse.json()).metrics;
  assert.equal(metrics.totals.succeeded, 1);
  assert.equal(metrics.rates.acceptance, 1);
  assert.deepEqual(metrics.feedback, { accepted: 1, dismissed: 0, unrated: 0 });
  assert.equal(/生成销售经营看板|generation-success|actorId|workspace/i.test(JSON.stringify(metrics)), false);
});
