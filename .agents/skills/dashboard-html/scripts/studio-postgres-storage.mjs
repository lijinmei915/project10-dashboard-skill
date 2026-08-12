import pg from "pg";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { assertProject } from "./project-store.mjs";
import { createAuditEvent } from "./studio-audit-repository.mjs";
import { ContractError } from "./workspace-core.mjs";
import { AUDIT_GENESIS_HASH, auditEventHash, auditPayloadHash, auditSeal, verifyAuditEntry } from "./studio-audit-integrity.mjs";

const { Pool } = pg;

export const POSTGRES_STORAGE_CAPABILITIES = Object.freeze({
  durable: true,
  shared: true,
  multiInstance: true,
  conditionalWrites: "row-lock-and-compare",
  transactions: "postgresql",
  transactionalOutbox: "project-and-publication-row",
  productionReady: true
});

function validId(id, label = "Entity") {
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new ContractError(`${label} id is invalid`, [{ path: "/id", code: "format", message: "Use a safe id" }]);
  return id;
}

function publicProject(project) {
  if (!project) return null;
  const copy = structuredClone(project);
  delete copy._outbox;
  return copy;
}

async function transaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await operation(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function entity(client, kind, id, { lock = false } = {}) {
  const result = await client.query(`SELECT payload FROM dashboard_entities WHERE kind = $1 AND id = $2${lock ? " FOR UPDATE" : ""}`, [kind, id]);
  return result.rows[0]?.payload ?? null;
}

async function entities(pool, kind) {
  const result = await pool.query("SELECT payload FROM dashboard_entities WHERE kind = $1 ORDER BY id", [kind]);
  return result.rows.map(({ payload }) => structuredClone(payload));
}

async function replaceEntity(client, kind, id, payload) {
  await client.query(`
    INSERT INTO dashboard_entities (kind, id, payload, updated_at)
    VALUES ($1, $2, $3::jsonb, NOW())
    ON CONFLICT (kind, id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
  `, [kind, id, JSON.stringify(payload)]);
}

async function createEntity(client, kind, id, payload) {
  try {
    await client.query("INSERT INTO dashboard_entities (kind, id, payload, updated_at) VALUES ($1, $2, $3::jsonb, NOW())", [kind, id, JSON.stringify(payload)]);
  } catch (error) {
    if (error?.code === "23505") return false;
    throw error;
  }
  return true;
}

function mutableRepository({ pool, kind, label, createOnly = false, stale = null, transactionalOutbox = false, transactionalSessionRevocations = false, publicValue = (value) => value, outboxOwnerKey = "organizationId", outboxField = "_outbox" }) {
  return {
    async get(id) {
      const value = await entity(pool, kind, validId(id, label));
      return value ? publicValue(value) : null;
    },
    async list() { return (await entities(pool, kind)).map(publicValue); },
    async put(value, { outbox = null } = {}) {
      const id = validId(value.id, label);
      await transaction(pool, async (client) => {
        const next = structuredClone(value);
        if (transactionalOutbox && outbox) {
          const events = await outbox({ before: null, next: publicValue(next) });
          const pending = Array.isArray(events) ? events : events ? [events] : [];
          if (pending.length) next[outboxField] = structuredClone(pending);
        }
        if (createOnly) {
          if (!await createEntity(client, kind, id, next)) throw new ContractError(`${label} id already exists`, [{ path: "/id", code: "conflict", message: `${label} ids are immutable` }]);
        } else await replaceEntity(client, kind, id, next);
      });
      return publicValue(value);
    },
    async update(id, options, updater) {
      if (typeof options === "function") { updater = options; options = {}; }
      return transaction(pool, async (client) => {
        const current = await entity(client, kind, validId(id, label), { lock: true });
        if (!current) return null;
        if (stale) stale(current, options || {});
        const next = await updater(structuredClone(current));
        if (transactionalOutbox && options?.outbox) {
          const events = await options.outbox({ before: structuredClone(current), next: structuredClone(next) });
          const pending = [...(current[outboxField] || []), ...(Array.isArray(events) ? events : events ? [events] : [])];
          if (pending.length) next[outboxField] = structuredClone(pending);
        }
        if (transactionalSessionRevocations && options?.sessionRevocations) {
          const events = await options.sessionRevocations({ before: structuredClone(current), next: structuredClone(next) });
          const pending = [...(current._sessionRevocations || []), ...(Array.isArray(events) ? events : events ? [events] : [])];
          if (pending.length) next._sessionRevocations = structuredClone(pending);
        }
        await replaceEntity(client, kind, id, next);
        return publicValue(next);
      });
    },
    ...(transactionalOutbox ? {
      async listOutbox() {
        return (await entities(pool, kind)).flatMap((value) => (value[outboxField] || []).map((event) => ({ [outboxOwnerKey]: value.id, event: structuredClone(event) })));
      },
      async acknowledgeOutbox(id, eventId) {
        return transaction(pool, async (client) => {
          const current = await entity(client, kind, validId(id, label), { lock: true });
          if (!current) return false;
          const pending = (current[outboxField] || []).filter(({ id: pendingId }) => pendingId !== eventId);
          if (pending.length === (current[outboxField] || []).length) return false;
          if (pending.length) current[outboxField] = pending;
          else delete current[outboxField];
          await replaceEntity(client, kind, id, current);
          return true;
        });
      }
    } : {}),
    ...(transactionalSessionRevocations ? {
      async listSessionRevocations() {
        return (await entities(pool, kind)).flatMap((value) => (value._sessionRevocations || []).map((event) => ({ organizationId: value.id, event: structuredClone(event) })));
      },
      async acknowledgeSessionRevocation(id, eventId) {
        return transaction(pool, async (client) => {
          const current = await entity(client, kind, validId(id, label), { lock: true });
          if (!current) return false;
          const pending = (current._sessionRevocations || []).filter(({ id: pendingId }) => pendingId !== eventId);
          if (pending.length === (current._sessionRevocations || []).length) return false;
          if (pending.length) current._sessionRevocations = pending;
          else delete current._sessionRevocations;
          await replaceEntity(client, kind, id, current);
          return true;
        });
      }
    } : {})
  };
}

function projectRepository(pool) {
  return {
    async get(id) {
      const project = await entity(pool, "project", validId(id, "Project"));
      if (project) assertProject(project);
      return publicProject(project);
    },
    async list() {
      return (await entities(pool, "project")).map(({ id, name, createdAt, updatedAt, organizationId = null, access, status = "active", archivedAt, currentRevisionId, revisions }) => ({
        id, name, createdAt, updatedAt, organizationId, access: access || { ownerId: null, members: [] }, status, ...(archivedAt ? { archivedAt } : {}), currentRevisionId, revisionCount: revisions.length
      }));
    },
    update(id, { expectedRevisionId, expectedUpdatedAt, seed = null, outbox = null } = {}, updater) {
      return transaction(pool, async (client) => {
        const key = validId(id, "Project");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`dashboard-project:${key}`]);
        const stored = await entity(client, "project", key, { lock: true });
        if (expectedRevisionId !== undefined && (stored?.currentRevisionId ?? null) !== expectedRevisionId) throw new ContractError("Project revision is stale", [{ path: "/expectedRevisionId", code: "stale", message: `Expected ${expectedRevisionId ?? "no revision"}, current revision is ${stored?.currentRevisionId ?? "none"}` }]);
        if (expectedUpdatedAt !== undefined && stored?.updatedAt !== expectedUpdatedAt) throw new ContractError("Project metadata is stale", [{ path: "/expectedUpdatedAt", code: "stale", message: `Expected ${expectedUpdatedAt}, current update is ${stored?.updatedAt ?? null}` }]);
        const base = publicProject(stored) ?? publicProject(seed);
        const next = await updater(base ? structuredClone(base) : null);
        if (!next || next.id !== key) throw new ContractError("Project update changed its identity");
        assertProject(next);
        const events = outbox ? await outbox({ before: publicProject(stored), next: structuredClone(next) }) : [];
        const pending = [...(stored?._outbox || []), ...(Array.isArray(events) ? events : events ? [events] : [])];
        if (pending.length) next._outbox = structuredClone(pending);
        await replaceEntity(client, "project", key, next);
        return publicProject(next);
      });
    },
    async listOutbox() {
      return (await entities(pool, "project")).flatMap((project) => (project._outbox || []).map((event) => ({ projectId: project.id, event: structuredClone(event) })));
    },
    acknowledgeOutbox(projectId, eventId) {
      return transaction(pool, async (client) => {
        const stored = await entity(client, "project", validId(projectId, "Project"), { lock: true });
        if (!stored) return false;
        const pending = (stored._outbox || []).filter(({ id }) => id !== eventId);
        if (pending.length === (stored._outbox || []).length) return false;
        if (pending.length) stored._outbox = pending;
        else delete stored._outbox;
        await replaceEntity(client, "project", projectId, stored);
        return true;
      });
    }
  };
}

