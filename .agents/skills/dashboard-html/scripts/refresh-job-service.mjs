import { randomUUID } from "node:crypto";
import { markDataSourceRefreshFailed } from "./data-source-service.mjs";
import { ContractError } from "./workspace-core.mjs";

const activeStatuses = new Set(["queued", "running", "retrying"]);

export function refreshJobSummary(job) {
  return structuredClone(job);
}

export function createRefreshJobService({ jobRepository, dataSourceRepository, restConnector, queryCache = null, baseDelayMs = 1_000, clock = () => Date.now(), timer = setTimeout, clearTimer = clearTimeout, workerId: configuredWorkerId = null, leaseDurationMs: configuredLeaseDurationMs = 30_000 } = {}) {
  if (!jobRepository || !dataSourceRepository || !restConnector) throw new Error("Refresh job service dependencies are required");
  const timers = new Map();
  const workerId = configuredWorkerId || `worker-${randomUUID()}`;
  const leaseDurationMs = Math.max(1_000, Number(configuredLeaseDurationMs) || 30_000);
  const heartbeatTimers = new Map();
  let resumed = false;
  const schedule = (job, delay = 0) => {
    if (timers.has(job.id)) return;
    const handle = timer(() => { timers.delete(job.id); run(job.id).catch(() => {}); }, Math.max(0, delay));
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
    const currentJob = await jobRepository.get(id);
    if (!currentJob || !activeStatuses.has(currentJob.status)) return currentJob;
    const token = randomUUID();
    const running = await jobRepository.update(id, (job) => {
      if (!activeStatuses.has(job.status)) return job;
      const now = clock();
      const leaseActive = job.status === "running" && job.lease?.expiresAt && Date.parse(job.lease.expiresAt) > now;
      const retryNotDue = job.status !== "running" && job.nextAttemptAt && Date.parse(job.nextAttemptAt) > now;
      if (leaseActive || retryNotDue) return job;
      return { ...job, status: "running", attempts: job.attempts + 1, updatedAt: new Date(now).toISOString(), nextAttemptAt: null, lease: { ownerId: workerId, token, acquiredAt: new Date(now).toISOString(), expiresAt: new Date(now + leaseDurationMs).toISOString() } };
    });
    if (!ownsLease(running, token)) return running;
    heartbeat(id, token);
    try {
      const source = await dataSourceRepository.get(running.datasetId);
      if (!source) throw new ContractError("Data source was not found", [{ path: "/datasetId", code: "missing", message: "Dataset no longer exists" }]);
      if (!["rest", "postgres"].includes(source.kind)) throw new ContractError("Only remote datasets support background refresh", [{ path: "/datasetId", code: "compatibility", message: "Upload a new file manually" }]);
      const refreshed = await dataSourceRepository.update(source.id, {}, async (latest) => {
        const candidate = await restConnector.refresh(latest, { now: new Date(clock()).toISOString() });
        if (!ownsLease(await jobRepository.get(id), token)) throw Object.assign(new Error("Refresh job lease was lost"), { code: "job-lease-lost" });
        return candidate;
      });
      await queryCache?.invalidateDataset?.(running.datasetId).catch(() => {});
      return jobRepository.update(id, (job) => ownsLease(job, token) ? ({ ...job, status: "succeeded", updatedAt: new Date(clock()).toISOString(), completedAt: new Date(clock()).toISOString(), result: { datasetFingerprint: refreshed.fingerprint, datasetUpdatedAt: refreshed.updatedAt }, lastError: null, lease: null }) : job);
    } catch (error) {
      const latestJob = await jobRepository.get(id);
      if (!ownsLease(latestJob, token) || error?.code === "job-lease-lost") return latestJob;
      const source = await dataSourceRepository.get(running.datasetId);
      if (source) await dataSourceRepository.update(source.id, {}, (latest) => markDataSourceRefreshFailed(latest, error, { now: new Date(clock()).toISOString() })).catch(() => {});
      const retry = running.attempts < running.maxAttempts;
      const delay = retry ? baseDelayMs * 2 ** (running.attempts - 1) : 0;
      const next = await jobRepository.update(id, (job) => ownsLease(job, token) ? ({
        ...job,
        status: retry ? "retrying" : "failed",
        updatedAt: new Date(clock()).toISOString(),
        ...(retry ? { nextAttemptAt: new Date(clock() + delay).toISOString() } : { completedAt: new Date(clock()).toISOString(), nextAttemptAt: null }),
        lastError: { code: error?.issues?.[0]?.code || "refresh-failed", message: String(error?.message || "Refresh failed").slice(0, 240) },
        lease: null
      }) : job);
      if (retry) schedule(next, delay);
      return next;
    } finally {
      stopHeartbeat(id);
    }
  };
  return {
    capabilities: Object.freeze({ leasing: true, heartbeat: true, fencing: true, delivery: "at-least-once" }),
    async enqueue({ id = `job-${randomUUID()}`, datasetId, maxAttempts = 3, now = new Date(clock()).toISOString() } = {}) {
      const source = await dataSourceRepository.get(datasetId);
      if (!source) throw new ContractError("Data source was not found", [{ path: "/datasetId", code: "missing", message: "Dataset does not exist" }]);
      if (!["rest", "postgres"].includes(source.kind)) throw new ContractError("Only remote datasets support background refresh", [{ path: "/datasetId", code: "compatibility", message: "Upload datasets require a new file" }]);
      const existing = await jobRepository.get(id);
      if (existing) {
        if (existing.type === "dataset-refresh" && existing.datasetId === datasetId) {
          if (activeStatuses.has(existing.status)) schedule(existing, Math.max(0, Date.parse(existing.nextAttemptAt || existing.updatedAt) - clock()));
          return refreshJobSummary(existing);
        }
        throw new ContractError("Refresh job id already exists", [{ path: "/id", code: "conflict", message: id }]);
      }
      const duplicate = (await jobRepository.list()).find((job) => job.datasetId === datasetId && activeStatuses.has(job.status));
      if (duplicate) throw new ContractError("Dataset already has an active refresh job", [{ path: "/datasetId", code: "conflict", message: duplicate.id }]);
      const job = { version: 1, id, type: "dataset-refresh", datasetId, status: "queued", attempts: 0, maxAttempts: Math.max(1, Math.min(5, Number(maxAttempts) || 3)), createdAt: now, updatedAt: now, nextAttemptAt: now, lastError: null, lease: null };
      try { await jobRepository.put(job); }
      catch (error) {
        const raced = await jobRepository.get(id);
        if (raced?.type === job.type && raced.datasetId === datasetId) return refreshJobSummary(raced);
        throw error;
      }
      schedule(job, 0);
      return refreshJobSummary(job);
    },
    async get(id) { const job = await jobRepository.get(id); return job?.type === "dataset-refresh" ? refreshJobSummary(job) : null; },
    async list() { return (await jobRepository.list()).filter(({ type }) => type === "dataset-refresh").map(refreshJobSummary); },
    async cancel(id) {
      const current = await jobRepository.get(id);
      if (!current || current.type !== "dataset-refresh") return null;
      if (!activeStatuses.has(current.status)) throw new ContractError("Refresh job cannot be canceled", [{ path: "/status", code: "conflict", message: `Job is already ${current.status}` }]);
      const handle = timers.get(id);
      if (handle !== undefined) { clearTimer(handle); timers.delete(id); }
      stopHeartbeat(id);
      return jobRepository.update(id, (job) => activeStatuses.has(job.status) ? ({ ...job, status: "canceled", updatedAt: new Date(clock()).toISOString(), completedAt: new Date(clock()).toISOString(), nextAttemptAt: null, lease: null }) : job);
    },
    async resume() {
      if (resumed) return;
      resumed = true;
      for (const job of await jobRepository.list()) if (job.type === "dataset-refresh" && activeStatuses.has(job.status)) schedule(job, Math.max(0, Date.parse(job.nextAttemptAt || job.updatedAt) - clock()));
    },
    run,
    get activeTimerCount() { return timers.size + heartbeatTimers.size; },
    workerId
  };
}
