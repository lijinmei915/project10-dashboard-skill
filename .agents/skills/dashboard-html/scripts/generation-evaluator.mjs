import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDataContext, parseDataSource } from "./data-source-service.mjs";
import { createProviderFromEnv, providerHealth, runGenerationWithProvider } from "./provider-gateway.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../../..");
const defaultCasesPath = path.join(repoRoot, "evals/generation-cases.json");
const baseline = {
  version: 2,
  theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" },
  layout: { sections: [] },
  logo: null
};

function ratio(passed, total) {
  return total ? passed / total : 0;
}

function check(name, passed, weight, detail = null) {
  return { name, passed: Boolean(passed), weight, ...(detail ? { detail } : {}) };
}

function workspaceIndex(workspace) {
  const sections = workspace?.document?.sections || [];
  const components = sections.flatMap(({ components: items }) => items || []);
  const componentIds = components.map(({ id }) => id);
  const layoutItems = (workspace?.layout?.sections || []).flatMap(({ items }) => items || []);
  return { sections, components, componentIds, layoutItems };
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatMetricValue(value, metric) {
  const format = metric?.format || {};
  const formatted = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: format.maximumFractionDigits ?? 0 }).format(Number(value) * (format.multiplier ?? 1));
  return `${format.prefix ?? ""}${formatted}${format.suffix ?? ""}`;
}

function groundingChecks(workspace, provenance, grounding, dataContext) {
  const { components } = workspaceIndex(workspace);
  const expectedRef = grounding.dataRef;
  const context = dataContext?.context;
  const fields = new Set((context?.fields || []).map(({ id }) => id));
  const metrics = new Map((context?.semanticModel?.metrics || []).map((metric) => [metric.fieldId, metric]));
  const dimensions = new Map((context?.semanticModel?.dimensions || []).map((dimension) => [dimension.fieldId, dimension]));
  const dataBearing = components.filter(({ type }) => ["kpi", "chart", "list", "table"].includes(type));
  const bindings = dataBearing.map(({ binding }) => binding).filter(Boolean);
  const bindingFields = (binding) => binding?.kind === "aggregate" ? [binding.field]
    : binding?.kind === "series" ? [binding.categoryField, binding.valueField]
    : binding?.kind === "rows" ? (binding.columns || []).map(({ field }) => field)
    : binding?.kind === "ranking" ? [binding.labelField, binding.valueField]
    : [];
  const operationsMatch = bindings.every((binding) => {
    if (!binding.operation) return binding.kind === "rows";
    const metric = metrics.get(binding.field || binding.valueField);
    return metric?.aggregation === binding.operation;
  });
  const totals = context?.querySnapshots?.totals;
  const series = context?.querySnapshots?.series;
  const totalIndex = new Map((totals?.columns || []).map(({ id }, index) => [id, index]));
  const seriesIndex = new Map((series?.columns || []).map(({ id }, index) => [id, index]));
  const records = dataContext?.portableDataset?.records || [];
  const snapshotVisibleValuesMatch = (component) => {
    if (component.type === "kpi") {
      const expectedValues = (context?.semanticModel?.metrics || []).map((metric) => formatMetricValue(totals?.rows?.[0]?.[totalIndex.get(metric.id)], metric));
      return expectedValues.includes(component.props?.value);
    }
    if (component.type === "chart") {
      const dimension = context?.semanticModel?.dimensions?.[0];
      const labels = (series?.rows || []).map((row) => String(row[seriesIndex.get(dimension?.id)] ?? ""));
      return same(component.props?.labels, labels) && (context?.semanticModel?.metrics || []).some((metric) => same(component.props?.values, (series?.rows || []).map((row) => Number(row[seriesIndex.get(metric.id)]) || 0)));
    }
    if (component.type === "list") {
      const dimension = context?.semanticModel?.dimensions?.[0];
      return (context?.semanticModel?.metrics || []).some((metric) => {
        const items = (series?.rows || []).map((row) => ({ label: String(row[seriesIndex.get(dimension?.id)] ?? ""), value: Number(row[seriesIndex.get(metric.id)]) || 0 }))
          .sort((left, right) => right.value - left.value).slice(0, component.props?.items?.length || 0);
        return same(component.props?.items, items);
      });
    }
    if (component.type === "table") {
      return same(component.props?.columns, (series?.columns || []).map(({ label }) => label))
        && same(component.props?.rows, (series?.rows || []).map((row) => row.map((value) => value ?? "")));
    }
    return false;
  };
  const visibleValuesMatch = dataBearing.every((component) => {
    const binding = component.binding;
    if (!binding) return !grounding.portable && snapshotVisibleValuesMatch(component);
    if (binding.kind === "aggregate") {
      const metric = metrics.get(binding.field);
      const value = totals?.rows?.[0]?.[totalIndex.get(metric?.id)];
      return Number.isFinite(Number(value)) && component.props?.value === formatMetricValue(value, metric);
    }
    if (binding.kind === "series") {
      const dimension = dimensions.get(binding.categoryField);
      const metric = metrics.get(binding.valueField);
      const labels = (series?.rows || []).map((row) => String(row[seriesIndex.get(dimension?.id)] ?? ""));
      const values = (series?.rows || []).map((row) => Number(row[seriesIndex.get(metric?.id)]) || 0);
      return same(component.props?.labels, labels) && same(component.props?.values, values);
    }
    if (binding.kind === "ranking") {
      const dimension = dimensions.get(binding.labelField);
      const metric = metrics.get(binding.valueField);
      const items = (series?.rows || []).map((row) => ({ label: String(row[seriesIndex.get(dimension?.id)] ?? ""), value: Number(row[seriesIndex.get(metric?.id)]) || 0 }))
        .sort((left, right) => right.value - left.value).slice(0, binding.limit || 10);
      return same(component.props?.items, items);
    }
    if (binding.kind === "rows") {
      const rows = records.slice(0, binding.limit || 100).map((record) => binding.columns.map(({ field }) => record[field] ?? ""));
      return same(component.props?.columns, binding.columns.map(({ label }) => label)) && same(component.props?.rows, rows);
    }
    return false;
  });
  const hasPortableDataset = Boolean(workspace.resources?.datasets?.[expectedRef]);
  return [
    check("grounding-data-reference", dataBearing.length > 0 && dataBearing.every(({ dataRef }) => dataRef === expectedRef), 8, `${dataBearing.length} components`),
    check("grounding-provenance", dataBearing.every(({ id }) => provenance?.components?.[id]?.dataInputId === expectedRef), 5),
    check("grounding-bindings", grounding.portable ? bindings.length === dataBearing.length : bindings.length === 0, 6, `${bindings.length}/${dataBearing.length} bound`),
    check("grounding-fields", bindings.every((binding) => bindingFields(binding).every((field) => fields.has(field))), 6),
    check("grounding-operations", operationsMatch, 5),
    check("grounding-visible-values", visibleValuesMatch, 10),
    check("grounding-portability", hasPortableDataset === Boolean(grounding.portable), 5, hasPortableDataset ? "included" : "excluded"),
    check("grounding-no-sample-label", !workspace.document?.sampleDataLabel && !JSON.stringify(workspace.document).includes("示例数据"), 5)
  ];
}

