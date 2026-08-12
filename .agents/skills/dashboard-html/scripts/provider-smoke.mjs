import { pathToFileURL } from "node:url";
import { createProviderFromEnv, providerHealth, runGenerationWithProvider } from "./provider-gateway.mjs";

const baseline = {
  version: 2,
  theme: { preset: "fx-orange", pageType: "dashboard", language: "zh", accent: "#e8590c", mode: "light" },
  layout: { sections: [] },
  logo: null
};

function fail(message) {
  throw new Error(message);
}

function durationMs(startedAt) {
  return Math.round(performance.now() - startedAt);
}

function summary(run) {
  return {
    status: run.status,
    repairAttempts: run.repairAttempts || 0,
    commandCount: run.bundle?.commands?.operations?.length || 0,
    componentCount: run.preview?.workspace?.document?.sections?.flatMap(({ components }) => components).length || 0,
    ...(run.usage ? { usage: run.usage } : {})
  };
}

export async function runProviderSmoke(env = process.env) {
  if (String(env.DASHBOARD_AI_PROVIDER || "").toLowerCase() !== "openai") fail("Set DASHBOARD_AI_PROVIDER=openai before running the remote provider smoke test");
  const provider = createProviderFromEnv(env);
  const health = providerHealth(provider);
  if (!provider.configured) fail(`Remote provider is unavailable: ${health.error || "configuration error"}`);

  const startedAt = performance.now();
  const draft = await runGenerationWithProvider(provider, {
    mode: "draft",
    request: { id: "provider-smoke-draft", prompt: "生成销售经营看板，展示月度收入趋势和渠道构成", language: "zh", pageType: "dashboard", dataInputs: [] },
    baseWorkspace: baseline,
    runId: "provider-smoke-draft"
  });
  if (draft.status !== "preview-ready") fail(`Draft did not reach preview-ready: ${draft.error?.message || draft.status}`);
  const chart = draft.preview.workspace.document.sections.flatMap(({ components }) => components).find(({ type }) => type === "chart");
  if (!chart) fail("Draft did not create a controlled chart for the refinement check");

  const refineStartedAt = performance.now();
  const draftDurationMs = Math.round(refineStartedAt - startedAt);
  const refinement = await runGenerationWithProvider(provider, {
    mode: "refine",
    request: { id: "provider-smoke-refine", prompt: "改成面积图，卡片标题改为“真实 smoke 趋势”", language: "zh", pageType: "dashboard", dataInputs: [], scope: { kind: "component", id: chart.id } },
    baseWorkspace: draft.preview.workspace,
    runId: "provider-smoke-refine"
  });
  if (refinement.status !== "preview-ready") fail(`Refinement did not reach preview-ready: ${refinement.error?.message || refinement.status}`);
  return {
    provider: health.provider,
    model: health.model || null,
    draft: { ...summary(draft), durationMs: draftDurationMs },
    refinement: { ...summary(refinement), durationMs: durationMs(refineStartedAt) },
    committed: false
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runProviderSmoke().then((result) => console.log(JSON.stringify(result))).catch((error) => {
    console.error(`Provider smoke failed: ${error.message}`);
    process.exitCode = 1;
  });
}