function auditRepository(pool, auditHmacKey = null) {
  const anchorId = ({ organizationId, sequence, eventHash }) => `anchor-${createHash("sha256").update(`${organizationId}\u0000${sequence}\u0000${eventHash}`).digest("hex")}`;
  const anchorPayload = ({ organizationId, sequence, eventHash, anchoredThrough }) => ({
    schemaVersion: 1,
    anchorId: anchorId({ organizationId, sequence, eventHash }),
    organizationId,
    headSequence: sequence,
    headHash: eventHash,
    anchoredThrough,
    chainAlgorithm: "sha256-v1"
  });
  return {
    integrity: Object.freeze({ appendOnly: true, hashChain: true, sealed: Boolean(auditHmacKey) }),
    async append(input) {
      const event = createAuditEvent(input);
      return transaction(pool, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`dashboard-audit:${event.organizationId}`]);
        const duplicate = (await client.query("SELECT payload FROM dashboard_audit_events WHERE id = $1", [event.id])).rows[0]?.payload;
        if (duplicate) {
          if (!isDeepStrictEqual(duplicate, event)) throw new ContractError("Audit event id already exists with different content", [{ path: "/id", code: "conflict", message: "Audit event ids are immutable" }]);
          return structuredClone(duplicate);
        }
        const previous = (await client.query(`
          SELECT sequence, event_hash FROM dashboard_audit_events
          WHERE organization_id = $1 ORDER BY sequence DESC LIMIT 1 FOR UPDATE
        `, [event.organizationId])).rows[0];
        const sequence = Number(previous?.sequence || 0) + 1;
        const previousHash = previous?.event_hash || AUDIT_GENESIS_HASH;
        const payloadHash = auditPayloadHash(event);
        const eventHash = auditEventHash({ organizationId: event.organizationId, sequence, previousHash, payloadHash });
        const seal = auditSeal({ key: auditHmacKey, organizationId: event.organizationId, sequence, eventHash });
        await client.query(`
          INSERT INTO dashboard_audit_events (id, occurred_at, organization_id, project_id, payload, sequence, previous_hash, payload_hash, event_hash, seal)
          VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
        `, [event.id, event.at, event.organizationId, event.projectId, JSON.stringify(event), sequence, previousHash, payloadHash, eventHash, seal]);
        const anchor = anchorPayload({ organizationId: event.organizationId, sequence, eventHash, anchoredThrough: event.at });
        await client.query(`
          INSERT INTO dashboard_audit_anchor_outbox (anchor_id, organization_id, head_sequence, head_hash, anchored_through, payload)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          ON CONFLICT (anchor_id) DO NOTHING
        `, [anchor.anchorId, anchor.organizationId, anchor.headSequence, anchor.headHash, anchor.anchoredThrough, JSON.stringify(anchor)]);
        return structuredClone(event);
      });
    },
    async list({ organizationId, projectId, limit = 200 } = {}) {
      const bounded = Math.max(1, Math.min(1000, Number(limit) || 200));
      const result = await pool.query(`
        SELECT payload FROM dashboard_audit_events
        WHERE ($1::text IS NULL OR organization_id = $1) AND ($2::text IS NULL OR project_id = $2)
        ORDER BY occurred_at DESC, id DESC LIMIT $3
      `, [organizationId || null, projectId || null, bounded]);
      return result.rows.map(({ payload }) => structuredClone(payload));
    },
    async verify({ organizationId } = {}) {
      if (organizationId !== undefined && (!organizationId || typeof organizationId !== "string")) throw new ContractError("Audit organization is invalid", [{ path: "/organizationId", code: "format", message: "Use a valid organization" }]);
      const organizations = organizationId ? [organizationId] : (await pool.query("SELECT DISTINCT organization_id FROM dashboard_audit_events ORDER BY organization_id")).rows.map(({ organization_id }) => organization_id);
      const results = [];
      for (const organization of organizations) {
        const rows = (await pool.query(`
          SELECT organization_id, payload, sequence, previous_hash, payload_hash, event_hash, seal
          FROM dashboard_audit_events WHERE organization_id = $1 ORDER BY sequence ASC
        `, [organization])).rows;
        let previousHash = AUDIT_GENESIS_HASH;
        let failure = null;
        for (const row of rows) {
          const check = verifyAuditEntry({ organizationId: row.organization_id, payload: row.payload, sequence: Number(row.sequence), previousHash: row.previous_hash, payloadHash: row.payload_hash, eventHash: row.event_hash, seal: row.seal }, { key: auditHmacKey, previousHash });
          if (!check.ok) { failure = check.reason; break; }
          previousHash = check.eventHash;
        }
        results.push({ organizationId: organization, status: failure ? "error" : "ok", eventCount: rows.length, headHash: previousHash, ...(failure ? { error: "integrity-failed" } : {}) });
      }
      return { status: results.every(({ status }) => status === "ok") ? "ok" : "error", sealed: Boolean(auditHmacKey), organizations: results };
    },
    async listAnchorOutbox({ limit = 100, maxAttempts = 8 } = {}) {
      const bounded = Math.max(1, Math.min(1_000, Number(limit) || 100));
      const attempts = Math.max(1, Math.min(100, Number(maxAttempts) || 8));
      const result = await pool.query(`
        SELECT payload FROM dashboard_audit_anchor_outbox
        WHERE delivered_at IS NULL AND attempts < $1
        ORDER BY created_at ASC, anchor_id ASC LIMIT $2
      `, [attempts, bounded]);
      return result.rows.map(({ payload }) => structuredClone(payload));
    },
    async acknowledgeAnchor(anchor, { receiptReference = null } = {}) {
      const id = String(anchor?.anchorId || "");
      if (!/^anchor-[a-f0-9]{64}$/.test(id)) throw new ContractError("Audit anchor id is invalid", [{ path: "/anchorId", code: "format", message: "Use a valid audit anchor id" }]);
      const receipt = receiptReference == null ? null : String(receiptReference).trim();
      if (receipt && (receipt.length > 256 || /[\u0000-\u001f\u007f]/.test(receipt))) throw new ContractError("Audit anchor receipt is invalid", [{ path: "/receiptReference", code: "format", message: "Use an opaque receipt reference" }]);
      return (await pool.query(`
        UPDATE dashboard_audit_anchor_outbox
        SET delivered_at = COALESCE(delivered_at, NOW()), receipt_reference = COALESCE(receipt_reference, $2), failure_category = NULL
        WHERE anchor_id = $1
      `, [id, receipt || null])).rowCount > 0;
    },
    async recordAnchorFailure(anchor, category = "delivery-failed") {
      const id = String(anchor?.anchorId || "");
      if (!/^anchor-[a-f0-9]{64}$/.test(id)) throw new ContractError("Audit anchor id is invalid", [{ path: "/anchorId", code: "format", message: "Use a valid audit anchor id" }]);
      const safeCategory = /^[a-z][a-z0-9-]{0,63}$/.test(String(category)) ? String(category) : "delivery-failed";
      return (await pool.query(`
        UPDATE dashboard_audit_anchor_outbox
        SET attempts = attempts + 1, last_attempt_at = NOW(), failure_category = $2
        WHERE anchor_id = $1 AND delivered_at IS NULL
      `, [id, safeCategory])).rowCount > 0;
    },
    async anchorStatus({ organizationId } = {}) {
      if (!organizationId || typeof organizationId !== "string") throw new ContractError("Audit organization is invalid", [{ path: "/organizationId", code: "format", message: "Use a valid organization" }]);
      const [headResult, deliveredResult, pendingResult] = await Promise.all([
        pool.query("SELECT sequence, event_hash FROM dashboard_audit_events WHERE organization_id = $1 ORDER BY sequence DESC LIMIT 1", [organizationId]),
        pool.query("SELECT head_sequence, head_hash, delivered_at FROM dashboard_audit_anchor_outbox WHERE organization_id = $1 AND delivered_at IS NOT NULL ORDER BY head_sequence DESC LIMIT 1", [organizationId]),
        pool.query("SELECT COUNT(*)::int AS pending, COUNT(*) FILTER (WHERE attempts >= 8)::int AS failed FROM dashboard_audit_anchor_outbox WHERE organization_id = $1 AND delivered_at IS NULL", [organizationId])
      ]);
      const head = headResult.rows[0];
      const delivered = deliveredResult.rows[0];
      const pending = pendingResult.rows[0] || { pending: 0, failed: 0 };
      if (!head) return { status: "unavailable", pending: 0, failed: 0 };
      const current = delivered && Number(delivered.head_sequence) === Number(head.sequence) && delivered.head_hash === head.event_hash;
      const status = current ? "current" : Number(pending.failed) ? "failed" : Number(pending.pending) ? "pending" : delivered ? "lagging" : "unavailable";
      return { status, headSequence: Number(head.sequence), headHash: head.event_hash, ...(delivered ? { anchoredSequence: Number(delivered.head_sequence), anchoredHash: delivered.head_hash, anchoredAt: new Date(delivered.delivered_at).toISOString() } : {}), pending: Number(pending.pending), failed: Number(pending.failed) };
    }
  };
}

