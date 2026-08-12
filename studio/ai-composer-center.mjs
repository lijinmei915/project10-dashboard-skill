import { diffWorkspaces } from "/studio/workspace-core-client.mjs";

const $ = (selector) => document.querySelector(selector);
const bridge = window.DashboardStudioBridge;

if (!bridge) throw new Error("DashboardStudioBridge is required");

const ui = {
  composer: $("#aiComposer"), toggle: $("#aiComposerToggle"), launcherLabel: $("#aiComposerLauncherLabel"), title: $("#aiComposerTitle"), close: $("#aiComposerClose"), panel: $("#aiComposerPanel"),
  scope: $("#aiScope"), scopeName: $("#aiScopeName"), guide: $("#aiPromptGuide"), componentCapability: $("#aiComponentCapability"), componentTemplate: $("#aiComponentTemplate"), draftTemplates: $("#aiDraftTemplates"), refineTemplates: $("#aiRefineTemplates"), chartRefineTemplates: $("#aiChartRefineTemplates"), prompt: $("#aiPromptInput"), dataSource: $("#aiDataSource"),
  generate: $("#aiGenerateButton"), cancel: $("#aiCancelButton"), accept: $("#aiAcceptButton"), undo: $("#aiUndoButton"), review: $("#aiReview"), reviewTitle: $("#aiReviewTitle"), reviewMeta: $("#aiReviewMeta"), reviewDiff: $("#aiReviewDiff"), historyToggle: $("#aiHistoryToggle"), history: $("#aiHistory"), historyCount: $("#aiHistoryCount"), historyList: $("#aiHistoryList"), historyCompare: $("#aiHistoryCompare"), historyCompareTitle: $("#aiHistoryCompareTitle"), historyCompareMeta: $("#aiHistoryCompareMeta"), historyCompareList: $("#aiHistoryCompareList"), historyCompareClose: $("#aiHistoryCompareClose"), status: $("#aiGenerationStatus"), promptCount: $("#aiPromptCount"), summaryAudience: $("#aiSummaryAudience"), summaryPageType: $("#aiSummaryPageType"), summaryData: $("#aiSummaryData"), summaryComponents: $("#aiSummaryComponents"), summaryNotice: $("#aiSummaryNotice"), dataSourceName: $("#aiDataSourceName"), sampleDataPreference: $("#aiSampleDataPreference"), dataPortable: $("#aiDataPortable")
};
const composerHome = ui.composer.parentNode;
const composerHomeNextSibling = ui.composer.nextSibling;
const generateHome = ui.generate.parentNode;

let serviceChecked = false;
let pendingRun = null;
let baselineWorkspace = null;
let refinementTarget = null;
let chartCatalogLoaded = false;
let activeGenerationJobId = null;
let pendingGenerationJobId = null;
let generationRequestToken = 0;
const generationJobStorageKey = "dashboard-generation-job-v1";

function rememberGenerationJob() {
  try { sessionStorage.setItem(generationJobStorageKey, JSON.stringify({ id: activeGenerationJobId, refinementTarget })); } catch {}
}

function forgetGenerationJob() {
  try { sessionStorage.removeItem(generationJobStorageKey); } catch {}
}

function rememberedGenerationJob() {
  try {
    const value = JSON.parse(sessionStorage.getItem(generationJobStorageKey) || "null");
    return value?.id ? value : null;
  } catch {
    forgetGenerationJob();
    return null;
  }
}

function setState(state) {
  ui.composer.dataset.state = state;
}

