import { createHash } from "node:crypto";
import { executeDataSourceQuery } from "./data-source-service.mjs";

export function semanticQueryCacheKey(source, input, { scopeKey = "unscoped" } = {}) {
  const normalized = {
    scopeKey,
    datasetId: source.id,
    datasetFingerprint: source.fingerprint,
    semanticVersion: source.semanticModel?.version || 1,
    dimensions: Array.isArray(input.dimensions) ? input.dimensions : [],
    metrics: Array.isArray(input.metrics) ? input.metrics : [],
    filters: Array.isArray(input.filters) ? input.filters.map(({ dimensionId, operator, value }) => ({ dimensionId, operator, value })) : [],
    limit: Number(input.limit) || 100
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function memoryStore({ maxEntries, clock }) {
  const entries = new Map();
  return {
    capabilities: Object.freeze({ shared: false, persistent: false }),
    async get(key) {
      const entry = entries.get(key);
      if (!entry || entry.expiresAt <= clock()) {
        entries.delete(key);
        return null;
      }
      entries.delete(key);
      entries.set(key, entry);
      return structuredClone(entry);
    },
    async put(key, value) {
      entries.set(key, structuredClone(value));
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    },
    async invalidateDataset(datasetId) {
      for (const [key, entry] of entries) if (entry.datasetId === datasetId) entries.delete(key);
    },
    async clear() { entries.clear(); },
    async probe() { return true; },
    get size() { return entries.size; }
  };
}

export function createSemanticQueryCache({ ttlMs = 30_000, maxEntries = 100, clock = () => Date.now(), store = null } = {}) {
  const activeStore = store || memoryStore({ maxEntries, clock });
  const duration = Math.max(1_000, Number(ttlMs) || 30_000);
  return {
    capabilities: activeStore.capabilities || Object.freeze({ shared: false, persistent: false }),
    async execute(source, input = {}, { scopeKey = "unscoped" } = {}) {
      const key = semanticQueryCacheKey(source, input, { scopeKey });
      const cached = await activeStore.get(key);
      if (cached) return { result: structuredClone(cached.result), cache: { status: "hit", expiresAt: new Date(cached.expiresAt).toISOString() } };
      const result = executeDataSourceQuery(source, input);
      const expiresAt = clock() + duration;
      await activeStore.put(key, { datasetId: source.id, result: structuredClone(result), expiresAt });
      return { result, cache: { status: "miss", expiresAt: new Date(expiresAt).toISOString() } };
    },
    invalidateDataset(datasetId) { return activeStore.invalidateDataset(datasetId); },
    clear() { return activeStore.clear(); },
    probe() { return activeStore.probe(); },
    get size() { return activeStore.size; }
  };
}