function publicationAccessRepository(pool) {
  return {
    async append({ publicationId, decision, reason, visibility, channel = "share", now = new Date().toISOString(), id = `access-${randomUUID()}` }) {
      const event = { version: 1, id, publicationId, occurredAt: now, decision, reason, visibility, channel };
      await pool.query("INSERT INTO dashboard_publication_access_events (id, publication_id, occurred_at, payload) VALUES ($1, $2, $3, $4::jsonb)", [id, publicationId, now, JSON.stringify(event)]);
      return structuredClone(event);
    },
    async list({ publicationId } = {}) {
      const result = await pool.query("SELECT payload FROM dashboard_publication_access_events WHERE ($1::text IS NULL OR publication_id = $1) ORDER BY occurred_at DESC, id DESC", [publicationId || null]);
      return result.rows.map(({ payload }) => structuredClone(payload));
    }
  };
}

function sessionRepository(pool) {
  const sessionId = (id) => {
    if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) throw new Error("Session id must be a SHA-256 digest");
    return id;
  };
  return Object.freeze({
    provider: "postgresql",
    capabilities: Object.freeze({ durable: true, shared: true, multiInstance: true }),
    async get(id) {
      const result = await pool.query(`
        SELECT actor_id, organization_id, expires_at
        FROM dashboard_auth_sessions
        WHERE id = $1 AND expires_at > NOW()
      `, [sessionId(id)]);
      const row = result.rows[0];
      return row ? { actorId: row.actor_id, organizationId: row.organization_id, expiresAt: new Date(row.expires_at).getTime() } : null;
    },
    async put(id, value) {
      await pool.query(`
        INSERT INTO dashboard_auth_sessions (id, actor_id, organization_id, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET actor_id = EXCLUDED.actor_id, organization_id = EXCLUDED.organization_id, expires_at = EXCLUDED.expires_at
      `, [sessionId(id), value.actorId, value.organizationId, new Date(value.expiresAt)]);
      return structuredClone(value);
    },
    async delete(id) {
      return (await pool.query("DELETE FROM dashboard_auth_sessions WHERE id = $1", [sessionId(id)])).rowCount > 0;
    },
    async deleteByActor(actorId, organizationId) {
      return (await pool.query("DELETE FROM dashboard_auth_sessions WHERE actor_id = $1 AND organization_id = $2", [validId(actorId, "Actor"), validId(organizationId, "Organization")])).rowCount;
    },
    async prune(now = Date.now()) {
      return (await pool.query("DELETE FROM dashboard_auth_sessions WHERE expires_at <= $1", [new Date(now)])).rowCount;
    },
    async probe() {
      await pool.query("SELECT 1 FROM dashboard_auth_sessions LIMIT 1");
      return true;
    }
  });
}

