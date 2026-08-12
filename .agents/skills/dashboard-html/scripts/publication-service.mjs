import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createDataContext } from "./data-source-service.mjs";
import { exportProjectRevision } from "./revision-exporter.mjs";
import { restoreProjectRevision } from "./project-store.mjs";
import { ContractError } from "./workspace-core.mjs";

function required(value, path) {
  if (typeof value !== "string" || !value.trim()) throw new ContractError(`${path} is required`, [{ path: `/${path}`, code: "required", message: `${path} is required` }]);
  return value.trim();
}

export function createShareToken() {
  return randomBytes(24).toString("base64url");
}

export function hashShareToken(token) {
  return createHash("sha256").update(required(token, "token")).digest("hex");
}

export function createPublication({ id = `publication-${randomUUID()}`, project, revisionId = project?.currentRevisionId, dataSources = [], visibility = "private", shareToken, status = "published", approval = null, now = new Date().toISOString() } = {}) {
  const workspace = restoreProjectRevision(project, revisionId);
  if (!["private", "unlisted", "public"].includes(visibility)) throw new ContractError("Publication visibility is invalid", [{ path: "/visibility", code: "enum", message: "Use private, unlisted, or public" }]);
  if (!["pending", "published"].includes(status)) throw new ContractError("Publication status is invalid", [{ path: "/status", code: "enum", message: "Use pending or published" }]);
  if (status === "pending" && (!approval || typeof approval.requestedAt !== "string" || typeof approval.requestedBy !== "string")) throw new ContractError("Publication approval request is invalid", [{ path: "/approval", code: "required", message: "Pending publications require an approval request" }]);
  const dataRefs = [...new Set(workspace.document.sections.flatMap(({ components }) => components.map(({ dataRef }) => dataRef).filter(Boolean)))];
  const byId = new Map(dataSources.map((source) => [source.id, source]));
  const snapshots = dataRefs.map((datasetId) => {
    const source = byId.get(datasetId);
    if (!source) return { datasetId, kind: workspace.resources?.datasets?.[datasetId]?.portable ? "embedded" : "missing" };
    const context = createDataContext(source).context;
    return {
      datasetId,
      datasetFingerprint: source.fingerprint,
      datasetUpdatedAt: source.updatedAt,
      semanticVersion: source.semanticModel?.version || 1,
      querySnapshots: context.querySnapshots
    };
  });
  const artifact = exportProjectRevision(project, revisionId);
  return {
    version: 1,
    id: required(id, "id"),
    projectId: project.id,
    revisionId,
    createdAt: now,
    status,
    ...(approval ? { approval: structuredClone(approval) } : {}),
    access: { visibility, ...(visibility === "unlisted" ? { tokenHash: hashShareToken(shareToken) } : {}) },
    dataSnapshots: snapshots,
    artifact
  };
}

export function publicationSummary(publication) {
  return {
    version: publication.version,
    id: publication.id,
    projectId: publication.projectId,
    revisionId: publication.revisionId,
    createdAt: publication.createdAt,
    status: publication.status,
    ...(publication.approval ? { approval: { requestedAt: publication.approval.requestedAt, ...(publication.approval.approvedAt ? { approvedAt: publication.approval.approvedAt } : {}) } } : {}),
    ...(publication.revokedAt ? { revokedAt: publication.revokedAt } : {}),
    access: { visibility: publication.access.visibility, ...(publication.access.tokenHash ? { protected: true } : {}) },
    dataSnapshots: structuredClone(publication.dataSnapshots),
    artifact: { version: publication.artifact.version, mediaType: publication.artifact.mediaType, filename: publication.artifact.filename, sha256: publication.artifact.sha256 }
  };
}

export function authorizePublicationAccess(publication, token = "") {
  if (publication.status === "revoked") return { allowed: false, statusCode: 410, reason: "revoked" };
  if (publication.status === "pending") return { allowed: false, statusCode: 404, reason: "pending" };
  if (publication.access.visibility === "public") return { allowed: true, statusCode: 200, reason: "public" };
  if (publication.access.visibility === "private") return { allowed: false, statusCode: 404, reason: "private" };
  if (!publication.access.tokenHash || typeof token !== "string" || !token) return { allowed: false, statusCode: 404, reason: "token_missing" };
  const expected = Buffer.from(publication.access.tokenHash, "hex");
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual)
    ? { allowed: true, statusCode: 200, reason: "token" }
    : { allowed: false, statusCode: 404, reason: "token_invalid" };
}

export function approvePublication(publication, { actorId, now = new Date().toISOString() } = {}) {
  if (publication.status !== "pending") throw new ContractError("Publication is not pending approval", [{ path: "/status", code: "conflict", message: "Publication is already published or revoked" }]);
  if (typeof actorId !== "string" || !actorId) throw new ContractError("Publication approver is invalid", [{ path: "/actorId", code: "required", message: "Organization admin identity is required" }]);
  return { ...publication, status: "published", approval: { ...publication.approval, approvedAt: now, approvedBy: actorId } };
}

export function revokePublication(publication, { now = new Date().toISOString() } = {}) {
  if (publication.status === "revoked") throw new ContractError("Publication is already revoked", [{ path: "/status", code: "conflict", message: "Publication was already revoked" }]);
  return { ...publication, status: "revoked", revokedAt: now };
}

export function publicationFreshness(publication, dataSources = []) {
  const byId = new Map(dataSources.map((source) => [source.id, source]));
  const datasets = publication.dataSnapshots.map((snapshot) => {
    if (!snapshot.datasetFingerprint) return { datasetId: snapshot.datasetId, status: snapshot.kind === "embedded" ? "embedded" : "missing" };
    const current = byId.get(snapshot.datasetId);
    if (!current) return { datasetId: snapshot.datasetId, status: "missing", publishedFingerprint: snapshot.datasetFingerprint };
    return {
      datasetId: snapshot.datasetId,
      status: current.fingerprint === snapshot.datasetFingerprint && (current.semanticModel?.version || 1) === snapshot.semanticVersion ? "current" : "stale",
      publishedFingerprint: snapshot.datasetFingerprint,
      currentFingerprint: current.fingerprint,
      publishedSemanticVersion: snapshot.semanticVersion,
      currentSemanticVersion: current.semanticModel?.version || 1
    };
  });
  return { status: datasets.some(({ status }) => status === "missing") ? "missing" : datasets.some(({ status }) => status === "stale") ? "stale" : "current", datasets };
}