export function scoreGenerationCase(definition, run, { targetId = null, targetKind = "component", baseWorkspace = null, dataContext = null } = {}) {
  const checks = [
    check("preview-ready", run?.status === "preview-ready", 25),
    check("repair-budget", (run?.repairAttempts || 0) <= 1, 5, `${run?.repairAttempts || 0} repairs`)
  ];
  const workspace = run?.preview?.workspace;
  if (!workspace) return { score: checks.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0), passed: false, checks };
  const expected = definition.expect || {};
  const { sections, components, componentIds, layoutItems } = workspaceIndex(workspace);
  const componentTypes = new Set(components.map(({ type }) => type));
  const chartTypes = new Set(components.filter(({ type }) => type === "chart").map(({ props }) => props?.chartType).filter(Boolean));
  const controlTypes = new Set((workspace.document.controls || []).map(({ type }) => type));
  const layoutIds = new Set(layoutItems.map(({ id }) => id));
  const uniqueIds = new Set(componentIds);
  const provenance = run.bundle?.provenance;
  const provenanceIds = Object.keys(provenance?.components || {});

  if (definition.mode === "refine") {
    const before = new Map(workspaceIndex(baseWorkspace).components.map((component) => [component.id, component]));
    const after = new Map(components.map((component) => [component.id, component]));
    const changedIds = [...new Set([...before.keys(), ...after.keys()])].filter((id) => JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id)));
    const beforeSections = new Map(baseWorkspace.document.sections.map((section) => [section.id, section]));
    const afterSections = new Map(workspace.document.sections.map((section) => [section.id, section]));
    const changedSectionIds = [...new Set([...beforeSections.keys(), ...afterSections.keys()])].filter((id) => JSON.stringify(beforeSections.get(id)) !== JSON.stringify(afterSections.get(id)));
    const targetOnly = targetKind === "section"
      ? Boolean(targetId) && changedSectionIds.length === 1 && changedSectionIds[0] === targetId
      : Boolean(targetId) && changedIds.length === 1 && changedIds[0] === targetId;
    checks.push(check("requested-chart-type", !expected.chartType || chartTypes.has(expected.chartType), 30, [...chartTypes].join(", ") || "none"));
    checks.push(check("requested-section-title", !expected.sectionTitle || afterSections.get(targetId)?.title === expected.sectionTitle, expected.sectionTitle ? 30 : 0, afterSections.get(targetId)?.title || "none"));
    checks.push(check("target-only-change", !expected.targetOnly || targetOnly, 25, (targetKind === "section" ? changedSectionIds : changedIds).join(", ") || "none"));
    checks.push(check("stable-component-identity", uniqueIds.size === componentIds.length && (targetKind !== "component" || !targetId || uniqueIds.has(targetId)), 15));
  } else {
    checks.push(check("section-depth", sections.length >= (expected.minimumSections || 1), 8, `${sections.length} sections`));
    checks.push(check("component-coverage", components.length >= (expected.minimumComponents || 1), 8, `${components.length} components`));
    checks.push(check("required-component-types", (expected.componentTypes || []).every((type) => componentTypes.has(type)), 9, [...componentTypes].join(", ")));
    checks.push(check("page-type", !expected.pageType || workspace.theme.pageType === expected.pageType, 10, workspace.theme.pageType));
    checks.push(check("chart-intent", !expected.chartType || chartTypes.has(expected.chartType), 10, [...chartTypes].join(", ") || "none"));
    checks.push(check("control-intent", (expected.controlTypes || []).every((type) => controlTypes.has(type)), 10, [...controlTypes].join(", ") || "none"));
    checks.push(check("provenance-mode", !expected.provenance || provenance?.mode === expected.provenance, 5, provenance?.mode || "missing"));
    checks.push(check("provenance-coverage", provenanceIds.length === componentIds.length && componentIds.every((id) => provenance?.components?.[id]), 5));
    checks.push(check("editable-identities", uniqueIds.size === componentIds.length && componentIds.every((id) => typeof id === "string" && id.length > 0), 3));
    checks.push(check("layout-references", layoutIds.size === componentIds.length && componentIds.every((id) => layoutIds.has(id)), 2));
    if (expected.grounding) checks.push(...groundingChecks(workspace, provenance, expected.grounding, dataContext));
  }

  const totalWeight = checks.reduce((sum, item) => sum + item.weight, 0);
  const score = Number((checks.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0) / totalWeight * 100).toFixed(2));
  return { score, passed: checks.every(({ passed }) => passed), checks };
}

