import { ContractError, createInverseCommandBatch, diffWorkspaces, materializeGenerationBundle, migrateWorkspace, validateGenerationBundle } from "./workspace-core.mjs";

export const generationStages = Object.freeze([
  "intake",
  "normalized",
  "planning",
  "generating",
  "validating",
  "repairing",
  "preview-ready",
  "committed",
  "failed",
  "cancelled"
]);

const transitions = Object.freeze({
  intake: new Set(["normalized", "failed", "cancelled"]),
  normalized: new Set(["planning", "failed", "cancelled"]),
  planning: new Set(["generating", "repairing", "failed", "cancelled"]),
  generating: new Set(["validating", "failed", "cancelled"]),
  validating: new Set(["repairing", "preview-ready", "failed", "cancelled"]),
  repairing: new Set(["generating", "validating", "failed", "cancelled"]),
  "preview-ready": new Set(["committed", "generating", "cancelled"]),
  committed: new Set(),
  failed: new Set(),
  cancelled: new Set()
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, field, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ContractError("Generation request is incomplete", [{ path: `/request/${field}`, code: "required", message: `${field} is required` }]);
  return text.slice(0, maxLength);
}

export function normalizeGenerationRequest(input, defaults = {}) {
  if (!isObject(input)) throw new ContractError("Generation request must be an object");
  const language = ["zh", "en"].includes(input.language) ? input.language : defaults.language || "zh";
  const pageType = ["auto", "dashboard", "report"].includes(input.pageType) ? input.pageType : "auto";
  const dataInputs = Array.isArray(input.dataInputs) ? input.dataInputs.map((source, index) => ({
    id: requiredText(source?.id || `data-${index + 1}`, `dataInputs/${index}/id`, 100),
    kind: ["description", "uploaded", "api", "sample"].includes(source?.kind) ? source.kind : "description",
    name: requiredText(source?.name, `dataInputs/${index}/name`, 200),
    ...(source?.schemaRef ? { schemaRef: String(source.schemaRef) } : {})
  })) : [];
  if (new Set(dataInputs.map(({ id }) => id)).size !== dataInputs.length) throw new ContractError("Generation request has duplicate data inputs", [{ path: "/request/dataInputs", code: "unique", message: "Data input ids must be unique" }]);
  return {
    id: requiredText(input.id || defaults.id, "id", 100),
    prompt: requiredText(input.prompt, "prompt", 12000),
    language,
    pageType,
    ...(input.audience ? { audience: String(input.audience).trim().slice(0, 200) } : {}),
    ...(isObject(input.scope) && ["workspace", "section", "component"].includes(input.scope.kind)
      ? { scope: { kind: input.scope.kind, ...(["section", "component"].includes(input.scope.kind) ? { id: requiredText(input.scope.id, "scope/id", 100) } : {}) } }
      : {}),
    dataInputs
  };
}

function appendEvent(run, stage, at, details) {
  const event = { sequence: run.events.length + 1, stage, at };
  if (details && Object.keys(details).length) event.details = structuredClone(details);
  run.events.push(event);
}

export function createGenerationRun(input, { runId, now = new Date().toISOString(), defaults = {} } = {}) {
  if (!runId) throw new ContractError("Generation run id is required");
  const request = normalizeGenerationRequest(input, defaults);
  const run = {
    version: 1,
    id: runId,
    status: "intake",
    request,
    repairAttempts: 0,
    events: []
  };
  appendEvent(run, "intake", now, { requestId: request.id });
  return transitionGenerationRun(run, "normalized", { at: now });
}

export function transitionGenerationRun(input, nextStatus, { at = new Date().toISOString(), details } = {}) {
  const run = structuredClone(input);
  if (!generationStages.includes(run.status) || !generationStages.includes(nextStatus)) throw new ContractError("Generation run contains an unknown status");
  if (!transitions[run.status].has(nextStatus)) throw new ContractError("Generation stage transition is not allowed", [{ path: "/status", code: "transition", message: `${run.status} cannot transition to ${nextStatus}` }]);
  run.status = nextStatus;
  appendEvent(run, nextStatus, at, details);
  return run;
}

export function startPlanning(run, options) {
  return transitionGenerationRun(run, "planning", options);
}

export function acceptPlan(run, plan, options = {}) {
  if (!new Set(["planning", "repairing"]).has(run.status)) throw new ContractError("Plan can only be accepted during planning or repair");
  if (!isObject(plan) || !Array.isArray(plan.sections) || !plan.sections.length) throw new ContractError("Plan is invalid", [{ path: "/plan/sections", code: "required", message: "Plan requires sections" }]);
  const next = transitionGenerationRun(run, "generating", { ...options, details: { sectionCount: plan.sections.length } });
  next.plan = structuredClone(plan);
  return next;
}

export function acceptGenerationBundle(run, bundle, options = {}) {
  if (!new Set(["generating", "repairing"]).has(run.status)) throw new ContractError("Bundle can only be accepted during generation or repair");
  const next = transitionGenerationRun(run, "validating", options);
  next.bundle = structuredClone(bundle);
  return next;
}

export function prepareGenerationPreview(run, baseWorkspace, { at = new Date().toISOString() } = {}) {
  if (run.status !== "validating") throw new ContractError("Preview preparation requires validating status");
  try {
    const baseline = migrateWorkspace(baseWorkspace);
    const workspace = materializeGenerationBundle(baseline, run.bundle);
    const diff = diffWorkspaces(baseline, workspace);
    const next = transitionGenerationRun(run, "preview-ready", { at, details: { validation: "passed", changeCount: diff.length } });
    next.preview = { workspace, baseWorkspace: baseline, diff, isolated: true };
    delete next.error;
    return next;
  } catch (error) {
    const issues = error instanceof ContractError ? error.issues : [];
    if (run.repairAttempts < 1) {
      const next = transitionGenerationRun(run, "repairing", { at, details: { validation: "failed", issues } });
      next.repairAttempts += 1;
      next.error = { message: error.message, issues };
      return next;
    }
    const next = transitionGenerationRun(run, "failed", { at, details: { validation: "failed", issues } });
    next.error = { message: error.message, issues };
    return next;
  }
}

export function commitGenerationPreview(run, { revisionId, at = new Date().toISOString() } = {}) {
  if (run.status !== "preview-ready" || !run.preview?.workspace) throw new ContractError("Only a validated preview can be committed");
  if (!revisionId) throw new ContractError("Revision id is required");
  const validation = validateGenerationBundle(run.bundle);
  if (!validation.valid) throw new ContractError("Generation bundle changed after preview validation", validation.issues);
  if (JSON.stringify(run.preview.workspace) !== JSON.stringify(run.bundle.workspace)) {
    throw new ContractError("Preview workspace changed after validation", [{ path: "/preview/workspace", code: "tampered", message: "Preview must match the validated bundle workspace" }]);
  }
  if (!run.preview.baseWorkspace || JSON.stringify(materializeGenerationBundle(run.preview.baseWorkspace, run.bundle)) !== JSON.stringify(run.preview.workspace)) {
    throw new ContractError("Preview baseline changed after validation", [{ path: "/preview/baseWorkspace", code: "tampered", message: "Preview baseline must reproduce the validated workspace" }]);
  }
  const next = transitionGenerationRun(run, "committed", { at, details: { revisionId } });
  next.revision = {
    version: 1,
    id: revisionId,
    createdAt: at,
    source: "agent",
    requestId: run.request.id,
    batchId: run.bundle.commands.batchId,
    summary: run.bundle.commands.reason || run.bundle.plan.goal,
    commands: structuredClone(run.bundle.commands),
    inverseCommands: createInverseCommandBatch(run.preview.baseWorkspace, run.bundle.commands),
    workspace: structuredClone(run.preview.workspace)
  };
  return next;
}

export function inspectGenerationBundle(bundle) {
  return validateGenerationBundle(bundle);
}
