import { ContractError } from "./workspace-core.mjs";
import { createHash, randomUUID } from "node:crypto";

const MIN_INTERVAL_MINUTES = 15;
const MAX_INTERVAL_MINUTES = 43_200;
const MAX_TIMER_DELAY_MS = 2_147_000_000;

export function createRefreshScheduleService({ scheduleRepository, dataSourceRepository, jobService, clock = () => Date.now(), timer = setTimeout, clearTimer = clearTimeout, workerId: configuredWorkerId = null, leaseDurationMs: configuredLeaseDurationMs = 30_000 } = {}) {
  if (!scheduleRepository || !dataSourceRepository || !jobService) throw new Error("Refresh schedule service dependencies are required");
  const timers = new Map();
  const workerId = configuredWorkerId || `scheduler-${randomUUID()}`;
  const leaseDurationMs = Math.max(1_000, Number(configuredLeaseDurationMs) || 30_000);
  const ownsLease = (schedule, token) => schedule?.lease?.ownerId === workerId && schedule.lease?.token === token;
  const scheduleTimer = (schedule) => {
    const existing = timers.get(schedule.id);
    if (existing !== undefined) clearTimer(existing);
    timers.delete(schedule.id);
    if (!schedule.enabled) return;
    const dueAt = Date.parse(schedule.nextRunAt);
    const leaseUntil = schedule.lease?.expiresAt ? Date.parse(schedule.lease.expiresAt) : 0;
    const wakeAt = dueAt <= clock() && leaseUntil > clock() ? leaseUntil : dueAt;
    const remaining = Math.max(0, wakeAt - clock());
    const delay = Math.min(remaining, MAX_TIMER_DELAY_MS);
    timers.set(schedule.id, timer(() => {
      timers.delete(schedule.id);
      trigger(schedule.id).catch(() => {});
    }, delay));
  };
  const trigger = async (id) => {
    const current = await scheduleRepository.get(id);
    if (!current?.enabled) return current;
    const token = randomUUID();
    const claimed = await scheduleRepository.update(id, (schedule) => {
      const nowMs = clock();
      if (!schedule.enabled || !schedule.nextRunAt || Date.parse(schedule.nextRunAt) > nowMs) return schedule;
      if (schedule.lease?.expiresAt && Date.parse(schedule.lease.expiresAt) > nowMs) return schedule;
      return { ...schedule, lease: { ownerId: workerId, token, scheduledFor: schedule.nextRunAt, acquiredAt: new Date(nowMs).toISOString(), expiresAt: new Date(nowMs + leaseDurationMs).toISOString() }, updatedAt: new Date(nowMs).toISOString() };
    });
    if (!ownsLease(claimed, token)) {
      if (claimed?.enabled) scheduleTimer(claimed);
      return claimed;
    }
    const now = new Date(clock()).toISOString();
    const scheduledFor = claimed.lease.scheduledFor;
    const nextBase = Math.max(clock(), Date.parse(scheduledFor));
    const nextRunAt = new Date(nextBase + claimed.intervalMinutes * 60_000).toISOString();
    const jobId = `job-schedule-${createHash("sha256").update(`${id}:${scheduledFor}`).digest("hex").slice(0, 24)}`;
    try {
      const job = await jobService.enqueue({ id: jobId, datasetId: claimed.datasetId, maxAttempts: claimed.maxAttempts, now });
      const next = await scheduleRepository.update(id, (schedule) => ownsLease(schedule, token) ? ({ ...schedule, lastRunAt: now, lastJobId: job.id, lastError: null, nextRunAt, updatedAt: now, lease: null }) : schedule);
      scheduleTimer(next);
      return next;
    } catch (error) {
      const next = await scheduleRepository.update(id, (schedule) => ownsLease(schedule, token) ? ({ ...schedule, lastRunAt: now, lastError: { code: error?.issues?.[0]?.code || "schedule-trigger-failed", message: String(error?.message || "Schedule trigger failed").slice(0, 240) }, nextRunAt, updatedAt: now, lease: null }) : schedule);
      scheduleTimer(next);
      return next;
    }
  };
  return {
    capabilities: Object.freeze({ leasing: true, deterministicOccurrences: true, recovery: "expired-lease-takeover" }),
    async upsert({ datasetId, intervalMinutes, enabled = true, maxAttempts = 3 } = {}) {
      const source = await dataSourceRepository.get(datasetId);
      if (!source) throw new ContractError("Data source was not found", [{ path: "/datasetId", code: "missing", message: "Dataset does not exist" }]);
      if (!["rest", "postgres"].includes(source.kind)) throw new ContractError("Only remote datasets support scheduled refresh", [{ path: "/datasetId", code: "compatibility", message: "Upload datasets require a new file" }]);
      const interval = Number(intervalMinutes);
      if (!Number.isInteger(interval) || interval < MIN_INTERVAL_MINUTES || interval > MAX_INTERVAL_MINUTES) throw new ContractError("Refresh interval is invalid", [{ path: "/intervalMinutes", code: "range", message: "Use 15 to 43200 minutes" }]);
      const now = new Date(clock()).toISOString();
      const id = `schedule-${datasetId}`;
      const existing = await scheduleRepository.get(id);
      const candidate = {
        version: 1, id, datasetId, enabled: Boolean(enabled), intervalMinutes: interval,
        maxAttempts: Math.max(1, Math.min(5, Number(maxAttempts) || 3)),
        createdAt: existing?.createdAt || now, updatedAt: now,
        nextRunAt: new Date(clock() + interval * 60_000).toISOString(),
        lastRunAt: existing?.lastRunAt || null, lastJobId: existing?.lastJobId || null, lastError: existing?.lastError || null, lease: null
      };
      const saved = existing ? await scheduleRepository.update(id, () => candidate) : await scheduleRepository.put(candidate);
      scheduleTimer(saved);
      return structuredClone(saved);
    },
    async disable(id) {
      const existing = await scheduleRepository.get(id);
      if (!existing) return null;
      const handle = timers.get(id);
      if (handle !== undefined) clearTimer(handle);
      timers.delete(id);
      return scheduleRepository.update(id, (schedule) => ({ ...schedule, enabled: false, updatedAt: new Date(clock()).toISOString(), nextRunAt: null, lease: null }));
    },
    async get(id) { const schedule = await scheduleRepository.get(id); return schedule ? structuredClone(schedule) : null; },
    async list() { return (await scheduleRepository.list()).map((schedule) => structuredClone(schedule)); },
    async resume() { for (const schedule of await scheduleRepository.list()) scheduleTimer(schedule); },
    trigger,
    get activeTimerCount() { return timers.size; },
    workerId
  };
}