function externalIdentityRepository(pool) {
  const requiredText = (value, path, { maxLength = 512 } = {}) => {
    const normalized = String(value || "").trim();
    if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
      throw new ContractError("External identity value is invalid", [{ path, code: "format", message: "Use a non-empty safe value" }]);
    }
    return normalized;
  };
  const safeId = (value, path) => {
    const normalized = requiredText(value, path, { maxLength: 128 });
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(normalized)) {
      throw new ContractError("External identity reference is invalid", [{ path, code: "format", message: "Use a safe identifier" }]);
    }
    return normalized;
  };
  const identityKey = (value) => ({
    providerId: safeId(value?.providerId, "/providerId"),
    issuer: requiredText(value?.issuer, "/issuer"),
    subject: requiredText(value?.subject, "/subject")
  });
  const identityId = ({ providerId, issuer, subject }) => createHash("sha256").update(`${providerId}\u0000${issuer}\u0000${subject}`).digest("hex");
  const normalize = (value, { now = new Date().toISOString(), existing = null } = {}) => {
    const { providerId, issuer, subject } = identityKey(value);
    const organizationId = safeId(value?.organizationId, "/organizationId");
    const actorId = safeId(value?.actorId, "/actorId");
    const id = identityId({ providerId, issuer, subject });
    if (value?.id && value.id !== id) throw new ContractError("External identity id is immutable", [{ path: "/id", code: "immutable", message: "Identity id must match provider, issuer and subject" }]);
    if (existing && (existing.organizationId !== organizationId || existing.actorId !== actorId)) {
      throw new ContractError("External identity mapping is immutable", [{ path: "/actorId", code: "immutable", message: "Unbind before mapping this identity elsewhere" }]);
    }
    return { version: 1, id, providerId, issuer, subject, organizationId, actorId, createdAt: existing?.createdAt || now, updatedAt: now };
  };
  return Object.freeze({
    provider: "postgresql",
    capabilities: Object.freeze({ durable: true, shared: true, multiInstance: true }),
    async get(value) {
      const key = identityKey(value);
      const stored = await entity(pool, "external-identity", identityId(key));
      return stored ? structuredClone(stored) : null;
    },
    async bind(value) {
      const candidate = normalize(value);
      return transaction(pool, async (client) => {
        // A stable advisory lock also protects the previously absent-row case.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`dashboard-external-identity:${candidate.id}`]);
        const existing = await entity(client, "external-identity", candidate.id, { lock: true });
        const next = normalize(value, { existing });
        await replaceEntity(client, "external-identity", candidate.id, next);
        return structuredClone(next);
      });
    },
    async unbind({ providerId, issuer, subject, organizationId, actorId }) {
      const key = identityKey({ providerId, issuer, subject });
      const id = identityId(key);
      return transaction(pool, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`dashboard-external-identity:${id}`]);
        const existing = await entity(client, "external-identity", id, { lock: true });
        if (!existing) return false;
        if (organizationId && existing.organizationId !== safeId(organizationId, "/organizationId")) return false;
        if (actorId && existing.actorId !== safeId(actorId, "/actorId")) return false;
        await replaceEntity(client, "external-identity", id, { ...existing, status: "unbound", updatedAt: new Date().toISOString() });
        return true;
      });
    },
    async probe() {
      await pool.query("SELECT 1 FROM dashboard_entities WHERE kind = 'external-identity' LIMIT 1");
      return true;
    }
  });
}