function validateSuite(suite) {
  if (suite?.version !== 1 || !Array.isArray(suite.cases) || !suite.cases.length) throw new Error("Generation eval suite must contain version 1 cases");
  const ids = new Set();
  for (const item of suite.cases) {
    if (!item?.id || ids.has(item.id)) throw new Error(`Generation eval case id is missing or duplicated: ${item?.id || "empty"}`);
    if (!["draft", "refine"].includes(item.mode)) throw new Error(`Generation eval mode is invalid: ${item.id}`);
    if (!item.request?.prompt || !item.expect) throw new Error(`Generation eval case is incomplete: ${item.id}`);
    if (item.dataSource && (!item.dataSource.id || !item.dataSource.name || !["csv", "json"].includes(item.dataSource.format) || !item.dataSource.fixture)) throw new Error(`Generation eval data source is invalid: ${item.id}`);
    if (item.expect.grounding && !item.dataSource) throw new Error(`Grounding eval requires a data source: ${item.id}`);
    if (item.mode === "refine" && !item.baseCaseId) throw new Error(`Refinement eval requires baseCaseId: ${item.id}`);
    ids.add(item.id);
  }
  for (const item of suite.cases) if (item.baseCaseId && !ids.has(item.baseCaseId)) throw new Error(`Unknown eval base case: ${item.baseCaseId}`);
  const thresholds = suite.thresholds || {};
  for (const [name, value] of Object.entries(thresholds)) if (!Number.isFinite(value) || value < 0) throw new Error(`Generation eval threshold is invalid: ${name}`);
}