function friendlyGenerationError(error, responseStatus = 0) {
  const message = String(error?.message || error || "");
  if (location.protocol === "file:") return "AI 首稿需要通过 npm start 打开本地服务";
  if (!responseStatus || responseStatus === 404 || /ENOENT|Failed to fetch|fetch failed|generation\/(draft|refine|undo)/i.test(message)) return "AI 生成服务未启动，请运行 npm start 后重试";
  if (responseStatus === 429) return "模型请求较多，请稍后重试";
  if (responseStatus === 504) return "模型响应超时，当前画布未修改，请重试或缩短需求";
  if (responseStatus === 503 && /OPENAI_API_KEY|DASHBOARD_AI_MODEL|provider|配置/i.test(message)) return "远程模型尚未完成服务端配置，请检查环境变量后重启服务";
  if (responseStatus === 502 || responseStatus === 503) return "上游模型暂时不可用，当前画布未修改，请稍后重试";
  if (/Try changing|No supported local change/.test(message)) return "当前指令没有匹配可修改字段，请明确标题、副标题、顺序或增删操作";
  if (/Summary duplication is not supported|Select a card inside a content section/.test(message)) return "摘要卡暂不支持复制，请选择内容区中的指标、图表、列表或表格卡片";
  if (/Cannot delete the last component|Move or add another card/.test(message)) return "当前分区只剩一张卡片，请先新增或移动其他卡片后再删除";
  if (/Component cannot move farther|already (?:first|last)/.test(message)) return "当前卡片已经在该方向的边界位置";
  if (/Section component limit/.test(message)) return "当前分区已达到 24 张卡片上限";
  if (/Cannot delete the last section/.test(message)) return "当前是最后一个分区，不能删除";
  if (/Section cannot move farther/.test(message)) return "当前分区已经在该方向的边界位置";
  if (/Section limit reached/.test(message)) return "当前看板已达到 30 个分区上限";
  if (/Workspace changed after|Save or discard later edits/.test(message)) return "接受 AI 修改后页面又有手工变化，已停止撤销以避免覆盖这些变化";
  return message || "生成服务暂时不可用，请稍后重试";
}

