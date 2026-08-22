import { randomUUID } from "node:crypto";
import { runGenerationWithProvider } from "./provider-gateway.mjs";
import { ContractError } from "./workspace-core.mjs";

const activeStatuses = new Set(["queued", "running"]);
const terminalStatuses = new Set(["succeeded", "failed", "canceled"]);
const feedbackOutcomes = new Set(["accepted", "dismissed"]);
const feedbackReasons = new Set(["off-target", "inaccurate-data", "wrong-chart", "poor-layout", "missing-content"]);
const dayMs = 24 * 60 * 60 * 1000;
const generationEventTypes = new Set(["job.queued", "job.started", "generation.generating", "section.ready", "preview.ready", "job.failed", "job.canceled"]);

function generationStage(job) {
  const lastEventType = job.events?.at(-1)?.type;
  if (lastEventType === "section.ready") return "validating";
  if (lastEventType === "generation.generating") return "generating";
  if (lastEventType === "job.started") return "starting";
  if (lastEventType === "preview.ready" || job.status === "succeeded") return "ready";
  if (lastEventType === "job.failed" || job.status === "failed") return "failed";
  if (lastEventType === "job.canceled" || job.status === "canceled") return "canceled";
  return "queued";
}

function generationProgress(job) {
  const latest = [...(job.events || [])].reverse().find(({ type }) => type === "section.ready");
  if (!latest) return { sectionsReady: 0, sectionCount: 0 };
  const sectionCount = Math.max(0, Math.min(12, Number(latest.sectionCount) || 0));
  return {
    sectionsReady: Math.max(0, Math.min(sectionCount, Number(latest.sectionIndex) || 0)),
    sectionCount
  };
}

function appendSectionReadyEvents(job, runResult, at) {
  const sections = runResult?.preview?.workspace?.document?.sections;
  if (!Array.isArray(sections) || !sections.length) return job;
  return sections.reduce((next, section, index) => appendJobEvent(next, "section.ready", at, {
    sectionIndex: index + 1,
    sectionCount: sections.length,
    componentCount: Array.isArray(section?.components) ? section.components.length : 0
  }), job);
}

function appendJobEvent(job, type, at, details = {}) {
  if (!generationEventTypes.has(type)) throw new Error(`Unsupported generation event: ${type}`);
  const events = Array.isArray(job.events) ? job.events : [];
  const id = (events.at(-1)?.id || 0) + 1;
  return { ...job, events: [...events, { id, type, at, ...details }].slice(-100) };
}

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
    progress: generationProgress(job),
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

