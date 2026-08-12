import { randomUUID } from "node:crypto";
import { runGenerationWithProvider } from "./provider-gateway.mjs";
import { ContractError } from "./workspace-core.mjs";

const activeStatuses = new Set(["queued", "running"]);
const terminalStatuses = new Set(["succeeded", "failed", "canceled"]);
const feedbackOutcomes = new Set(["accepted", "dismissed"]);
const feedbackReasons = new Set(["off-target", "inaccurate-data", "wrong-chart", "poor-layout", "missing-content"]);
const dayMs = 24 * 60 * 60 * 1000;

function canRead(job, actor) {
  return actor?.organizationId === job.organizationId && (actor.id === job.actorId || actor.role === "admin" || actor.organizationRole === "admin");
}

function authorize(job, actor) {
  if (!canRead(job, actor)) throw Object.assign(new Error("Generation job access is forbidden"), { statusCode: 403, code: "forbidden" });
}

function authorizeMetrics(actor) {
  if (!actor?.organizationId || (actor.role !== "admin" && actor.organizationRole !== "admin")) {
    throw Object.assign(new Error("Organization admin role is required"), { statusCode: 403, code: "organization-admin-required" });
  }
}

function authorizeFeedback(job, actor) {
  if (!actor?.id || actor.organizationId !== job.organizationId || actor.id !== job.actorId) {
    throw Object.assign(new Error("Generation feedback access is forbidden"), { statusCode: 403, code: "forbidden" });
  }
}

function normalizeFeedback(input, at) {
  const outcome = String(input?.outcome || "");
  if (!feedbackOutcomes.has(outcome)) throw new ContractError("Generation feedback is invalid", [{ path: "/outcome", code: "enum", message: "Use accepted or dismissed" }]);
  const reasonCodes = [...new Set((Array.isArray(input?.reasonCodes) ? input.reasonCodes : []).map(String))];
  const invalidReason = reasonCodes.find((reason) => !feedbackReasons.has(reason));
  if (invalidReason || reasonCodes.length > 3) throw new ContractError("Generation feedback is invalid", [{ path: "/reasonCodes", code: "enum", message: "Use up to three controlled reason codes" }]);
  const revisionId = input?.revisionId === undefined || input.revisionId === null ? null : String(input.revisionId);
  if (revisionId && (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(revisionId) || outcome !== "accepted")) {
    throw new ContractError("Generation feedback is invalid", [{ path: "/revisionId", code: "format", message: "Only accepted feedback may reference a safe revision ID" }]);
  }
  return { version: 1, outcome, reasonCodes, ...(revisionId ? { revisionId } : {}), createdAt: at };
}

function sameFeedback(left, right) {
  return left?.outcome === right.outcome && left?.revisionId === right.revisionId && JSON.stringify(left?.reasonCodes || []) === JSON.stringify(right.reasonCodes);
}