function diffLabel(path) {
  if (path === "/layout/canvasOrder") return "画布顺序";
  if (path.endsWith("/props/targets")) return "筛选范围";
  if (/\/theme\/cardOverrides\//.test(path)) return "卡片视觉";
  if (/\/layout\/sections\/\d+\/items\/\d+\/span$/.test(path)) return "卡片宽度";
  if (/\/layout\/sections\/\d+\/items\/\d+$/.test(path)) return "布局项";
  if (/\/document\/sections\/\d+\/components\/\d+$/.test(path)) return "卡片";
  if (/\/document\/sections\/\d+\/components$/.test(path)) return "卡片顺序";
  if (path.endsWith("/props/chartType")) return "图表类型";
  if (path.endsWith("/chartPalette")) return "图表配色";
  if (path.endsWith("/title")) return "标题";
  if (path.endsWith("/subtitle")) return "副标题";
  if (path.endsWith("/props/body")) return "摘要正文";
  return path.split("/").at(-1) || "内容";
}

function diffValue(value) {
  const chartLabels = { line: "折线图", area: "面积图", bar: "柱状图", "horizontal-bar": "条形图", pie: "环形图", categorical: "多色" };
  if (value === undefined || value === null || value === "") return "无";
  if (typeof value === "string") return chartLabels[value] || value;
  if (typeof value === "object" && !Array.isArray(value) && (value.title || value.id)) return value.title || value.id;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.join(" → ");
  if (Array.isArray(value) && value.every((item) => item && typeof item === "object" && (item.title || item.id))) return value.map((item) => item.title || item.id).join(" → ");
  const serialized = JSON.stringify(value);
  return serialized.length > 64 ? `${serialized.slice(0, 61)}...` : serialized;
}

function diffText(change, run) {
  const componentTitle = (id) => run.preview.workspace.document.sections.flatMap(({ components }) => components).find((component) => component.id === id)?.title || id;
  if (change.path === "/layout/canvasOrder") return "已更新画布顺序";
  if (/\/theme\/cardOverrides\//.test(change.path)) return change.after ? "继承当前卡片视觉设置" : "移除卡片视觉设置";
  if (Array.isArray(change.before) && Array.isArray(change.after) && change.before.every((item) => typeof item === "string") && change.after.every((item) => typeof item === "string")) {
    const added = change.after.filter((item) => !change.before.includes(item));
    const removed = change.before.filter((item) => !change.after.includes(item));
    if (added.length) return `加入：${added.map(componentTitle).join("、")}`;
    if (removed.length) return `移除：${removed.map(componentTitle).join("、")}`;
    return "顺序已更新";
  }
  if (change.before === undefined && change.after && typeof change.after === "object") return `新增：${diffValue(change.after)}`;
  if (change.after === undefined && change.before && typeof change.before === "object") return `删除：${diffValue(change.before)}`;
  return `${diffValue(change.before)} → ${diffValue(change.after)}`;
}

function renderReview(run) {
  const refinement = ["section", "component"].includes(run.request.scope?.kind);
  const plan = run.bundle.plan;
  ui.reviewDiff.replaceChildren();
  ui.reviewDiff.hidden = !refinement;
  if (refinement) {
    ui.reviewTitle.textContent = plan.title;
    ui.reviewMeta.textContent = `${run.preview.diff.length} 项变更 · 校验通过`;
    run.preview.diff.slice(0, 8).forEach((change) => {
      const row = document.createElement("li");
      const label = document.createElement("b");
      const value = document.createElement("span");
      label.textContent = diffLabel(change.path);
      value.textContent = diffText(change, run);
      value.title = value.textContent;
      row.append(label, value);
      ui.reviewDiff.append(row);
    });
    return;
  }
  const generatedChartTypes = run.preview.workspace.document.sections.flatMap(({ components }) => components).filter(({ type }) => type === "chart").map(({ props }) => ({ line: "折线图", area: "面积图", bar: "柱状图", "horizontal-bar": "条形图", pie: "环形图" }[props.chartType || "bar"]));
  ui.reviewTitle.textContent = plan.title;
  ui.reviewMeta.textContent = `${plan.sections.length} 个分区 · ${plan.sections.reduce((count, section) => count + section.components.length, 0)} 个组件${generatedChartTypes.length ? ` · ${generatedChartTypes.join("、")}` : ""} · ${run.bundle.provenance.mode === "sample" ? "示例数据" : "用户数据"}`;
}

async function checkService() {
  if (serviceChecked || pendingRun || activeGenerationJobId || ui.generate.disabled) return;
  ui.status.textContent = "正在检查生成服务...";
  try {
    const response = await fetch("/api/generation/health", { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.status !== "ok") throw Object.assign(new Error(payload.error || "Generation service unavailable"), { responseStatus: response.status });
    serviceChecked = true;
    setState("idle");
    ui.status.textContent = ui.composer.dataset.mode === "refine" ? "描述要修改的内容" : "输入业务目标后生成可编辑首稿";
  } catch (error) {
    serviceChecked = false;
    setState("error");
    ui.status.textContent = friendlyGenerationError(error, error.responseStatus);
  }
}

function bindRefineTemplate(template) {
  template.addEventListener("click", () => fillTemplate(template.dataset.refineTemplate, "修改指令已填入，可继续补充"));
}

function renderChartRefinementTemplates(charts) {
  const buttons = charts.map((chart) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-prompt-template";
    button.dataset.chartRefine = "true";
    button.dataset.chartType = chart.type;
    button.dataset.refineTemplate = `改成${chart.name}`;
    button.textContent = chart.name;
    bindRefineTemplate(button);
    return button;
  });
  ui.chartRefineTemplates.replaceChildren(...buttons);
}

function renderComponentTemplates(components) {
  const options = components.map((component) => {
    const option = document.createElement("option");
    option.value = component.type;
    option.textContent = component.name;
    option.dataset.prompt = `要求首稿包含${component.name}组件`;
    return option;
  });
  ui.componentTemplate.replaceChildren(ui.componentTemplate.options[0], ...options);
}

async function loadChartCatalog() {
  if (chartCatalogLoaded) return;
  try {
    const response = await fetch("/api/components/catalog", { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    const charts = Array.isArray(payload.charts) ? payload.charts.filter((chart) => typeof chart?.type === "string" && typeof chart?.name === "string") : [];
    const components = Array.isArray(payload.components) ? payload.components.filter((component) => typeof component?.type === "string" && typeof component?.name === "string") : [];
    if (!response.ok || !charts.length || !components.length) return;
    renderChartRefinementTemplates(charts);
    renderComponentTemplates(components);
    chartCatalogLoaded = true;
    syncScope();
  } catch {
    // Static templates keep chart refinement available during a capability-catalog outage.
  }
}

const delay = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function pollGenerationJob(jobId, token) {
  for (;;) {
    await delay(250);
    if (token !== generationRequestToken || activeGenerationJobId !== jobId) return null;
    const response = await fetch(`/api/generation/jobs/${encodeURIComponent(jobId)}`, { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (token !== generationRequestToken || activeGenerationJobId !== jobId) return null;
    if (!response.ok || !payload.job) throw Object.assign(new Error(payload.error || "生成任务查询失败"), { responseStatus: response.status });
    if (["succeeded", "failed", "canceled"].includes(payload.job.status)) return payload.job;
  }
}

async function cancelActiveGeneration() {
  const jobId = activeGenerationJobId;
  if (!jobId) return;
  generationRequestToken += 1;
  activeGenerationJobId = null;
  forgetGenerationJob();
  ui.generate.disabled = true;
  try {
    const response = await fetch(`/api/generation/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 409) throw Object.assign(new Error(payload.error || "停止生成失败"), { responseStatus: response.status });
    if (baselineWorkspace) bridge.applyAiPreview(baselineWorkspace, refinementTarget);
    baselineWorkspace = null;
    refinementTarget = null;
    setState("idle");
    ui.status.textContent = "已停止生成，当前画布未改变";
  } catch (error) {
    setState("error");
    ui.status.textContent = friendlyGenerationError(error, error.responseStatus);
  } finally {
    ui.generate.disabled = false;
    syncScope();
  }
}

function presentCompletedGeneration(run) {
  const refinement = ["section", "component"].includes(run.request.scope?.kind);
  ui.generate.textContent = refinement ? "预览修改" : "生成首稿";
  serviceChecked = true;
  pendingRun = run;
  bridge.applyAiPreview(run.preview.workspace, refinementTarget);
  renderReview(run);
  ui.review.hidden = false;
  setState("ready");
  ui.status.textContent = refinement ? "修改预览已通过校验，接受后才会写入当前草稿" : "首稿预览已通过校验，接受后才会写入当前草稿";
}

async function submitGenerationFeedback(outcome, { revisionId = null, reasonCodes = [] } = {}) {
  const jobId = pendingGenerationJobId;
  pendingGenerationJobId = null;
  if (!jobId) return;
  try {
    await fetch(`/api/generation/jobs/${encodeURIComponent(jobId)}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, reasonCodes, ...(revisionId ? { revisionId } : {}) })
    });
  } catch {
    // Feedback is best-effort and must not block the accepted or dismissed workspace action.
  }
}

async function resumeGenerationJob() {
  const remembered = rememberedGenerationJob();
  if (!remembered || activeGenerationJobId || pendingRun) return;
  const context = bridge.getAiTransactionContext();
  baselineWorkspace = context.currentWorkspace;
  refinementTarget = remembered.refinementTarget || (remembered.refinementCardId ? { kind: "component", id: remembered.refinementCardId } : null);
  activeGenerationJobId = remembered.id;
  const token = ++generationRequestToken;
  setState("working");
  ui.generate.textContent = "停止生成";
  ui.status.textContent = "正在恢复生成任务...";
  try {
    const job = await pollGenerationJob(remembered.id, token);
    if (!job) return;
    activeGenerationJobId = null;
    forgetGenerationJob();
    if (job.status === "canceled") {
      setState("idle");
      ui.status.textContent = "生成任务已取消，当前画布未改变";
      return;
    }
    if (job.status !== "succeeded" || job.run?.status !== "preview-ready") throw Object.assign(new Error(job.error?.message || job.run?.error?.message || "生成结果校验失败"), { responseStatus: 422 });
    pendingGenerationJobId = remembered.id;
    presentCompletedGeneration(job.run);
  } catch (error) {
    activeGenerationJobId = null;
    forgetGenerationJob();
    setState("error");
    ui.status.textContent = friendlyGenerationError(error, error.responseStatus);
  } finally {
    if (!activeGenerationJobId) syncScope();
  }
}

async function requestCandidate() {
  if (activeGenerationJobId) return cancelActiveGeneration();
  const prompt = ui.prompt.value.trim();
  if (!prompt) {
    ui.status.textContent = "请先描述业务目标";
    ui.prompt.focus();
    return;
  }
  const context = bridge.getAiTransactionContext();
  const target = context.target;
  const refinement = Boolean(target);
  baselineWorkspace = context.currentWorkspace;
  refinementTarget = target ? { kind: target.kind, id: target.id } : null;
  ui.generate.disabled = true;
  ui.review.hidden = true;
  ui.undo.hidden = true;
  setState("working");
  ui.status.textContent = refinement ? "正在生成局部命令并计算差异..." : "正在规划页面并校验首稿...";
  let responseStatus = 0;
  try {
    const token = ++generationRequestToken;
    const response = await fetch("/api/generation/jobs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: refinement ? "refine" : "draft",
        request: {
          id: `request-${Date.now()}`, prompt, language: context.language || "zh", pageType: "auto", audience: "业务负责人",
          ...(refinement ? { scope: { kind: target.kind, id: target.id } } : {}),
          dataInputs: refinement || !context.dataSource ? [] : [{ id: context.dataSource.id, kind: "uploaded", name: context.dataSource.name }]
        },
        baseWorkspace: baselineWorkspace
      })
    });
    responseStatus = response.status;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.job?.id) throw new Error(payload.issues?.[0]?.message || payload.error || "生成任务创建失败");
    activeGenerationJobId = payload.job.id;
    rememberGenerationJob();
    ui.generate.disabled = false;
    ui.generate.textContent = "停止生成";
    const job = await pollGenerationJob(payload.job.id, token);
    if (!job) return;
    activeGenerationJobId = null;
    forgetGenerationJob();
    if (job.status === "canceled") return;
    if (job.status !== "succeeded" || job.run?.status !== "preview-ready") throw Object.assign(new Error(job.error?.message || job.run?.error?.message || "生成结果校验失败"), { responseStatus: job.error?.httpStatus || 422 });
    pendingGenerationJobId = payload.job.id;
    presentCompletedGeneration(job.run);
  } catch (error) {
    activeGenerationJobId = null;
    forgetGenerationJob();
    pendingRun = null;
    if (baselineWorkspace) bridge.applyAiPreview(baselineWorkspace, refinementTarget);
    refinementTarget = null;
    setState("error");
    ui.status.textContent = friendlyGenerationError(error, responseStatus);
  } finally {
    ui.generate.disabled = false;
    if (!activeGenerationJobId) syncScope();
  }
}