function refinementTarget(workspace, selector) {
  const components = workspaceIndex(workspace).components;
  if (selector === "first-section") return workspace.document.sections[0] ? { kind: "section", id: workspace.document.sections[0].id } : null;
  const component = selector === "first-chart" ? components.find(({ type }) => type === "chart") : components.find(({ id }) => id === selector);
  return component ? { kind: "component", id: component.id } : null;
}

export async function runGenerationEvaluation({ provider = createProviderFromEnv(), casesPath = defaultCasesPath, now = "2026-08-11T12:00:00.000Z" } = {}) {
  if (!provider?.configured) throw new Error(`Generation eval provider is unavailable: ${provider?.configurationError?.message || "not configured"}`);
  const suite = JSON.parse(await readFile(casesPath, "utf8"));
  const casesDirectory = path.dirname(path.resolve(casesPath));
  validateSuite(suite);
  const outputs = new Map();
  const results = [];

  for (const definition of suite.cases) {
    const base = definition.mode === "refine" ? outputs.get(definition.baseCaseId) : null;
    if (definition.mode === "refine" && !base?.workspace) throw new Error(`Refinement base did not produce a workspace: ${definition.id}`);
    const target = definition.mode === "refine" ? refinementTarget(base.workspace, definition.target) : null;
    if (definition.mode === "refine" && !target) throw new Error(`Refinement target was not found: ${definition.id}`);
    let dataContext = null;
    if (definition.dataSource) {
      const fixturePath = path.resolve(casesDirectory, definition.dataSource.fixture);
      if (!fixturePath.startsWith(`${casesDirectory}${path.sep}`)) throw new Error(`Generation eval fixture must stay inside the eval directory: ${definition.id}`);
      const content = await readFile(fixturePath, "utf8");
      const source = parseDataSource({ ...definition.dataSource, content, now });
      dataContext = createDataContext(source);
    }
    const request = {
      id: `eval-${definition.id}`,
      ...definition.request,
      dataInputs: dataContext ? [dataContext.input] : [],
      ...(target ? { scope: { kind: target.kind, id: target.id } } : {})
    };
    const startedAt = performance.now();
    const run = await runGenerationWithProvider(provider, {
      mode: definition.mode,
      request,
      baseWorkspace: base?.workspace || baseline,
      dataContexts: dataContext ? [dataContext] : [],
      runId: `eval-${definition.id}`,
      now
    });
    const scored = scoreGenerationCase(definition, run, { targetId: target?.id || null, targetKind: target?.kind || "component", baseWorkspace: base?.workspace || null, dataContext });
    outputs.set(definition.id, { workspace: run.preview?.workspace || null });
    results.push({
      id: definition.id,
      mode: definition.mode,
      score: scored.score,
      passed: scored.passed,
      durationMs: Math.round(performance.now() - startedAt),
      repairAttempts: run.repairAttempts || 0,
      checks: scored.checks
    });
  }

  const thresholds = suite.thresholds;
  const averageScore = results.reduce((sum, item) => sum + item.score, 0) / results.length;
  const passRate = ratio(results.filter(({ passed, score }) => passed && score >= thresholds.minimumCaseScore).length, results.length);
  const passed = averageScore >= thresholds.minimumAverageScore && passRate >= thresholds.requiredPassRate;
  const health = providerHealth(provider);
  return {
    version: 1,
    provider: health.provider,
    model: health.model || null,
    thresholds,
    summary: { passed, caseCount: results.length, averageScore: Number(averageScore.toFixed(2)), passRate: Number(passRate.toFixed(4)) },
    cases: results
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runGenerationEvaluation().then((report) => {
    if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Generation eval: ${report.summary.passed ? "PASS" : "FAIL"} | provider=${report.provider}${report.model ? ` model=${report.model}` : ""} | cases=${report.summary.caseCount} | average=${report.summary.averageScore} | passRate=${report.summary.passRate}`);
      for (const item of report.cases.filter(({ passed, score }) => !passed || score < report.thresholds.minimumCaseScore)) {
        const failures = item.checks.filter(({ passed }) => !passed).map(({ name, detail }) => `${name}${detail ? ` (${detail})` : ""}`).join(", ");
        console.log(`- ${item.id}: score=${item.score}; ${failures || "below threshold"}`);
      }
    }
    if (!report.summary.passed) process.exitCode = 1;
  }).catch((error) => {
    console.error(`Generation evaluation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