function duration(from, to) {
  const value = Date.parse(to || "") - Date.parse(from || "");
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function telemetryFor(job, completedAt, repairAttempts = 0) {
  return {
    queueMs: duration(job.createdAt, job.startedAt || completedAt),
    executionMs: job.startedAt ? duration(job.startedAt, completedAt) : 0,
    totalMs: duration(job.createdAt, completedAt),
    repairAttempts: Math.max(0, Number(repairAttempts) || 0)
  };
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function latencySummary(values) {
  return {
    average: values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : 0,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95)
  };
}

function generationMetrics(jobs, actor, { since, until }) {
  const scoped = jobs.filter((job) => job.type === "dashboard-generation" && job.organizationId === actor.organizationId && Date.parse(job.createdAt) >= since && Date.parse(job.createdAt) <= until);
  const counts = { created: scoped.length, queued: 0, running: 0, succeeded: 0, failed: 0, canceled: 0 };
  const terminal = [];
  const failures = new Map();
  let repaired = 0;
  let accepted = 0;
  let dismissed = 0;
  for (const job of scoped) {
    if (Object.hasOwn(counts, job.status)) counts[job.status] += 1;
    if (!terminalStatuses.has(job.status)) continue;
    const telemetry = job.telemetry || telemetryFor(job, job.completedAt || job.updatedAt, job.result?.repairAttempts);
    terminal.push(telemetry);
    if (telemetry.repairAttempts > 0) repaired += 1;
    if (job.status === "failed") {
      const code = String(job.error?.code || "generation-failed").slice(0, 80);
      failures.set(code, (failures.get(code) || 0) + 1);
    }
    if (job.feedback?.outcome === "accepted") accepted += 1;
    if (job.feedback?.outcome === "dismissed") dismissed += 1;
  }
  const outcomes = counts.succeeded + counts.failed;
  return {
    version: 1,
    window: { since: new Date(since).toISOString(), until: new Date(until).toISOString() },
    totals: counts,
    rates: {
      success: outcomes ? counts.succeeded / outcomes : 0,
      failure: outcomes ? counts.failed / outcomes : 0,
      repair: terminal.length ? repaired / terminal.length : 0,
      acceptance: accepted + dismissed ? accepted / (accepted + dismissed) : 0
    },
    feedback: { accepted, dismissed, unrated: Math.max(0, counts.succeeded - accepted - dismissed) },
    latencyMs: {
      queue: latencySummary(terminal.map(({ queueMs }) => queueMs)),
      execution: latencySummary(terminal.map(({ executionMs }) => executionMs)),
      total: latencySummary(terminal.map(({ totalMs }) => totalMs))
    },
    failures: [...failures.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([code, count]) => ({ code, count }))
  };
}

export function generationJobSummary(job) {
  const run = job.result ? structuredClone(job.result) : null;
  if (run) delete run.usage;
  return {
    version: job.version,
    id: job.id,
    type: job.type,
    mode: job.mode,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    ...(job.error ? { error: structuredClone(job.error) } : {}),
    ...(job.telemetry ? { telemetry: structuredClone(job.telemetry) } : {}),
    ...(job.feedback ? { feedback: structuredClone(job.feedback) } : {}),
    ...(run ? { run } : {})
  };
}

export function createGenerationJobService({ jobRepository, provider, resolveData, clock = () => Date.now(), timer = setTimeout, clearTimer = clearTimeout, workerId: configuredWorkerId = null, leaseDurationMs: configuredLeaseDurationMs = 30_000 } = {}) {
  if (!jobRepository || !provider || typeof resolveData !== "function") throw new Error("Generation job service dependencies are required");
  const timers = new Map();
  const controllers = new Map();
  const heartbeatTimers = new Map();
  const workerId = configuredWorkerId || `generation-worker-${randomUUID()}`;
  const leaseDurationMs = Math.max(1_000, Number(configuredLeaseDurationMs) || 30_000);
  let resumed = false;
  const schedule = (job) => {
    if (timers.has(job.id)) return;
    const handle = timer(() => { timers.delete(job.id); run(job.id).catch(() => {}); }, 0);
    timers.set(job.id, handle);
  };
  const ownsLease = (job, token) => job?.status === "running" && job.lease?.ownerId === workerId && job.lease?.token === token;
  const stopHeartbeat = (id) => {
    const handle = heartbeatTimers.get(id);
    if (handle !== undefined) clearTimer(handle);
    heartbeatTimers.delete(id);
  };
  const heartbeat = (id, token) => {
    stopHeartbeat(id);
    const renew = async () => {
      const renewed = await jobRepository.update(id, (job) => ownsLease(job, token) ? ({ ...job, lease: { ...job.lease, expiresAt: new Date(clock() + leaseDurationMs).toISOString() }, updatedAt: new Date(clock()).toISOString() }) : job).catch(() => null);
      if (!ownsLease(renewed, token)) return stopHeartbeat(id);
      heartbeatTimers.set(id, timer(renew, Math.max(500, Math.floor(leaseDurationMs / 3))));
    };
    heartbeatTimers.set(id, timer(renew, Math.max(500, Math.floor(leaseDurationMs / 3))));
  };
  const run = async (id) => {
    const token = randomUUID();
    const claimed = await jobRepository.update(id, (job) => {
      if (job?.type !== "dashboard-generation" || job.status !== "queued") return job;
      const now = clock();
      return { ...job, status: "running", startedAt: job.startedAt || new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), lease: { ownerId: workerId, token, acquiredAt: new Date(now).toISOString(), expiresAt: new Date(now + leaseDurationMs).toISOString() } };
    });
    if (!ownsLease(claimed, token) || controllers.has(id)) return claimed;
    const controller = new AbortController();
    controllers.set(id, controller);
    heartbeat(id, token);
    try {
      const resolved = claimed.mode === "draft" ? await resolveData(claimed.input.request, {
        id: claimed.actorId,
        organizationId: claimed.organizationId,
        role: claimed.actorRole,
        organizationRole: claimed.actorOrganizationRole
      }) : { request: claimed.input.request, dataContexts: [] };
      const runResult = await runGenerationWithProvider(provider, {
        mode: claimed.mode,
        request: resolved.request,
        baseWorkspace: claimed.input.baseWorkspace,
        dataContexts: resolved.dataContexts,
        runId: `run-${claimed.id}`,
        now: claimed.startedAt,
        signal: controller.signal,
        providerContext: { organizationId: claimed.organizationId }
      });
      const completedAt = new Date(clock()).toISOString();
      return jobRepository.update(id, (job) => ownsLease(job, token) ? ({
        ...job,
        status: runResult.status === "preview-ready" ? "succeeded" : "failed",
        updatedAt: completedAt,
        completedAt,
        ...(runResult.status === "preview-ready" ? { result: runResult, error: null } : { error: { code: runResult.error?.code || "generation-failed", message: String(runResult.error?.message || "Generation failed").slice(0, 240) } }),
        telemetry: telemetryFor(job, completedAt, runResult.repairAttempts),
        lease: null
      }) : job);
    } catch (error) {
      const completedAt = new Date(clock()).toISOString();
      return jobRepository.update(id, (job) => ownsLease(job, token) ? ({ ...job, status: "failed", updatedAt: completedAt, completedAt, error: { code: error?.code || error?.issues?.[0]?.code || "generation-failed", message: String(error?.message || "Generation failed").slice(0, 240) }, telemetry: telemetryFor(job, completedAt), lease: null }) : job);
    } finally {
      controllers.delete(id);
      stopHeartbeat(id);
    }
  };
  return {
    async create({ id = `generation-${randomUUID()}`, mode = "draft", request, baseWorkspace, actor, now = new Date(clock()).toISOString() } = {}) {
      if (!actor?.id || !actor.organizationId) throw new Error("Generation job actor is required");
      if (!request?.id || !request.prompt || !baseWorkspace) throw new ContractError("Generation job input is incomplete", [{ path: "/request", code: "required", message: "Request and base workspace are required" }]);
      if (!new Set(["draft", "refine"]).has(mode)) throw new ContractError("Generation job mode is invalid", [{ path: "/mode", code: "enum", message: mode }]);
      const job = { version: 1, id, type: "dashboard-generation", mode, status: "queued", actorId: actor.id, organizationId: actor.organizationId, actorRole: actor.role, actorOrganizationRole: actor.organizationRole, createdAt: now, updatedAt: now, input: { request: structuredClone(request), baseWorkspace: structuredClone(baseWorkspace) }, result: null, error: null, lease: null };
      await jobRepository.put(job);
      schedule(job);
      return generationJobSummary(job);
    },
    async get(id, actor) {
      const job = await jobRepository.get(id);
      if (!job || job.type !== "dashboard-generation") return null;
      authorize(job, actor);
      return generationJobSummary(job);
    },
    async cancel(id, actor) {
      const current = await jobRepository.get(id);
      if (!current || current.type !== "dashboard-generation") return null;
      authorize(current, actor);
      if (!activeStatuses.has(current.status)) throw new ContractError("Generation job cannot be canceled", [{ path: "/status", code: "conflict", message: `Job is already ${current.status}` }]);
      const handle = timers.get(id);
      if (handle !== undefined) { clearTimer(handle); timers.delete(id); }
      controllers.get(id)?.abort();
      stopHeartbeat(id);
      const completedAt = new Date(clock()).toISOString();
      const job = await jobRepository.update(id, (candidate) => activeStatuses.has(candidate.status) ? ({ ...candidate, status: "canceled", updatedAt: completedAt, completedAt, error: null, telemetry: telemetryFor(candidate, completedAt), lease: null }) : candidate);
      return generationJobSummary(job);
    },
    async metrics(actor, { since = null } = {}) {
      authorizeMetrics(actor);
      const until = clock();
      const parsedSince = since === null || since === undefined || since === "" ? until - dayMs : Date.parse(String(since));
      if (!Number.isFinite(parsedSince) || parsedSince > until || until - parsedSince > 30 * dayMs) {
        throw new ContractError("Generation metrics window is invalid", [{ path: "/since", code: "range", message: "Use an ISO timestamp within the last 30 days" }]);
      }
      return generationMetrics(await jobRepository.list(), actor, { since: parsedSince, until });
    },
    async feedback(id, actor, input) {
      const current = await jobRepository.get(id);
      if (!current || current.type !== "dashboard-generation") return null;
      authorizeFeedback(current, actor);
      if (current.status !== "succeeded") throw new ContractError("Generation feedback requires a succeeded job", [{ path: "/status", code: "conflict", message: `Job is ${current.status}` }]);
      const feedback = normalizeFeedback(input, new Date(clock()).toISOString());
      if (current.feedback) {
        if (sameFeedback(current.feedback, feedback)) return structuredClone(current.feedback);
        throw new ContractError("Generation feedback already exists", [{ path: "/feedback", code: "conflict", message: "Feedback is immutable" }]);
      }
      const updated = await jobRepository.update(id, (job) => {
        if (job.feedback) return job;
        return { ...job, feedback, updatedAt: feedback.createdAt };
      });
      if (!sameFeedback(updated.feedback, feedback)) throw new ContractError("Generation feedback already exists", [{ path: "/feedback", code: "conflict", message: "Feedback is immutable" }]);
      return structuredClone(updated.feedback);
    },
    async resume() {
      if (resumed) return;
      resumed = true;
      for (const job of await jobRepository.list()) {
        if (job.type !== "dashboard-generation" || !activeStatuses.has(job.status)) continue;
        if (job.status === "running" && Date.parse(job.lease?.expiresAt || "") > clock()) continue;
        const queued = job.status === "running" ? await jobRepository.update(job.id, (candidate) => candidate.status === "running" && Date.parse(candidate.lease?.expiresAt || "") <= clock() ? ({ ...candidate, status: "queued", updatedAt: new Date(clock()).toISOString(), lease: null }) : candidate) : job;
        if (queued.status === "queued") schedule(queued);
      }
    },
    run,
    workerId,
    get activeTimerCount() { return timers.size + heartbeatTimers.size; }
  };
}