async function cancelCandidate() {
  const refinement = ["section", "component"].includes(pendingRun?.request?.scope?.kind);
  if (baselineWorkspace) bridge.applyAiPreview(baselineWorkspace, refinementTarget);
  pendingRun = null;
  baselineWorkspace = null;
  refinementTarget = null;
  ui.review.hidden = true;
  ui.reviewDiff.replaceChildren();
  setState("idle");
  ui.status.textContent = refinement ? "已取消修改预览，原卡片未改变" : "已取消首稿预览，原草稿未改变";
  await submitGenerationFeedback("dismissed");
  syncScope();
}

async function acceptCandidate() {
  if (!pendingRun) return;
  const refinement = ["section", "component"].includes(pendingRun.request.scope?.kind);
  ui.accept.disabled = true;
  setState("working");
  ui.status.textContent = refinement ? "正在提交局部修改版本..." : "正在提交首稿版本...";
  try {
    const { project } = bridge.getAiTransactionContext();
    const response = await fetch("/api/generation/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run: pendingRun, revisionId: `revision-${Date.now()}`, project }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.revision) throw new Error(payload.error || "版本提交失败");
    bridge.applyAiCommit(payload);
    await submitGenerationFeedback("accepted", { revisionId: payload.revision.id });
    pendingRun = null;
    baselineWorkspace = null;
    refinementTarget = null;
    ui.review.hidden = true;
    ui.undo.hidden = !payload.revision.inverseCommands;
    setState("idle");
    ui.status.textContent = `${refinement ? "修改" : "首稿"}已接受 · ${payload.revision.id}`;
    syncScope();
    refreshHistory();
  } catch (error) {
    setState("error");
    ui.status.textContent = `提交失败：${friendlyGenerationError(error)}`;
  } finally {
    ui.accept.disabled = false;
  }
}

async function undoAcceptedChange() {
  const context = bridge.getAiTransactionContext();
  if (!context.project || !context.revision?.inverseCommands) return;
  ui.undo.disabled = true;
  setState("working");
  ui.status.textContent = "正在撤销本次 AI 修改...";
  try {
    const response = await fetch("/api/generation/undo", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: context.project, revisionId: context.revision.id, currentWorkspace: context.currentWorkspace, undoRevisionId: `revision-undo-${Date.now()}` })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.workspace || !payload.revision) throw Object.assign(new Error(payload.issues?.[0]?.message || payload.error || "撤销失败"), { responseStatus: response.status });
    bridge.applyAiUndo(payload);
    ui.undo.hidden = true;
    setState("idle");
    ui.status.textContent = "已整体撤销本次 AI 修改";
    syncScope();
    refreshHistory();
  } catch (error) {
    setState("error");
    ui.status.textContent = friendlyGenerationError(error, error.responseStatus || 422);
  } finally {
    ui.undo.disabled = false;
  }
}