function queryCacheRepository(pool) {
  const cacheKey = (value) => {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error("Query cache key must be a SHA-256 digest");
    return value;
  };
  return Object.freeze({
    capabilities: Object.freeze({ shared: true, persistent: true }),
    async get(key) {
      const result = await pool.query(`
        SELECT dataset_id, result, expires_at FROM dashboard_query_cache
        WHERE cache_key = $1 AND expires_at > NOW()
      `, [cacheKey(key)]);
      const row = result.rows[0];
      return row ? { datasetId: row.dataset_id, result: structuredClone(row.result), expiresAt: new Date(row.expires_at).getTime() } : null;
    },
    async put(key, value) {
      await pool.query(`
        INSERT INTO dashboard_query_cache (cache_key, dataset_id, result, expires_at)
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (cache_key) DO UPDATE SET dataset_id = EXCLUDED.dataset_id, result = EXCLUDED.result, expires_at = EXCLUDED.expires_at
      `, [cacheKey(key), value.datasetId, JSON.stringify(value.result), new Date(value.expiresAt)]);
    },
    async invalidateDataset(datasetId) {
      return (await pool.query("DELETE FROM dashboard_query_cache WHERE dataset_id = $1", [String(datasetId)])).rowCount;
    },
    async clear() {
      return (await pool.query("DELETE FROM dashboard_query_cache")).rowCount;
    },
    async probe() {
      await pool.query("SELECT 1 FROM dashboard_query_cache LIMIT 1");
      return true;
    }
  });
}

