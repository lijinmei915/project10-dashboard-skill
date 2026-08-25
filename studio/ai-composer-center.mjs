import { diffWorkspaces } from "/studio/workspace-core-client.mjs";
import { generationProgressStates, normalizeGenerationProgress } from "/studio/generation-progress-model.mjs";

const $ = (selector) => document.querySelector(selector);
const bridge = window.DashboardStudioBridge;

if (!bridge) throw new Error("DashboardStudioBridge is required");

const ui = {
  composer: $("#aiComposer"), toggle: $("#aiComposerToggle"), launcherLabel: $("#aiComposerLauncherLabel"), title: $("#aiComposerTitle"), close: $("#aiComposerClose"), panel: $("#aiComposerPanel"),
  scope: $("#aiScope"), scopeName: $("#aiScopeName"), guide: $("#aiPromptGuide"), componentCapability: $("#aiComponentCapability"), componentTemplate: $("#aiComponentTemplate"), draftTemplates: $("#aiDraftTemplates"), refineTemplates: $("#aiRefineTemplates"), chartRefineTemplates: $("#aiChartRefineTemplates"), prompt: $("#aiPromptInput"), dataSource: $("#aiDataSource"), reportBody: $(".report-body"),
  generate: $("#aiGenerateButton"), cancel: $("#aiCancelButton"), accept: $("#aiAcceptButton"), undo: $("#aiUndoButton"), review: $("#aiReview"), reviewTitle: $("#aiReviewTitle"), reviewMeta: $("#aiReviewMeta"), reviewDiff: $("#aiReviewDiff"), historyToggle: $("#aiHistoryToggle"), history: $("#aiHistory"), historyCount: $("#aiHistoryCount"), historyList: $("#aiHistoryList"), historyCompare: $("#aiHistoryCompare"), historyCompareTitle: $("#aiHistoryCompareTitle"), historyCompareMeta: $("#aiHistoryCompareMeta"), historyCompareList: $("#aiHistoryCompareList"), historyCompareClose: $("#aiHistoryCompareClose"), status: $("#aiGenerationStatus"), promptCount: $("#aiPromptCount"), pageTypeControls: $("#aiPageTypeControls"), dataSourceName: $("#aiDataSourceName"), dataPortable: $("#aiDataPortable"), canvasBar: $("#canvasGenerationBar"), canvasTitle: $("#canvasGenerationTitle"), canvasMessage: $("#canvasGenerationMessage"), canvasStop: $("#canvasGenerationStop"), canvasAccept: $("#canvasGenerationAccept"), canvasDismiss: $("#canvasGenerationDismiss"), canvasReopen: $("#canvasGenerationReopen")
};
const composerHome = ui.composer.parentNode;
const composerHomeNextSibling = ui.composer.nextSibling;
const generateHome = ui.generate.parentNode;
const chartLabels = { line: "折线图", "combo-bar-line": "柱线复合图", "time-series": "时序图", area: "面积图", bar: "基础柱图", "grouped-bar": "分组柱图", "stacked-bar": "堆叠柱图", "percent-stacked-bar": "百分比堆叠柱图", histogram: "直方图", "horizontal-bar": "基础条图", "grouped-horizontal-bar": "分组条图", "stacked-horizontal-bar": "堆叠条图", "percent-stacked-horizontal-bar": "百分比堆叠条图", "diverging-bar": "双向条图", "ranking-bar": "排名图", gantt: "甘特图", "sector-pie": "饼图", pie: "环图", rose: "玫瑰图", bullet: "子弹图", gauge: "仪表盘", radar: "雷达图", funnel: "漏斗图", "data-table": "表格", categorical: "多色" };

let serviceChecked = false;
let pendingRun = null;
let baselineWorkspace = null;
let refinementTarget = null;
let chartCatalogLoaded = false;
let activeGenerationJobId = null;
let activeGenerationEventSource = null;
let activeGenerationStreamAbort = null;
let pendingGenerationJobId = null;
let generationRequestToken = 0;
let activeGenerationPageType = "dashboard";
let canvasGenerationActive = false;
let progressiveRevealToken = 0;
let streamingPreviewState = null;
const generationJobStorageKey = "dashboard-generation-job-v1";