function friendlyHistoryError(error, responseStatus = 0) {
  const message = String(error?.message || error || "");
  if (location.protocol === "file:") return "版本历史需要通过 npm start 打开本地服务";
  if (!responseStatus || responseStatus === 404 || /Failed to fetch|fetch failed/i.test(message)) return "AI 生成服务未启动，请运行 npm start 后重试";
  if (/Choose an earlier revision|already current/.test(message)) return "该版本已经是当前版本";
  if (/Save or discard later edits before restoring|Workspace changed after the current revision/.test(message)) return "当前画布有手动修改，请先保存或放弃这些修改，再恢复历史版本";
  return message || "版本历史服务暂时不可用，请稍后重试";
}

function formatRevisionTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function renderHistory(payload) {
  const revisions = [...(payload?.revisions || [])].reverse();
  ui.historyCount.textContent = `${revisions.length} 个版本`;
  ui.historyList.replaceChildren();
  ui.historyCompare.hidden = true;
  ui.historyCompareList.replaceChildren();
  if (!revisions.length) {
    const empty = document.createElement("p");
    empty.className = "ai-history-empty";
    empty.textContent = "接受一版 AI 生成或修改后，版本会保留在这里。";
    ui.historyList.append(empty);
    return;
  }
  const sourceLabels = { agent: "AI", user: "用户", system: "系统" };
  revisions.forEach((revision) => {
    const current = revision.id === payload.currentRevisionId;
    const item = document.createElement("article");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    item.className = "ai-history-item";
    copy.className = "ai-history-copy";
    title.textContent = revision.summary || revision.id;
    title.title = title.textContent;
    meta.textContent = `${formatRevisionTime(revision.createdAt)} · ${sourceLabels[revision.source] || "未知来源"}`;
    copy.append(title, meta);
    if (current) {
      const marker = document.createElement("span");
      marker.className = "ai-history-current";
      marker.textContent = "当前";
      item.append(copy, marker);
    } else {
      const actions = document.createElement("span");
      actions.className = "ai-history-actions";
      const compare = document.createElement("button");
      compare.type = "button";
      compare.className = "ai-history-compare-button";
      compare.textContent = "比较";
      compare.addEventListener("click", () => compareRevision(revision.id));
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "ai-history-restore";
      restore.textContent = "恢复";
      restore.addEventListener("click", () => restoreRevision(revision.id, restore));
      actions.append(compare, restore);
      item.append(copy, actions);
    }
    ui.historyList.append(item);
  });
}