export async function migratePostgresStorage(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_entities (
      kind text NOT NULL,
      id text NOT NULL,
      payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY (kind, id)
    );
    CREATE TABLE IF NOT EXISTS dashboard_audit_events (
      id text PRIMARY KEY,
      occurred_at timestamptz NOT NULL,
      organization_id text NOT NULL,
      project_id text,
      payload jsonb NOT NULL,
      sequence bigint,
      previous_hash text,
      payload_hash text,
      event_hash text,
      seal text
    );
    CREATE INDEX IF NOT EXISTS dashboard_audit_scope_idx ON dashboard_audit_events (organization_id, project_id, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS dashboard_audit_anchor_outbox (
      anchor_id text PRIMARY KEY CHECK (anchor_id ~ '^anchor-[a-f0-9]{64}$'),
      organization_id text NOT NULL,
      head_sequence bigint NOT NULL,
      head_hash text NOT NULL CHECK (head_hash ~ '^[a-f0-9]{64}$'),
      anchored_through timestamptz NOT NULL,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      attempts integer NOT NULL DEFAULT 0,
      last_attempt_at timestamptz,
      delivered_at timestamptz,
      receipt_reference text,
      failure_category text
    );
    CREATE INDEX IF NOT EXISTS dashboard_audit_anchor_pending_idx ON dashboard_audit_anchor_outbox (created_at, anchor_id) WHERE delivered_at IS NULL;
    CREATE INDEX IF NOT EXISTS dashboard_audit_anchor_org_idx ON dashboard_audit_anchor_outbox (organization_id, head_sequence DESC);
    CREATE TABLE IF NOT EXISTS dashboard_publication_access_events (
      id text PRIMARY KEY,
      publication_id text NOT NULL,
      occurred_at timestamptz NOT NULL,
      payload jsonb NOT NULL
    );
    CREATE INDEX IF NOT EXISTS dashboard_publication_access_idx ON dashboard_publication_access_events (publication_id, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS dashboard_auth_sessions (
      id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
      actor_id text NOT NULL,
      organization_id text NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS dashboard_auth_sessions_expiry_idx ON dashboard_auth_sessions (expires_at);
    CREATE TABLE IF NOT EXISTS dashboard_query_cache (
      cache_key text PRIMARY KEY CHECK (cache_key ~ '^[a-f0-9]{64}$'),
      dataset_id text NOT NULL,
      result jsonb NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS dashboard_query_cache_dataset_idx ON dashboard_query_cache (dataset_id);
    CREATE INDEX IF NOT EXISTS dashboard_query_cache_expiry_idx ON dashboard_query_cache (expires_at);
    CREATE UNIQUE INDEX IF NOT EXISTS dashboard_active_dataset_job_idx
      ON dashboard_entities ((payload->>'datasetId'))
      WHERE kind = 'job' AND payload->>'status' IN ('queued', 'running', 'retrying');
  `);
  await pool.query("ALTER TABLE dashboard_audit_events ALTER COLUMN project_id DROP NOT NULL");
}

async function migrateAuditIntegrity(pool, auditHmacKey) {
  await transaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["dashboard-audit-integrity-migration"]);
    // Migration may need to backfill an existing chain before restoring immutability.
    await client.query("DROP TRIGGER IF EXISTS dashboard_audit_events_no_mutation ON dashboard_audit_events");
    const rows = (await client.query(`
      SELECT id, organization_id, payload, sequence, previous_hash, payload_hash, event_hash, seal
      FROM dashboard_audit_events ORDER BY organization_id, occurred_at ASC, id ASC
    `)).rows;
    const chains = new Map();
    for (const row of rows) {
      const organizationId = row.organization_id;
      const current = chains.get(organizationId) || { sequence: 0, headHash: AUDIT_GENESIS_HASH };
      if (row.sequence !== null && row.previous_hash && row.payload_hash && row.event_hash && (auditHmacKey ? row.seal : !row.seal)) {
        chains.set(organizationId, { sequence: Number(row.sequence), headHash: row.event_hash });
        continue;
      }
      const sequence = current.sequence + 1;
      const payloadHash = auditPayloadHash(row.payload);
      const eventHash = auditEventHash({ organizationId, sequence, previousHash: current.headHash, payloadHash });
      const seal = auditSeal({ key: auditHmacKey, organizationId, sequence, eventHash });
      await client.query(`
        UPDATE dashboard_audit_events
        SET sequence = $2, previous_hash = $3, payload_hash = $4, event_hash = $5, seal = $6
        WHERE id = $1
      `, [row.id, sequence, current.headHash, payloadHash, eventHash, seal]);
      chains.set(organizationId, { sequence, headHash: eventHash });
    }
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS dashboard_audit_org_sequence_idx ON dashboard_audit_events (organization_id, sequence);
      CREATE OR REPLACE FUNCTION dashboard_audit_events_append_only() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'dashboard_audit_events is append-only'; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER dashboard_audit_events_no_mutation BEFORE UPDATE OR DELETE ON dashboard_audit_events
      FOR EACH ROW EXECUTE FUNCTION dashboard_audit_events_append_only();
    `);
  });
}

async function migrateAuditAnchorOutbox(pool) {
  const rows = (await pool.query(`
    SELECT organization_id, sequence, event_hash, occurred_at
    FROM dashboard_audit_events
    WHERE sequence IS NOT NULL AND event_hash IS NOT NULL
    ORDER BY organization_id, sequence
  `)).rows;
  for (const row of rows) {
    const sequence = Number(row.sequence);
    const anchorId = `anchor-${createHash("sha256").update(`${row.organization_id}\u0000${sequence}\u0000${row.event_hash}`).digest("hex")}`;
    const payload = { schemaVersion: 1, anchorId, organizationId: row.organization_id, headSequence: sequence, headHash: row.event_hash, anchoredThrough: new Date(row.occurred_at).toISOString(), chainAlgorithm: "sha256-v1" };
    await pool.query(`
      INSERT INTO dashboard_audit_anchor_outbox (anchor_id, organization_id, head_sequence, head_hash, anchored_through, payload)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (anchor_id) DO NOTHING
    `, [anchorId, payload.organizationId, payload.headSequence, payload.headHash, payload.anchoredThrough, JSON.stringify(payload)]);
  }
}

export async function createPostgresStorage({ connectionString, pool = null, max = 10, auditHmacKey = null } = {}) {
  if (!pool && !connectionString) throw new Error("PostgreSQL connection string is required");
  if (auditHmacKey !== null && (typeof auditHmacKey !== "string" || auditHmacKey.length < 32)) throw new Error("DASHBOARD_AUDIT_HMAC_KEY must contain at least 32 characters");
  const activePool = pool || new Pool({ connectionString, max, application_name: "dashboard-html-studio" });
  await migratePostgresStorage(activePool);
  await migrateAuditIntegrity(activePool, auditHmacKey);
  await migrateAuditAnchorOutbox(activePool);
  const repositories = {
    projects: projectRepository(activePool),
    dataSources: mutableRepository({ pool: activePool, kind: "data-source", label: "Data source", stale(current, { expectedUpdatedAt }) { if (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt) throw new ContractError("Data source is stale", [{ path: "/expectedUpdatedAt", code: "stale", message: `Expected ${expectedUpdatedAt}, current value is ${current.updatedAt}` }]); } }),
    publications: mutableRepository({ pool: activePool, kind: "publication", label: "Publication", createOnly: true, transactionalOutbox: true, outboxField: "_auditOutbox", outboxOwnerKey: "publicationId", publicValue: (publication) => {
      const copy = structuredClone(publication);
      delete copy._auditOutbox;
      return copy;
    } }),
    publicationAccess: publicationAccessRepository(activePool),
    jobs: mutableRepository({ pool: activePool, kind: "job", label: "Job", createOnly: true }),
    refreshSchedules: mutableRepository({ pool: activePool, kind: "refresh-schedule", label: "Schedule", createOnly: true }),
    organizations: mutableRepository({ pool: activePool, kind: "organization", label: "Organization", transactionalOutbox: true, transactionalSessionRevocations: true, stale(current, { expectedUpdatedAt }) { if (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt) throw new ContractError("Organization is stale", [{ path: "/expectedUpdatedAt", code: "stale", message: `Expected ${expectedUpdatedAt}, current value is ${current.updatedAt}` }]); } }),
    audit: auditRepository(activePool, auditHmacKey),
    sessions: sessionRepository(activePool),
    externalIdentities: externalIdentityRepository(activePool)
  };
  return Object.freeze({ provider: "postgresql", capabilities: POSTGRES_STORAGE_CAPABILITIES, repositories, queryCache: queryCacheRepository(activePool), pool: activePool, close: () => activePool.end() });
}