function rememberGenerationJob() {
  try { sessionStorage.setItem(generationJobStorageKey, JSON.stringify({ id: activeGenerationJobId, refinementTarget, pageType: activeGenerationPageType })); } catch {}
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

function syncCanvasGeneration() {
  if (!ui.canvasBar) return;
  const state = ui.composer.dataset.state;
  const visible = canvasGenerationActive && ["working", "ready", "error"].includes(state);
  ui.canvasBar.hidden = !visible;
  if (!visible) return;
  ui.canvasBar.dataset.state = state;
  ui.canvasMessage.textContent = ui.status.textContent;
  ui.canvasStop.hidden = !(state === "working" && activeGenerationJobId);
  ui.canvasAccept.hidden = state !== "ready" || !pendingRun;
  ui.canvasDismiss.hidden = state !== "ready" || !pendingRun;
  ui.canvasReopen.hidden = state !== "error";
  ui.canvasTitle.textContent = state === "ready" ? "首稿已生成" : state === "error" ? "首稿生成失败" : `正在生成 ${activeGenerationPageType === "report" ? "Report" : "Dashboard"}`;
}

function setState(state) {
  ui.composer.dataset.state = state;
  syncCanvasGeneration();
}

function stopStreamingPreview() {
  streamingPreviewState = null;
  ui.reportBody?.classList.remove("ai-streaming-mode");
  ui.reportBody?.querySelector(".ai-streaming-preview")?.remove();
}

function createStreamingBlock(title, kind = "section") {
  const block = document.createElement("article");
  block.className = "ai-streaming-block";
  block.dataset.state = "pending";
  block.dataset.kind = kind;
  const blockHead = document.createElement("div");
  blockHead.className = "ai-streaming-block-head";
  const blockTitle = document.createElement("strong");
  blockTitle.textContent = title;
  const blockState = document.createElement("span");
  blockState.className = "ai-streaming-block-state";
  const spinner = document.createElement("span");
  spinner.className = "ai-streaming-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const stateText = document.createElement("span");
  blockState.append(spinner, stateText);
  blockHead.append(blockTitle, blockState);
  const lines = document.createElement("div");
  lines.className = "ai-streaming-lines";
  lines.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
  block.append(blockHead, lines);
  return { block, stateText, kind };
}

function renderStreamingBlocks(state, sectionCount) {
  state.blocks.forEach(({ block }) => block.remove());
  state.blocks = Array.from({ length: sectionCount }, (_, index) => createStreamingBlock(state.titles[index] || `内容区 ${index + 1}`));
  state.blocks.push(createStreamingBlock("页面校验", "validation"));
  state.preview.append(...state.blocks.map(({ block }) => block));
  state.sectionCount = sectionCount;
}

function applyStreamingProgress(progress, { completed = false } = {}) {
  const state = streamingPreviewState;
  if (!state) return;
  const normalized = normalizeGenerationProgress(progress, state.sectionCount);
  if (normalized.sectionCount !== state.sectionCount) renderStreamingBlocks(state, normalized.sectionCount);
  const model = generationProgressStates(normalized, { completed });
  state.blocks.forEach(({ block, stateText, kind }, index) => {
    const blockState = kind === "validation" ? model.validation : model.sections[index];
    block.dataset.state = blockState;
    stateText.textContent = blockState === "done" ? "已完成" : blockState === "generating" ? (kind === "validation" ? "正在校验" : "正在生成") : (kind === "validation" ? "等待校验" : "等待生成");
  });
  state.status.textContent = completed
    ? "页面校验完成"
    : model.sectionsReady === 0
      ? "正在生成页面内容..."
      : model.sectionsReady < model.sectionCount
        ? `已完成 ${model.sectionsReady}/${model.sectionCount} 个内容区`
        : "正在校验页面...";
}

function startStreamingPreview(workspace) {
  stopStreamingPreview();
  if (!ui.reportBody || !workspace?.document?.sections?.length) return;
  const preview = document.createElement("div");
  preview.className = "ai-streaming-preview";
  preview.setAttribute("aria-live", "polite");
  const header = document.createElement("div");
  header.className = "ai-streaming-preview-header";
  const heading = document.createElement("strong");
  heading.textContent = "正在逐块生成页面";
  const status = document.createElement("span");
  status.textContent = "准备生成内容...";
  header.append(heading, status);
  preview.append(header);
  ui.reportBody.append(preview);
  ui.reportBody.classList.add("ai-streaming-mode");
  const titles = workspace.document.sections.slice(0, 12).map((section, index) => section.title || `内容区 ${index + 1}`);
  streamingPreviewState = { preview, status, titles, blocks: [], sectionCount: titles.length };
  renderStreamingBlocks(streamingPreviewState, titles.length);
  applyStreamingProgress({ sectionsReady: 0, sectionCount: titles.length });
}

function friendlyGenerationError(error, responseStatus = 0) {
  const message = String(error?.message || error || "");
  if (location.protocol === "file:") return "AI 首稿需要通过 npm start 打开本地服务";
  if (!responseStatus || responseStatus === 404 || /ENOENT|Failed to fetch|fetch failed|generation\/(draft|refine|undo)/i.test(message)) return "AI 生成服务未启动，请运行 npm start 后重试";
  if (responseStatus === 429) return "模型请求较多，请稍后重试";
  if (responseStatus === 504) return "模型响应超时，当前画布未修改，请重试或缩短需求";
  if (/bundle failed validation|invalid streamed JSON|invalid JSON|invalid stream event|结构校验/i.test(message)) return "模型返回内容未通过页面结构校验，已自动修复一次仍失败；当前画布未修改，请重试或简化需求";
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
  const generatedChartTypes = run.preview.workspace.document.sections.flatMap(({ components }) => components).filter(({ type }) => type === "chart").map(({ props }) => chartLabels[props.chartType || "bar"]);
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

async function readGenerationJob(jobId) {
  const response = await fetch(`/api/generation/jobs/${encodeURIComponent(jobId)}`, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.job) throw Object.assign(new Error(payload.error || "生成任务查询失败"), { responseStatus: response.status });
  return payload.job;
}

function streamGenerationJob(jobId, token) {
  return new Promise((resolve, reject) => {
    activeGenerationStreamAbort?.();
    activeGenerationEventSource?.close();
    const source = new EventSource(`/api/generation/jobs/${encodeURIComponent(jobId)}/events`);
    activeGenerationEventSource = source;
    let settled = false;
    let disconnectedAt = null;
    let reconnectNoticeTimer = null;
    let restoreMessageTimer = null;
    let fallbackTimer = null;
    let lastStageMessage = "生成任务已排队...";
    let latestProgress = normalizeGenerationProgress(null, streamingPreviewState?.sectionCount || 0);
    let progressSequence = Promise.resolve();
    let queryPromise = null;
    let finishPromise = null;
    let completionQueued = false;
    let terminalEventObserved = false;
    const isCurrent = () => token === generationRequestToken && activeGenerationJobId === jobId;
    const clearRecoveryTimers = () => {
      if (reconnectNoticeTimer !== null) window.clearTimeout(reconnectNoticeTimer);
      if (restoreMessageTimer !== null) window.clearTimeout(restoreMessageTimer);
      if (fallbackTimer !== null) window.clearInterval(fallbackTimer);
      reconnectNoticeTimer = null;
      restoreMessageTimer = null;
      fallbackTimer = null;
    };
    const cleanup = () => {
      clearRecoveryTimers();
      source.close();
      if (activeGenerationEventSource === source) activeGenerationEventSource = null;
      if (activeGenerationStreamAbort === abort) activeGenerationStreamAbort = null;
    };
    const observeTerminalEvent = () => {
      terminalEventObserved = true;
      clearRecoveryTimers();
      source.close();
    };
    const settle = (handler, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      handler(value);
    };
    const abort = () => settle(resolve, null);
    activeGenerationStreamAbort = abort;
    const stageMessages = {
      queued: "生成任务已排队...",
      starting: "正在分析需求与数据...",
      generating: "正在生成页面内容...",
      validating: "正在校验并组装页面..."
    };
    const applyActiveStage = (stage, status) => {
      const message = stageMessages[stage] || (status === "running" ? lastStageMessage : stageMessages.queued);
      lastStageMessage = message;
      if (isCurrent() && disconnectedAt === null) ui.status.textContent = message;
    };
    const queueProgress = (progress, { completed = false, immediate = false } = {}) => {
      const queuedProgress = normalizeGenerationProgress(progress, latestProgress.sectionCount);
      latestProgress = queuedProgress;
      if (completed) completionQueued = true;
      progressSequence = progressSequence.then(async () => {
        if (settled || !isCurrent()) return;
        applyStreamingProgress(queuedProgress, { completed });
        if (!immediate) await wait(220);
      });
      return progressSequence;
    };
    const finishJob = (job) => {
      if (finishPromise) return finishPromise;
      finishPromise = (async () => {
        if (job.status === "succeeded" && !completionQueued) queueProgress(job.progress, { completed: true });
        await progressSequence;
        settle(resolve, job);
      })();
      return finishPromise;
    };
    const queryJob = () => {
      if (!queryPromise) queryPromise = readGenerationJob(jobId).finally(() => { queryPromise = null; });
      return queryPromise;
    };
    const reconcile = async () => {
      if (settled) return;
      if (!isCurrent()) return abort();
      try {
        const job = await queryJob();
        latestProgress = normalizeGenerationProgress(job.progress, latestProgress.sectionCount);
        if (["succeeded", "failed", "canceled"].includes(job.status)) return await finishJob(job);
        applyStreamingProgress(latestProgress);
        applyActiveStage(job.status === "queued" ? "queued" : "generating", job.status);
      } catch (error) {
        if ([401, 403, 404].includes(error.responseStatus)) settle(reject, error);
      }
    };
    const startFallback = () => {
      if (fallbackTimer !== null || settled) return;
      void reconcile();
      fallbackTimer = window.setInterval(() => {
        if (!isCurrent()) return abort();
        if (disconnectedAt !== null && Date.now() - disconnectedAt >= 30_000) {
          ui.status.textContent = "暂时无法接收实时进度，任务仍在后台运行";
        }
        void reconcile();
      }, 4_000);
    };
    const stages = {
      "job.queued": "生成任务已排队...",
      "job.started": "正在分析需求与数据...",
      "generation.generating": "正在生成页面内容..."
    };
    Object.entries(stages).forEach(([type, message]) => source.addEventListener(type, () => {
      if (!isCurrent()) return abort();
      lastStageMessage = message;
      if (disconnectedAt === null) ui.status.textContent = message;
    }));
    source.addEventListener("section.ready", (event) => {
      if (!isCurrent()) return abort();
      let progressEvent;
      try { progressEvent = JSON.parse(event.data); } catch { return; }
      const progress = { sectionsReady: progressEvent?.sectionIndex, sectionCount: progressEvent?.sectionCount };
      void queueProgress(progress);
      lastStageMessage = "正在校验并组装页面...";
      if (disconnectedAt === null) ui.status.textContent = lastStageMessage;
    });
    source.addEventListener("job.snapshot", (event) => {
      if (!isCurrent()) return abort();
      let snapshot;
      try { snapshot = JSON.parse(event.data); } catch { return; }
      latestProgress = normalizeGenerationProgress(snapshot?.progress, latestProgress.sectionCount);
      if (snapshot?.terminal || ["succeeded", "failed", "canceled"].includes(snapshot?.status)) {
        observeTerminalEvent();
        if (snapshot?.status === "succeeded") void queueProgress(latestProgress, { completed: true, immediate: true });
        return void reconcile();
      }
      applyStreamingProgress(latestProgress);
      applyActiveStage(snapshot?.stage, snapshot?.status);
    });
    source.addEventListener("preview.ready", () => {
      observeTerminalEvent();
      void queueProgress(latestProgress, { completed: true });
      void reconcile();
    }, { once: true });
    ["job.failed", "job.canceled"].forEach((type) => source.addEventListener(type, () => {
      observeTerminalEvent();
      void reconcile();
    }, { once: true }));
    source.onopen = () => {
      if (!isCurrent()) return abort();
      if (terminalEventObserved) return;
      const recovered = disconnectedAt !== null;
      disconnectedAt = null;
      if (reconnectNoticeTimer !== null) window.clearTimeout(reconnectNoticeTimer);
      if (fallbackTimer !== null) window.clearInterval(fallbackTimer);
      reconnectNoticeTimer = null;
      fallbackTimer = null;
      if (!recovered) return;
      ui.status.textContent = "进度连接已恢复，任务仍在后台生成";
      restoreMessageTimer = window.setTimeout(() => {
        restoreMessageTimer = null;
        if (isCurrent() && disconnectedAt === null) ui.status.textContent = lastStageMessage;
      }, 1_000);
    };
    source.onerror = () => {
      if (!isCurrent()) return abort();
      if (terminalEventObserved || settled) return;
      if (disconnectedAt === null) disconnectedAt = Date.now();
      if (restoreMessageTimer !== null) window.clearTimeout(restoreMessageTimer);
      restoreMessageTimer = null;
      if (reconnectNoticeTimer === null) {
        reconnectNoticeTimer = window.setTimeout(() => {
          reconnectNoticeTimer = null;
          if (isCurrent() && disconnectedAt !== null) ui.status.textContent = "进度正在恢复，任务仍在后台生成...";
        }, 1_500);
      }
      startFallback();
    };
  });
}

async function cancelActiveGeneration() {
  const jobId = activeGenerationJobId;
  if (!jobId) return;
  generationRequestToken += 1;
  activeGenerationStreamAbort?.();
  activeGenerationStreamAbort = null;
  activeGenerationEventSource?.close();
  activeGenerationEventSource = null;
  activeGenerationJobId = null;
  forgetGenerationJob();
  ui.generate.disabled = true;
  try {
    const response = await fetch(`/api/generation/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 409) throw Object.assign(new Error(payload.error || "停止生成失败"), { responseStatus: response.status });
    stopStreamingPreview();
    if (baselineWorkspace) bridge.applyAiPreview(baselineWorkspace, refinementTarget);
    baselineWorkspace = null;
    refinementTarget = null;
    canvasGenerationActive = false;
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function revealValidatedSections(run) {
  const token = ++progressiveRevealToken;
  const sectionIds = run.preview.workspace.document.sections.map(({ id }) => id);
  const sections = sectionIds.map((id) => document.querySelector(`.report-body > .section[data-section-id="${CSS.escape(id)}"]`)).filter(Boolean);
  if (sections.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  sections.forEach((section) => section.classList.add("ai-section-pending"));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  for (const [index, section] of sections.entries()) {
    if (token !== progressiveRevealToken) break;
    section.classList.remove("ai-section-pending");
    section.classList.add("ai-section-revealed");
    ui.status.textContent = `首稿已校验，正在呈现分区 ${index + 1}/${sections.length}`;
    syncCanvasGeneration();
    await wait(160);
  }
  sections.forEach((section) => section.classList.remove("ai-section-pending", "ai-section-revealed"));
}

async function presentCompletedGeneration(run) {
  const refinement = ["section", "component"].includes(run.request.scope?.kind);
  stopStreamingPreview();
  ui.generate.textContent = refinement ? "预览修改" : "生成首稿";
  serviceChecked = true;
  pendingRun = run;
  canvasGenerationActive = true;
  bridge.applyAiPreview(run.preview.workspace, refinementTarget);
  renderReview(run);
  ui.review.hidden = false;
  if (!refinement) await revealValidatedSections(run);
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
  activeGenerationPageType = remembered.pageType || "dashboard";
  canvasGenerationActive = true;
  startStreamingPreview(baselineWorkspace);
  const token = ++generationRequestToken;
  setState("working");
  ui.generate.textContent = "停止生成";
  ui.status.textContent = "正在恢复生成任务...";
  try {
    const job = await streamGenerationJob(remembered.id, token);
    if (!job) return;
    activeGenerationJobId = null;
    forgetGenerationJob();
    if (job.status === "canceled") {
      stopStreamingPreview();
      if (baselineWorkspace) bridge.applyAiPreview(baselineWorkspace, refinementTarget);
      canvasGenerationActive = false;
      setState("idle");
      ui.status.textContent = "生成任务已取消，当前画布未改变";
      return;
    }
    if (job.status !== "succeeded" || job.run?.status !== "preview-ready") throw Object.assign(new Error(job.error?.message || job.run?.error?.message || "生成结果校验失败"), { responseStatus: 422 });
    pendingGenerationJobId = remembered.id;
    await presentCompletedGeneration(job.run);
  } catch (error) {
    activeGenerationJobId = null;
    forgetGenerationJob();
    stopStreamingPreview();
    if (baselineWorkspace) bridge.applyAiPreview(baselineWorkspace, refinementTarget);
    setState("error");
    ui.status.textContent = friendlyGenerationError(error, error.responseStatus);
  } finally {
    if (!activeGenerationJobId) syncScope();
  }
}

async function requestCandidate() {
  if (activeGenerationJobId) return cancelActiveGeneration();
  const prompt = ui.prompt.value.trim();
  const selectedDataSource = bridge.getSelectedDataSource();
  const selectedPageType = ui.pageTypeControls?.querySelector('input[name="aiPageType"]:checked')?.value || "dashboard";
  // Report is the user-facing online analysis mode; static reports are created only by snapshot conversion.
  const generationPageType = selectedPageType === "report" ? "analysis-report" : selectedPageType;
  activeGenerationPageType = generationPageType;
  const effectivePrompt = prompt || (selectedDataSource?.contentKind === "page" ? "保留导入页面的业务内容和信息层级，使用当前视觉主题与组件规范重新生成页面" : "");
  if (!effectivePrompt) {
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
          id: `request-${Date.now()}`, prompt: effectivePrompt, language: context.language || "zh", pageType: generationPageType,
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
    canvasGenerationActive = true;
    startStreamingPreview(baselineWorkspace);
    rememberGenerationJob();
    syncCanvasGeneration();
    window.dispatchEvent(new CustomEvent("dashboard-generation-job-started", { detail: { jobId: payload.job.id, pageType: generationPageType } }));
    ui.generate.disabled = false;
    ui.generate.textContent = "停止生成";
    const job = await streamGenerationJob(payload.job.id, token);
    if (!job) return;
    activeGenerationJobId = null;
    forgetGenerationJob();
    if (job.status === "canceled") {
      stopStreamingPreview();
      if (baselineWorkspace) bridge.applyAiPreview(baselineWorkspace, refinementTarget);
      canvasGenerationActive = false;
      setState("idle");
      return;
    }
    if (job.status !== "succeeded" || job.run?.status !== "preview-ready") throw Object.assign(new Error(job.error?.message || job.run?.error?.message || "生成结果校验失败"), { responseStatus: job.error?.httpStatus || 422 });
    pendingGenerationJobId = payload.job.id;
    await presentCompletedGeneration(job.run);
  } catch (error) {
    activeGenerationJobId = null;
    forgetGenerationJob();
    pendingRun = null;
    stopStreamingPreview();
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
  progressiveRevealToken += 1;
  stopStreamingPreview();
  const refinement = ["section", "component"].includes(pendingRun?.request?.scope?.kind);
  if (baselineWorkspace) bridge.applyAiPreview(baselineWorkspace, refinementTarget);
  pendingRun = null;
  baselineWorkspace = null;
  refinementTarget = null;
  canvasGenerationActive = false;
  ui.review.hidden = true;
  ui.reviewDiff.replaceChildren();
  setState("idle");
  ui.status.textContent = refinement ? "已取消修改预览，原卡片未改变" : "已取消首稿预览，原草稿未改变";
  await submitGenerationFeedback("dismissed");
  syncScope();
}

async function acceptCandidate() {
  if (!pendingRun) return;
  progressiveRevealToken += 1;
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
    canvasGenerationActive = false;
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
  ui.componentCapability.hidden = true;
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
  ui.promptCount.textContent = `${ui.prompt.value.length} / ${ui.prompt.maxLength}`;
  ui.promptCount.hidden = ui.prompt.value.length < 400;
  ui.promptCount.dataset.limit = String(ui.prompt.value.length >= ui.prompt.maxLength);
}

ui.generate.addEventListener("click", requestCandidate);
ui.generate.dataset.bound = "true";
ui.cancel.addEventListener("click", cancelCandidate);
ui.accept.addEventListener("click", acceptCandidate);
ui.canvasStop?.addEventListener("click", cancelActiveGeneration);
ui.canvasAccept?.addEventListener("click", acceptCandidate);
ui.canvasDismiss?.addEventListener("click", cancelCandidate);
ui.canvasReopen?.addEventListener("click", () => window.DashboardProjectCenter?.openProjectDialog());
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
if (ui.status) new MutationObserver(syncCanvasGeneration).observe(ui.status, { childList: true, characterData: true, subtree: true });
window.addEventListener("dashboard-data-source-change", syncDraftSummary);
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