function historyCompareValue(change) {
  if (change.kind === "reordered") return "顺序已调整";
  if (change.kind === "added") return `新增：${diffValue(change.after)}`;
  if (change.kind === "removed") return `移除：${diffValue(change.before)}`;
  return `${diffValue(change.before)} → ${diffValue(change.after)}`;
}

function compareRevision(revisionId) {
  const { project } = bridge.getAiHistoryContext();
  const current = project?.revisions?.find(({ id }) => id === project.currentRevisionId);
  const target = project?.revisions?.find(({ id }) => id === revisionId);
  if (!current || !target) {
    ui.status.textContent = "版本内容不可用，请刷新历史后重试";
    return;
  }
  const changes = diffWorkspaces(target.workspace, current.workspace, { limit: 12 });
  ui.historyCompareTitle.textContent = "与当前版本比较";
  ui.historyCompareMeta.textContent = `${target.summary || target.id} → ${current.summary || current.id} · ${changes.length} 项变更`;
  if (!changes.length) {
    const empty = document.createElement("li");
    empty.textContent = "内容和布局没有差异";
    ui.historyCompareList.replaceChildren(empty);
  } else ui.historyCompareList.replaceChildren(...changes.map((change) => {
    const row = document.createElement("li");
    const label = document.createElement("b");
    const value = document.createElement("span");
    label.textContent = diffLabel(change.path);
    value.textContent = historyCompareValue(change);
    value.title = value.textContent;
    row.append(label, value);
    return row;
  }));
  ui.historyCompare.hidden = false;
}

async function loadHistory() {
  const { project } = bridge.getAiHistoryContext();
  if (!project) {
    renderHistory({ currentRevisionId: null, revisions: [] });
    return;
  }
  ui.historyCount.textContent = "加载中";
  try {
    const response = await fetch("/api/generation/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error || "版本历史加载失败"), { responseStatus: response.status });
    renderHistory(payload);
  } catch (error) {
    ui.historyCount.textContent = "加载失败";
    ui.historyList.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "ai-history-empty";
    empty.textContent = friendlyHistoryError(error, error.responseStatus);
    ui.historyList.append(empty);
  }
}

function setHistoryOpen(open) {
  ui.history.hidden = !open;
  ui.historyToggle.setAttribute("aria-expanded", String(open));
  if (open) loadHistory();
}

async function restoreRevision(revisionId, button) {
  const context = bridge.getAiHistoryContext();
  if (!context.project || !revisionId) return;
  button.disabled = true;
  ui.status.textContent = "正在恢复历史版本...";
  ui.composer.dataset.state = "working";
  try {
    const response = await fetch("/api/generation/restore", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: context.project, revisionId, currentWorkspace: context.currentWorkspace, restoreRevisionId: `revision-restore-${Date.now()}` })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.workspace || !payload.revision) throw Object.assign(new Error(payload.issues?.[0]?.message || payload.error || "版本恢复失败"), { responseStatus: response.status });
    bridge.applyRestoredRevision(payload);
    pendingRun = null;
    baselineWorkspace = null;
    refinementTarget = null;
    ui.review.hidden = true;
    ui.undo.hidden = true;
    ui.composer.dataset.state = "idle";
    ui.status.textContent = `已恢复为历史版本，并创建新版本 · ${payload.revision.id}`;
    await loadHistory();
  } catch (error) {
    ui.composer.dataset.state = "error";
    ui.status.textContent = friendlyHistoryError(error, error.responseStatus || 422);
  } finally {
    button.disabled = false;
  }
}