export function createGenerationJobService({ jobRepository, provider, resolveData, clock = () => Date.now(), timer = setTimeout, clearTimer = clearTimeout, workerId: configuredWorkerId = null, leaseDurationMs: configuredLeaseDurationMs = 30_000, maximumDurationMs: configuredMaximumDurationMs = 300_000 } = {}) {
  if (!jobRepository || !provider || typeof resolveData !== "function") throw new Error("Generation job service dependencies are required");
  const timers = new Map();
  const controllers = new Map();
  const heartbeatTimers = new Map();
  const leaseRecoveryTimers = new Map();
  const workerId = configuredWorkerId || `generation-worker-${randomUUID()}`;
  const leaseDurationMs = Math.max(1_000, Number(configuredLeaseDurationMs) || 30_000);
  const maximumDurationMs = Math.max(1_000, Math.min(600_000, Number(configuredMaximumDurationMs) || 300_000));
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
  const stopLeaseRecovery = (id) => {
    const handle = leaseRecoveryTimers.get(id);
    if (handle !== undefined) clearTimer(handle);
    leaseRecoveryTimers.delete(id);
  };
  const scheduleLeaseRecovery = (id, expiresAt) => {
    stopLeaseRecovery(id);
    const delay = Math.max(0, Date.parse(expiresAt || "") - clock() + 25) || 25;
    const recover = async () => {
      leaseRecoveryTimers.delete(id);
      const current = await jobRepository.get(id).catch(() => null);
      if (current?.type !== "dashboard-generation" || current.status !== "running") return;
      const currentExpiry = Date.parse(current.lease?.expiresAt || "");
      if (Number.isFinite(currentExpiry) && currentExpiry > clock()) return scheduleLeaseRecovery(id, current.lease.expiresAt);
      const queued = await jobRepository.update(id, (job) => job.status === "running" && Date.parse(job.lease?.expiresAt || "") <= clock()
        ? ({ ...job, status: "queued", updatedAt: new Date(clock()).toISOString(), lease: null })
        : job).catch(() => null);
      if (queued?.status === "queued") schedule(queued);
    };
    leaseRecoveryTimers.set(id, timer(() => recover().catch(() => scheduleLeaseRecovery(id, new Date(clock() + 1_000).toISOString())), delay));
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
    stopLeaseRecovery(id);
    const token = randomUUID();
    const claimed = await jobRepository.update(id, (job) => {
      if (job?.type !== "dashboard-generation" || job.status !== "queued") return job;
      const now = clock();
      const at = new Date(now).toISOString();
      return appendJobEvent({ ...job, status: "running", startedAt: job.startedAt || at, updatedAt: at, lease: { ownerId: workerId, token, acquiredAt: at, expiresAt: new Date(now + leaseDurationMs).toISOString() } }, "job.started", at);
    });
    if (!ownsLease(claimed, token) || controllers.has(id)) return claimed;
    const controller = new AbortController();
    const deadline = timer(() => controller.abort("provider_timeout"), maximumDurationMs);
    controllers.set(id, controller);
    heartbeat(id, token);
    try {
      const resolved = claimed.mode === "draft" ? await resolveData(claimed.input.request, {
        id: claimed.actorId,
        organizationId: claimed.organizationId,
        role: claimed.actorRole,
        organizationRole: claimed.actorOrganizationRole
      }) : { request: claimed.input.request, dataContexts: [] };
      await jobRepository.update(id, (job) => ownsLease(job, token) ? appendJobEvent({ ...job, updatedAt: new Date(clock()).toISOString() }, "generation.generating", new Date(clock()).toISOString(), { stage: "generating" }) : job);
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
      if (controller.signal.reason === "provider_timeout" && runResult.status !== "preview-ready") {
        runResult.error = { message: "AI generation exceeded the maximum task duration", code: "provider_timeout", httpStatus: 504, retryable: true };
      }
      const completedAt = new Date(clock()).toISOString();
      return jobRepository.update(id, (job) => {
        if (!ownsLease(job, token)) return job;
        let completed = {
          ...job,
          status: runResult.status === "preview-ready" ? "succeeded" : "failed",
          updatedAt: completedAt,
          completedAt,
          ...(runResult.status === "preview-ready" ? { result: runResult, error: null } : { error: { code: runResult.error?.code || "generation-failed", message: String(runResult.error?.message || "Generation failed").slice(0, 240), httpStatus: Number(runResult.error?.httpStatus) || 422 } }),
          telemetry: telemetryFor(job, completedAt, runResult.repairAttempts),
          lease: null
        };
        if (runResult.status === "preview-ready") completed = appendSectionReadyEvents(completed, runResult, completedAt);
        return appendJobEvent(completed, runResult.status === "preview-ready" ? "preview.ready" : "job.failed", completedAt, runResult.status === "preview-ready" ? { stage: "preview-ready" } : { code: runResult.error?.code || "generation-failed" });
      });
    } catch (error) {
      const completedAt = new Date(clock()).toISOString();
      return jobRepository.update(id, (job) => ownsLease(job, token) ? appendJobEvent({ ...job, status: "failed", updatedAt: completedAt, completedAt, error: { code: error?.code || error?.issues?.[0]?.code || "generation-failed", message: String(error?.message || "Generation failed").slice(0, 240), httpStatus: Number(error?.httpStatus || error?.statusCode) || 422 }, telemetry: telemetryFor(job, completedAt), lease: null }, "job.failed", completedAt, { code: error?.code || error?.issues?.[0]?.code || "generation-failed" }) : job);
    } finally {
      clearTimer(deadline);
      controllers.delete(id);
      stopHeartbeat(id);
    }
  };
  return {
    async create({ id = `generation-${randomUUID()}`, mode = "draft", request, baseWorkspace, actor, now = new Date(clock()).toISOString() } = {}) {
      if (!actor?.id || !actor.organizationId) throw new Error("Generation job actor is required");
      if (!request?.id || !request.prompt || !baseWorkspace) throw new ContractError("Generation job input is incomplete", [{ path: "/request", code: "required", message: "Request and base workspace are required" }]);
      if (!new Set(["draft", "refine"]).has(mode)) throw new ContractError("Generation job mode is invalid", [{ path: "/mode", code: "enum", message: mode }]);
      const job = appendJobEvent({ version: 1, id, type: "dashboard-generation", mode, status: "queued", actorId: actor.id, organizationId: actor.organizationId, actorRole: actor.role, actorOrganizationRole: actor.organizationRole, createdAt: now, updatedAt: now, input: { request: structuredClone(request), baseWorkspace: structuredClone(baseWorkspace) }, result: null, error: null, lease: null, events: [] }, "job.queued", now);
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
    async events(id, actor, { after = 0 } = {}) {
      const job = await jobRepository.get(id);
      if (!job || job.type !== "dashboard-generation") return null;
      authorize(job, actor);
      const cursor = Math.max(0, Number(after) || 0);
      return {
        events: (job.events || []).filter(({ id: eventId }) => eventId > cursor).map((event) => structuredClone(event)),
        terminal: terminalStatuses.has(job.status),
        status: job.status,
        stage: generationStage(job),
        progress: generationProgress(job),
        updatedAt: job.updatedAt
      };
    },
    async cancel(id, actor) {
      const current = await jobRepository.get(id);
      if (!current || current.type !== "dashboard-generation") return null;
      authorize(current, actor);
      if (!activeStatuses.has(current.status)) throw new ContractError("Generation job cannot be canceled", [{ path: "/status", code: "conflict", message: `Job is already ${current.status}` }]);
      const handle = timers.get(id);
      if (handle !== undefined) { clearTimer(handle); timers.delete(id); }
      controllers.get(id)?.abort("provider_canceled");
      stopHeartbeat(id);
      stopLeaseRecovery(id);
      const completedAt = new Date(clock()).toISOString();
      const job = await jobRepository.update(id, (candidate) => activeStatuses.has(candidate.status) ? appendJobEvent({ ...candidate, status: "canceled", updatedAt: completedAt, completedAt, error: null, telemetry: telemetryFor(candidate, completedAt), lease: null }, "job.canceled", completedAt) : candidate);
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
        if (job.status === "running" && Date.parse(job.lease?.expiresAt || "") > clock()) {
          scheduleLeaseRecovery(job.id, job.lease.expiresAt);
          continue;
        }
        const queued = job.status === "running" ? await jobRepository.update(job.id, (candidate) => candidate.status === "running" && Date.parse(candidate.lease?.expiresAt || "") <= clock() ? ({ ...candidate, status: "queued", updatedAt: new Date(clock()).toISOString(), lease: null }) : candidate) : job;
        if (queued.status === "queued") schedule(queued);
      }
    },
    run,
    workerId,
    get activeTimerCount() { return timers.size + heartbeatTimers.size + leaseRecoveryTimers.size; }
  };
}
