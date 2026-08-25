import { appendProjectRevision, createProject } from "./project-store.mjs";
import { materializeWorkspaceDocument } from "./data-runtime.mjs";
import { ContractError } from "./workspace-core.mjs";

function projectName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 120) throw new ContractError("Project name is invalid", [{ path: "/name", code: "format", message: "Use 1-120 characters" }]);
  return name;
}

export function updateProjectMetadata(project, { name, status, now = new Date().toISOString() } = {}) {
  const next = structuredClone(project);
  if (name !== undefined) next.name = projectName(name);
  if (status !== undefined) {
    if (!["active", "archived"].includes(status)) throw new ContractError("Project status is invalid", [{ path: "/status", code: "enum", message: "Use active or archived" }]);
    next.status = status;
    if (status === "archived") next.archivedAt = now;
    else delete next.archivedAt;
  }
  next.updatedAt = new Date(Math.max(Date.parse(now), Date.parse(project.updatedAt) + 1)).toISOString();
  return next;
}

export function copyProject(source, { id, name, ownerId, organizationId, revisionId, now = new Date().toISOString() } = {}) {
  const sourceRevision = source.revisions.find((revision) => revision.id === (revisionId || source.currentRevisionId));
  if (!sourceRevision) throw new ContractError("Project revision was not found", [{ path: "/revisionId", code: "missing", message: "Revision does not exist" }]);
  return appendProjectRevision(createProject({ id, name: projectName(name || `${source.name} 副本`), ownerId, organizationId, createdAt: now }), {
    id: `revision-copy-${id}`,
    createdAt: now,
    source: "system",
    summary: `复制自 ${source.name}`,
    workspace: sourceRevision.workspace
  });
}

export async function createReportProjectCopy(source, { id, name, ownerId, organizationId, revisionId, resolveDataset, now = new Date().toISOString() } = {}) {
  const sourceRevision = source.revisions.find((revision) => revision.id === (revisionId || source.currentRevisionId));
  if (!sourceRevision) throw new ContractError("Project revision was not found", [{ path: "/revisionId", code: "missing", message: "Revision does not exist" }]);
  if (!["dashboard", "analysis-report"].includes(sourceRevision.workspace.theme.pageType)) throw new ContractError("Only Dashboard or Online Analysis Report revisions can generate a Report copy", [{ path: "/revisionId", code: "compatibility", message: "Choose a Dashboard or Online Analysis Report revision" }]);
  const snapshot = structuredClone(sourceRevision.workspace);
  const datasetIds = [...new Set(snapshot.document.sections.flatMap(({ components }) => components.map(({ dataRef }) => dataRef).filter(Boolean)))];
  for (const datasetId of datasetIds) {
    const existing = snapshot.resources?.datasets?.[datasetId];
    if (existing?.portable && Array.isArray(existing.records)) continue;
    const dataset = await resolveDataset?.(datasetId);
    if (!dataset) throw new ContractError("Report snapshot dataset was not found", [{ path: `/resources/datasets/${datasetId}`, code: "missing", message: "Dataset is unavailable" }]);
    snapshot.resources ||= {};
    snapshot.resources.datasets ||= {};
    snapshot.resources.datasets[datasetId] = { portable: true, records: structuredClone(dataset.records || []) };
  }
  snapshot.document = materializeWorkspaceDocument(snapshot);
  delete snapshot.document.controls;
  for (const component of snapshot.document.sections.flatMap(({ components }) => components)) {
    const visibility = snapshot.interactions?.chartSeriesVisibility?.[component.id];
    if (visibility && Array.isArray(component.props?.series)) {
      const visible = component.props.series.filter(({ name: seriesName }) => visibility[seriesName] !== false);
      if (visible.length) component.props.series = visible;
    }
    delete component.binding;
    delete component.trendBinding;
    delete component.dataRef;
    delete component.props?.selection;
    delete component.props?.drilldown;
    delete component.props?.refreshPolicy;
    delete component.props?.zoom;
  }
  snapshot.theme.pageType = "report";
  delete snapshot.interactions;
  if (snapshot.resources) {
    delete snapshot.resources.datasets;
    if (!Object.keys(snapshot.resources).length) delete snapshot.resources;
  }
  const project = createProject({ id, name: projectName(name || `${source.name} 报告`), ownerId, organizationId, createdAt: now });
  return appendProjectRevision(project, {
    id: `revision-report-${id}`,
    createdAt: now,
    source: "system",
    summary: `由 ${source.name} 生成固定 Report 副本`,
    workspace: snapshot
  });
}
