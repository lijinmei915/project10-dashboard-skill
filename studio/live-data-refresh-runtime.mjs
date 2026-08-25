function clampInterval(value) {
  return Math.max(5_000, Math.min(86_400_000, Number(value) || 30_000));
}

export function normalizeRefreshPolicy(policy, { online = true } = {}) {
  const mode = ["manual", "poll", "dataset-event"].includes(policy?.mode)
    ? policy.mode
    : online ? "dataset-event" : "manual";
  return {
    mode,
    ...(mode === "poll" ? { intervalMs: clampInterval(policy?.intervalMs) } : {}),
    pauseWhenHidden: policy?.pauseWhenHidden !== false
  };
}

function refreshSucceeded(result) {
  if (result === false || result?.ok === false) return false;
  const statuses = Array.isArray(result) ? result : result?.results;
  return !Array.isArray(statuses) || statuses.every((item) => !["error", "last-known-good"].includes(item?.status || item));
}

export function createLiveDataRefreshRuntime({
  onRefresh = async () => true,
  eventSourceFactory = (url) => new EventSource(url),
  documentRef = typeof document === "undefined" ? null : document,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  baseBackoffMs = 1_000,
  maxBackoffMs = 30_000,
  jitter = () => 0
} = {}) {
  const groups = new Map();
  let disposed = false;
  let signature = "";

  const hidden = () => documentRef?.visibilityState === "hidden";
  const backoff = (attempt) => Math.min(maxBackoffMs, baseBackoffMs * (2 ** Math.max(0, attempt - 1))) + Math.max(0, Number(jitter()) || 0);

  function clearGroupTimers(group) {
    if (group.pollTimer) clearTimer(group.pollTimer);
    if (group.retryTimer) clearTimer(group.retryTimer);
    if (group.reconnectTimer) clearTimer(group.reconnectTimer);
    group.pollTimer = null;
    group.retryTimer = null;
    group.reconnectTimer = null;
  }

  function closeSource(group) {
    const source = group.source;
    group.source = null;
    source?.close();
  }

  function pauseGroup(group) {
    clearGroupTimers(group);
    closeSource(group);
  }

  function componentIds(group, mode = null, respectVisibility = false) {
    return [...group.targets.values()].filter(({ policy }) => (!mode || policy.mode === mode) && (!respectVisibility || !hidden() || policy.pauseWhenHidden === false)).map(({ componentId }) => componentId);
  }

  function schedulePoll(group, delay = group.pollInterval) {
    if (disposed || !componentIds(group, "poll", true).length || !Number.isFinite(group.pollInterval) || group.pollTimer) return;
    group.pollTimer = setTimer(async () => {
      group.pollTimer = null;
      const ids = componentIds(group, "poll", true);
      if (!ids.length) return;
      const ok = await runRefresh(group, ids, "poll");
      if (ok) schedulePoll(group);
    }, delay);
  }

  function scheduleRefreshRetry(group, ids, reason) {
    ids.forEach((id) => group.retryIds.add(id));
    group.retryReason = reason;
    if (disposed || !ids.some((id) => !hidden() || group.targets.get(id)?.policy.pauseWhenHidden === false) || group.retryTimer) return;
    group.refreshAttempt += 1;
    group.retryTimer = setTimer(async () => {
      group.retryTimer = null;
      const pending = [...group.retryIds];
      group.retryIds.clear();
      const ok = await runRefresh(group, pending, "retry");
      if (!ok) scheduleRefreshRetry(group, pending, group.retryReason);
      else schedulePoll(group);
    }, backoff(group.refreshAttempt));
  }

  async function runRefresh(group, ids, reason) {
    ids = ids.filter((id) => !hidden() || group.targets.get(id)?.policy.pauseWhenHidden === false);
    if (!ids.length || disposed) return true;
    if (group.refreshing) {
      ids.forEach((id) => group.pendingIds.add(id));
      group.pendingReason = reason;
      return group.refreshing;
    }
    group.refreshing = Promise.resolve(onRefresh({ datasetId: group.datasetId, componentIds: [...new Set(ids)], reason }))
      .then(refreshSucceeded, () => false)
      .finally(() => { group.refreshing = null; });
    const ok = await group.refreshing;
    if (ok) group.refreshAttempt = 0;
    else scheduleRefreshRetry(group, ids, reason);
    if (group.pendingIds.size) {
      const pending = [...group.pendingIds];
      const pendingReason = group.pendingReason || "coalesced";
      group.pendingIds.clear();
      group.pendingReason = null;
      return runRefresh(group, pending, pendingReason);
    }
    return ok;
  }

  function scheduleReconnect(group) {
    if (disposed || group.reconnectTimer || !componentIds(group, "dataset-event", true).length) return;
    group.connectionAttempt += 1;
    group.reconnectTimer = setTimer(() => {
      group.reconnectTimer = null;
      openSource(group);
    }, backoff(group.connectionAttempt));
  }

  function rememberEvent(group, event) {
    const id = String(event.lastEventId || "");
    let payload = {};
    try { payload = JSON.parse(event.data || "{}"); } catch { return null; }
    const versionKey = `${payload.version ?? ""}:${payload.updatedAt ?? ""}`;
    if ((id && id === group.lastEventId) || (versionKey !== ":" && versionKey === group.lastVersionKey)) return null;
    if (id) group.lastEventId = id;
    if (versionKey !== ":") group.lastVersionKey = versionKey;
    return payload;
  }

  function openSource(group) {
    if (disposed || group.source || !componentIds(group, "dataset-event", true).length) return;
    const cursor = group.lastEventId ? `?after=${encodeURIComponent(group.lastEventId)}` : "";
    let source;
    try { source = eventSourceFactory(`/api/data-sources/${encodeURIComponent(group.datasetId)}/events${cursor}`); }
    catch { scheduleReconnect(group); return; }
    group.source = source;
    source.onopen = () => { group.connectionAttempt = 0; };
    source.addEventListener("dataset.snapshot", (event) => { rememberEvent(group, event); });
    source.addEventListener("dataset.updated", (event) => {
      if (!rememberEvent(group, event)) return;
      runRefresh(group, componentIds(group, "dataset-event", true), "dataset-event");
    });
    source.onerror = () => {
      if (group.source !== source) return;
      closeSource(group);
      scheduleReconnect(group);
    };
  }

  function startGroup(group) {
    if (hidden() && [...group.targets.values()].every(({ policy }) => policy.pauseWhenHidden)) {
      group.visibilityPaused = true;
      return;
    }
    group.visibilityPaused = false;
    schedulePoll(group);
    openSource(group);
  }

  function createGroup(datasetId) {
    return {
      datasetId, targets: new Map(), pollInterval: Number.POSITIVE_INFINITY,
      pollTimer: null, retryTimer: null, reconnectTimer: null, source: null,
      refreshAttempt: 0, connectionAttempt: 0, retryIds: new Set(), pendingIds: new Set(),
      retryReason: null, pendingReason: null, refreshing: null, lastEventId: "", lastVersionKey: "", visibilityPaused: false
    };
  }

  function configure(targets = []) {
    const normalized = targets.map((target) => ({
      componentId: String(target.componentId), datasetId: String(target.datasetId),
      policy: normalizeRefreshPolicy(target.policy)
    })).filter(({ componentId, datasetId }) => componentId && datasetId)
      .sort((left, right) => `${left.datasetId}:${left.componentId}`.localeCompare(`${right.datasetId}:${right.componentId}`));
    const nextSignature = JSON.stringify(normalized);
    if (nextSignature === signature) return;
    signature = nextSignature;
    const datasets = new Set(normalized.map(({ datasetId }) => datasetId));
    for (const [datasetId, group] of groups) if (!datasets.has(datasetId)) {
      pauseGroup(group);
      groups.delete(datasetId);
    }
    for (const datasetId of datasets) {
      const group = groups.get(datasetId) || createGroup(datasetId);
      pauseGroup(group);
      group.targets = new Map(normalized.filter((target) => target.datasetId === datasetId).map((target) => [target.componentId, target]));
      const intervals = [...group.targets.values()].filter(({ policy }) => policy.mode === "poll").map(({ policy }) => policy.intervalMs);
      group.pollInterval = intervals.length ? Math.min(...intervals) : Number.POSITIVE_INFINITY;
      groups.set(datasetId, group);
      startGroup(group);
    }
  }

  function handleVisibilityChange() {
    if (disposed) return;
    if (hidden()) for (const group of groups.values()) {
      if ([...group.targets.values()].every(({ policy }) => policy.pauseWhenHidden)) {
        pauseGroup(group);
        group.visibilityPaused = true;
      }
    }
    else for (const group of groups.values()) if (group.visibilityPaused) {
      group.visibilityPaused = false;
      startGroup(group);
      runRefresh(group, componentIds(group), "resume");
    }
  }

  documentRef?.addEventListener?.("visibilitychange", handleVisibilityChange);

  function dispose() {
    disposed = true;
    documentRef?.removeEventListener?.("visibilitychange", handleVisibilityChange);
    for (const group of groups.values()) pauseGroup(group);
    groups.clear();
  }

  function inspect() {
    return [...groups.values()].map((group) => ({
      datasetId: group.datasetId, componentIds: componentIds(group), pollInterval: group.pollInterval,
      connected: Boolean(group.source), lastEventId: group.lastEventId,
      refreshAttempt: group.refreshAttempt, connectionAttempt: group.connectionAttempt
    }));
  }

  async function refreshNow() {
    const pending = [...groups.values()].map((group) => runRefresh(group, componentIds(group), "manual"));
    return Promise.all(pending);
  }

  return Object.freeze({ configure, dispose, inspect, refreshNow });
}