function syncScope() {
  const context = bridge.getAiComposerContext();
  if (pendingRun || activeGenerationJobId) return;
  const transaction = bridge.getAiTransactionContext();
  ui.undo.hidden = !(transaction.revision?.inverseCommands && JSON.stringify(transaction.revision.workspace) === JSON.stringify(transaction.currentWorkspace));
  const target = context.target;
  const refinement = Boolean(target);
  const sectionRefinement = target?.kind === "section";
  ui.composer.dataset.mode = refinement ? "refine" : "draft";
  ui.launcherLabel.textContent = refinement ? "AI 修改" : "AI 生成";
  ui.title.textContent = sectionRefinement ? "AI 修改分区" : refinement ? "AI 修改卡片" : "AI 生成首稿";
  ui.scope.hidden = !refinement;
  ui.scope.querySelector("span").textContent = sectionRefinement ? "当前分区" : "当前卡片";
  ui.scopeName.textContent = target?.title || "";
  ui.draftTemplates.hidden = refinement;
  ui.componentCapability.hidden = refinement;
  ui.refineTemplates.hidden = !refinement;
  ui.refineTemplates.querySelectorAll("[data-component-refine]").forEach((button) => { button.hidden = sectionRefinement; });
  ui.refineTemplates.querySelectorAll("[data-section-refine]").forEach((button) => { button.hidden = !sectionRefinement; });
  ui.dataSource.hidden = refinement;
  ui.chartRefineTemplates.hidden = target?.type !== "chart";
  ui.guide.innerHTML = sectionRefinement
    ? "<strong>修改范围</strong>：只处理当前分区；支持标题、副标题、新增/删除和前后顺序，执行前会展示差异"
    : refinement
    ? "<strong>修改范围</strong>：只处理当前卡片；支持内容、图表、复制/新增/删除、宽度和前后顺序，执行前会展示差异"
    : "<strong>需求结构</strong>：使用对象 + 业务场景 + 重点指标 + 时间范围；可直接指定折线图、面积图、柱状图或环形图";
  ui.prompt.placeholder = sectionRefinement
    ? "例如：标题改为“转化分析”，或在后面新增一个说明分区"
    : refinement
    ? (target.type === "chart" ? "例如：复制当前卡片，再将当前图表改成环形图" : "例如：改为半宽，或复制当前卡片")
    : "例如：为销售负责人生成季度经营 Dashboard，用折线图展示最近 12 个月收入趋势";
  ui.generate.textContent = refinement ? "预览修改" : "生成首稿";
  ui.cancel.textContent = refinement ? "取消修改" : "取消预览";
  ui.accept.textContent = refinement ? "接受修改" : "接受并编辑";
}

function setOpen(open, { focus = false } = {}) {
  if (open) syncScope();
  document.body.dataset.aiComposerOpen = String(open);
  ui.composer.dataset.open = String(open);
  ui.toggle.setAttribute("aria-expanded", String(open));
  ui.panel.setAttribute("aria-hidden", String(!open));
  ui.panel.inert = !open;
  if (open) {
    checkService();
    loadChartCatalog();
    if (focus) window.setTimeout(() => ui.prompt.focus(), 0);
  } else {
    setHistoryOpen(false);
    ui.toggle.focus();
  }
}

function setEmbedded(host = null, { focus = false } = {}) {
  if (host) {
    host.append(ui.composer);
    document.querySelector("#projectPrimaryActions")?.append(ui.generate);
    ui.composer.dataset.embedded = "true";
    setOpen(true, { focus });
    return;
  }
  delete ui.composer.dataset.embedded;
  generateHome.append(ui.generate);
  composerHome.insertBefore(ui.composer, composerHomeNextSibling);
}

function fillTemplate(value, message) {
  ui.prompt.value = value;
  ui.prompt.focus();
  ui.prompt.setSelectionRange(ui.prompt.value.length, ui.prompt.value.length);
  ui.status.textContent = message;
  syncDraftSummary();
}

function syncDraftSummary() {
  if (!ui.promptCount) return;
  const prompt = ui.prompt.value.trim();
  ui.promptCount.textContent = `${ui.prompt.value.length} / ${ui.prompt.maxLength}`;
  const audience = prompt.match(/为([^，。；]{2,16}?)(?:生成|制作|创建)/)?.[1];
  ui.summaryAudience.textContent = audience || "待识别";
  ui.summaryPageType.textContent = /\bReport\b|报告|复盘/i.test(prompt) ? "Report" : "Dashboard";
  const sourceName = ui.dataSourceName?.textContent?.trim();
  ui.summaryData.textContent = sourceName && sourceName !== "未选择数据" ? sourceName : "示例数据";
  const componentLabels = [];
  if (/指标|金额|数量|转化率|完成率/.test(prompt)) componentLabels.push("指标卡");
  if (/趋势|折线|面积|柱状/.test(prompt)) componentLabels.push("趋势图");
  if (/渠道|占比|环形|排行/.test(prompt)) componentLabels.push("排行或占比图");
  if (/风险|异常|问题/.test(prompt)) componentLabels.push("风险事项");
  if (!componentLabels.length) componentLabels.push("指标卡", "趋势图", "明细列表");
  ui.summaryComponents.replaceChildren(...componentLabels.slice(0, 4).map((label) => {
    const item = document.createElement("li"); item.textContent = label; return item;
  }));
  ui.summaryNotice.textContent = prompt ? "配置已就绪，可继续修改后生成" : "选择模板或输入需求后，系统将在这里整理生成范围";
}

ui.generate.addEventListener("click", requestCandidate);
ui.generate.dataset.bound = "true";
ui.cancel.addEventListener("click", cancelCandidate);
ui.accept.addEventListener("click", acceptCandidate);
ui.cancel.dataset.bound = "true"; ui.accept.dataset.bound = "true";
ui.undo.addEventListener("click", undoAcceptedChange);
ui.historyToggle.addEventListener("click", () => setHistoryOpen(ui.history.hidden));
ui.historyCompareClose.addEventListener("click", () => { ui.historyCompare.hidden = true; });
ui.toggle.addEventListener("click", () => setOpen(true, { focus: true }));
ui.close.addEventListener("click", () => {
  if (ui.composer.dataset.embedded === "true") window.dispatchEvent(new CustomEvent("dashboard-ai-composer-embedded-close"));
  else setOpen(false);
});
ui.prompt.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") requestCandidate(); });
ui.prompt.addEventListener("input", syncDraftSummary);
document.querySelectorAll("[data-prompt-template]").forEach((template) => template.addEventListener("click", () => {
  document.querySelectorAll("[data-prompt-template]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === template)));
  fillTemplate(template.dataset.promptTemplate, "模板已填入，可继续修改后生成");
}));
document.querySelectorAll("[data-refine-template]").forEach(bindRefineTemplate);
ui.componentTemplate.addEventListener("change", () => {
  const option = ui.componentTemplate.selectedOptions[0];
  if (!option?.dataset.prompt) return;
  const separator = ui.prompt.value.trim() ? "；" : "";
  fillTemplate(`${ui.prompt.value.trim()}${separator}${option.dataset.prompt}。`, `已加入${option.textContent}要求`);
  ui.componentTemplate.value = "";
});
if (ui.dataSourceName) new MutationObserver(syncDraftSummary).observe(ui.dataSourceName, { childList: true, characterData: true, subtree: true });
ui.sampleDataPreference?.addEventListener("change", () => { if (ui.dataPortable) { ui.dataPortable.checked = ui.sampleDataPreference.checked; ui.dataPortable.dispatchEvent(new Event("change", { bubbles: true })); } });
window.addEventListener("dashboard-ai-context-change", syncScope);

function refreshHistory() {
  return !ui.history.hidden && loadHistory();
}

function invalidateUndo() {
  ui.undo.hidden = true;
}

window.DashboardAiComposerCenter = Object.freeze({ setOpen, setEmbedded, syncScope, refreshHistory, invalidateUndo });
syncScope();
syncDraftSummary();
resumeGenerationJob();
