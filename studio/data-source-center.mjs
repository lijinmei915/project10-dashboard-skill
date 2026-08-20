import { createStudioApiClient } from "/studio/studio-api-client.mjs";

const $ = (selector) => document.querySelector(selector);
const bridge = window.DashboardStudioBridge;

if (!bridge) throw new Error("DashboardStudioBridge is required");

const ui = {
  importButton: $("#aiDataSourceButton"), restButton: $("#aiRestConnectButton"), postgresButton: $("#aiPostgresConnectButton"), input: $("#aiDataSourceInput"),
  name: $("#aiDataSourceName"), meta: $("#aiDataSourceMeta"), copy: $(".ai-data-source-copy"), sheet: $("#aiDataSheet"), portable: $("#aiDataPortable"), embedControl: $("#aiEmbedDataControl"),
  refreshButton: $("#aiDataRefreshButton"), scheduleButton: $("#aiDataScheduleButton"), schemaButton: $("#aiDataSchemaButton"), generationStatus: $("#aiGenerationStatus"),
  schemaDialog: $("#dataSchemaDialog"), schemaSummary: $("#dataSchemaSummary"), schemaRows: $("#dataSchemaRows"), schemaStatus: $("#dataSchemaStatus"), schemaClose: $("#dataSchemaClose"), schemaCancel: $("#dataSchemaCancel"), schemaSave: $("#dataSchemaSave"),
  restDialog: $("#restConnectorDialog"), restClose: $("#restConnectorClose"), restCancel: $("#restConnectorCancel"), restSubmit: $("#restConnectorSubmit"), restName: $("#restConnectorName"), restUrl: $("#restConnectorUrl"), restPath: $("#restConnectorPath"), restCredential: $("#restConnectorCredential"), restStatus: $("#restConnectorStatus"),
  postgresDialog: $("#postgresConnectorDialog"), postgresClose: $("#postgresConnectorClose"), postgresCancel: $("#postgresConnectorCancel"), postgresSubmit: $("#postgresConnectorSubmit"), postgresName: $("#postgresConnectorName"), postgresRef: $("#postgresConnectorRef"), postgresStatus: $("#postgresConnectorStatus"),
  scheduleDialog: $("#refreshScheduleDialog"), scheduleClose: $("#refreshScheduleClose"), scheduleCancel: $("#refreshScheduleCancel"), scheduleSave: $("#refreshScheduleSave"), scheduleInterval: $("#refreshScheduleInterval"), scheduleDataset: $("#refreshScheduleDataset"), scheduleMeta: $("#refreshScheduleMeta"), scheduleStatus: $("#refreshScheduleStatus"), jobList: $("#refreshJobList")
};

let selectedFilePayload = null;
let uploadMode = "import";

const { request } = createStudioApiClient({
  errorMessage: (payload) => payload.issues?.[0]?.message || payload.error || "请求失败"
});

function source() { return bridge.getSelectedDataSource(); }

function applySource(next, status = "数据已就绪，可描述目标后生成", meta) {
  bridge.setSelectedDataSource(next);
  ui.copy.hidden = false;
  ui.embedControl.hidden = next.contentKind === "page";
  ui.portable.checked = Boolean(next.portable);
  ui.copy.closest(".ai-data-source").dataset.contentKind = next.contentKind || "data";
  ui.schemaButton.hidden = next.contentKind === "page";
  ui.refreshButton.hidden = false;
  const remote = ["rest", "postgres"].includes(next.kind);
  ui.refreshButton.textContent = remote ? "立即刷新" : next.contentKind === "page" ? "替换文件" : "重新上传";
  ui.scheduleButton.hidden = !remote;
  ui.name.textContent = next.name;
  ui.meta.textContent = meta || (next.contentKind === "page"
    ? "已识别 HTML 页面 · 内容解析完成 · 将按当前视觉规范重建"
    : `${next.rowCount} 行 · ${next.columnCount} 列 · ${next.quality.issueCount ? `${next.quality.issueCount} 项质量提示` : "质量检查通过"}${next.portable ? " · 随成品携带" : " · 仅服务端使用"}`);
  const sheets = next.availableSheets || [];
  ui.sheet.hidden = sheets.length < 2;
  ui.sheet.replaceChildren(...sheets.map((sheet) => new Option(sheet, sheet, false, sheet === next.sheetName)));
  ui.generationStatus.textContent = next.contentKind === "page" ? "HTML 页面已解析，可输入补充要求或直接生成首稿" : status;
}

function clearSource(message) {
  bridge.setSelectedDataSource(null);
  selectedFilePayload = null;
  ui.copy.closest(".ai-data-source").removeAttribute("data-content-kind");
  ui.schemaButton.hidden = true; ui.refreshButton.hidden = true; ui.scheduleButton.hidden = true; ui.sheet.hidden = true;
  ui.copy.hidden = true;
  ui.embedControl.hidden = true;
  ui.name.textContent = "";
  ui.meta.textContent = ""; ui.generationStatus.textContent = message;
}

function select(className, options, value, label) {
  const element = document.createElement("select"); element.className = `data-schema-select ${className}`; element.setAttribute("aria-label", label);
  options.forEach(([optionValue, optionLabel]) => element.add(new Option(optionLabel, optionValue, false, optionValue === value)));
  return element;
}

function semanticFor(dataset, fieldId) {
  const model = dataset.semanticModel || { dimensions: [], metrics: [] };
  return model.metrics.find((item) => item.fieldId === fieldId) || model.dimensions.find((item) => item.fieldId === fieldId) || null;
}

function formatName(metric) {
  if (metric?.format?.suffix === "%") return "percent";
  if (metric?.format?.prefix === "¥") return "currency";
  return metric?.format?.maximumFractionDigits === 0 ? "integer" : "number";
}

function syncSchemaRow(row) {
  const type = row.querySelector(".data-field-type").value;
  const role = row.querySelector(".data-field-role");
  const detail = row.querySelector(".data-field-detail");
  const format = row.querySelector(".data-field-format");
  [...role.options].forEach((option) => { option.disabled = option.value === "metric" && type !== "number"; });
  if (type !== "number" && role.value === "metric") role.value = "dimension";
  detail.replaceChildren();
  if (role.value === "metric") {
    [["sum", "求和"], ["average", "平均"], ["min", "最小"], ["max", "最大"], ["count", "计数"]].forEach(([value, label]) => detail.add(new Option(label, value)));
    detail.value = row.dataset.aggregation || "sum"; format.disabled = false;
  } else if (role.value === "dimension" && ["date", "datetime"].includes(type)) {
    [["auto", "自动时间"], ["day", "日"], ["week", "周"], ["month", "月"], ["quarter", "季度"], ["year", "年"]].forEach(([value, label]) => detail.add(new Option(label, value)));
    detail.value = row.dataset.timeGrain || "auto"; format.disabled = true;
  } else { detail.add(new Option("不适用", "")); format.disabled = true; }
  detail.disabled = role.value === "ignore" || (role.value === "dimension" && !["date", "datetime"].includes(type));
}

function openSchema() {
  const dataset = source(); if (!dataset) return;
  ui.schemaSummary.textContent = `${dataset.name} · ${dataset.rowCount} 行 · 语义版本 ${dataset.semanticModel?.version || 1}`;
  ui.schemaStatus.textContent = "修改后保存，AI 将按确认口径生成";
  ui.schemaRows.replaceChildren(...dataset.fields.map((field) => {
    const semantic = semanticFor(dataset, field.id);
    const roleValue = dataset.semanticModel?.metrics.some(({ fieldId }) => fieldId === field.id) ? "metric" : dataset.semanticModel?.dimensions.some(({ fieldId }) => fieldId === field.id) ? "dimension" : "ignore";
    const row = document.createElement("div"); row.className = "data-schema-row"; row.dataset.fieldId = field.id; row.dataset.aggregation = semantic?.aggregation || "sum"; row.dataset.timeGrain = semantic?.timeGrain || "auto";
    const copy = document.createElement("span"); copy.className = "data-schema-field";
    const name = document.createElement("strong"); name.textContent = field.label;
    const sample = document.createElement("span"); sample.textContent = field.samples.length ? `示例：${field.samples.join("、")}` : "无非空样例"; copy.append(name, sample);
    const type = select("data-field-type", [["string", "文本"], ["number", "数字"], ["boolean", "布尔"], ["date", "日期"], ["datetime", "日期时间"]], field.type, `${field.label} 类型`);
    const role = select("data-field-role", [["dimension", "维度"], ["metric", "指标"], ["ignore", "不使用"]], roleValue, `${field.label} 角色`);
    const detail = select("data-field-detail", [], "", `${field.label} 聚合或时间粒度`);
    const format = select("data-field-format", [["number", "数字"], ["percent", "百分比"], ["currency", "人民币"], ["integer", "整数"]], formatName(semantic), `${field.label} 格式`);
    row.append(copy, type, role, detail, format); type.addEventListener("change", () => syncSchemaRow(row)); role.addEventListener("change", () => syncSchemaRow(row)); syncSchemaRow(row); return row;
  }));
  ui.schemaDialog.hidden = false; ui.schemaClose.focus();
}

function closeSchema() { ui.schemaDialog.hidden = true; ui.schemaButton.focus(); }

async function saveSchema() {
  const dataset = source(); if (!dataset) return;
  ui.schemaSave.disabled = true; ui.schemaStatus.textContent = "正在校验字段和指标口径...";
  try {
    const fieldTypes = {}, dimensions = [], metrics = [];
    ui.schemaRows.querySelectorAll(".data-schema-row").forEach((row) => {
      const fieldId = row.dataset.fieldId, type = row.querySelector(".data-field-type").value, role = row.querySelector(".data-field-role").value, detail = row.querySelector(".data-field-detail").value, selectedFormat = row.querySelector(".data-field-format").value;
      fieldTypes[fieldId] = type;
      if (role === "dimension") dimensions.push({ fieldId, ...(["date", "datetime"].includes(type) ? { timeGrain: detail || "auto" } : {}) });
      if (role === "metric") { const formats = { number: { maximumFractionDigits: 2 }, percent: { maximumFractionDigits: 1, multiplier: 100, suffix: "%" }, currency: { maximumFractionDigits: 0, prefix: "¥" }, integer: { maximumFractionDigits: 0 } }; metrics.push({ fieldId, aggregation: detail || "sum", format: formats[selectedFormat] }); }
    });
    const { dataSource } = await request(`/api/data-sources/${encodeURIComponent(dataset.id)}/schema`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: dataset.updatedAt, fieldTypes, semanticModel: { dimensions, metrics }, portable: ui.portable.checked }) });
    if (!dataSource) throw new Error("字段配置保存失败");
    applySource(dataSource, "数据已就绪，可描述目标后生成", `${dataSource.rowCount} 行 · ${dataSource.columnCount} 列 · ${dataSource.semanticModel.metrics.length} 个指标 · ${dataSource.semanticModel.dimensions.length} 个维度`);
    ui.schemaStatus.textContent = `已保存语义版本 ${dataSource.semanticModel.version}`; setTimeout(closeSchema, 350);
  } catch (error) { ui.schemaStatus.textContent = error.message || "字段配置保存失败"; }
  finally { ui.schemaSave.disabled = false; }
}

function bufferToBase64(buffer) { const bytes = new Uint8Array(buffer); let binary = ""; for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768)); return btoa(binary); }
async function payloadFromFile(file) { const lower = file.name.toLowerCase(); const format = lower.endsWith(".xlsx") ? "xlsx" : lower.endsWith(".json") ? "json" : lower.endsWith(".html") || lower.endsWith(".htm") ? "html" : "csv"; return format === "xlsx" ? { name: file.name.replace(/\.[^.]+$/, ""), format, contentBase64: bufferToBase64(await file.arrayBuffer()) } : { name: file.name.replace(/\.[^.]+$/, ""), format, content: await file.text() }; }

async function loadDataSourceIcons() {
  const icons = [[ui.importButton, "upload-simple"], [ui.restButton, "cloud-arrow-up"], [ui.postgresButton, "database"], [ui.copy, "file-dashed"]];
  await Promise.all(icons.map(async ([element, name]) => {
    const slot = element?.querySelector(".ai-data-source-icon");
    if (!slot) return;
    const response = await fetch(`/api/icons/phosphor/${encodeURIComponent(name)}?weight=regular`);
    const asset = response.ok ? await response.json() : null;
    if (asset?.svg) slot.innerHTML = asset.svg;
  }));
}

async function importData(payload) { const { dataSource } = await request("/api/data-sources/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, portable: ui.portable.checked }) }); if (!dataSource) throw new Error("数据导入失败"); applySource(dataSource); }
async function refreshData(payload) { const dataset = source(); const { dataSource } = await request(`/api/data-sources/${encodeURIComponent(dataset.id)}/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, expectedUpdatedAt: dataset.updatedAt }) }); if (!dataSource) throw new Error("数据刷新失败"); applySource(dataSource, "数据刷新成功，后续生成将使用最新数据"); }
function showRefreshFailure(error) { const dataset = source(); if (dataset) applySource(dataset); ui.meta.textContent = `刷新失败，已保留上次成功数据 · ${error?.message || "数据刷新失败"}`; ui.generationStatus.textContent = "数据刷新失败，已保留上次成功数据"; }

async function enqueueRemoteRefresh() {
  const dataset = source(); const { job: created } = await request(`/api/data-sources/${encodeURIComponent(dataset.id)}/refresh-jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxAttempts: 3 }) });
  if (!created) throw new Error("刷新任务创建失败");
  for (let poll = 0; poll < 120; poll += 1) {
    if (poll) await new Promise((resolve) => setTimeout(resolve, 500));
    const { job } = await request(`/api/jobs/${encodeURIComponent(created.id)}`);
    if (job.status === "queued") ui.meta.textContent = "刷新任务已排队...";
    if (job.status === "running") ui.meta.textContent = `正在刷新远程数据 · 第 ${job.attempts} 次尝试`;
    if (job.status === "retrying") ui.meta.textContent = `刷新暂时失败，准备第 ${job.attempts + 1} 次尝试...`;
    if (job.status === "failed") throw new Error(job.lastError?.message || "刷新任务失败");
    if (job.status === "succeeded") { const { dataSource } = await request(`/api/data-sources/${encodeURIComponent(dataset.id)}/preview`); applySource(dataSource, "数据刷新成功，后续生成将使用最新数据"); return; }
  }
  throw new Error("刷新任务仍在运行，请稍后重试");
}

const jobLabels = { queued: "排队中", running: "运行中", retrying: "等待重试", succeeded: "已完成", failed: "失败", canceled: "已取消" };
function renderJobs(jobs) {
  if (!jobs.length) { const empty = document.createElement("p"); empty.className = "data-schema-status"; empty.textContent = "还没有刷新任务"; ui.jobList.replaceChildren(empty); return; }
  ui.jobList.replaceChildren(...jobs.slice(0, 8).map((job) => {
    const row = document.createElement("div"); row.className = "refresh-job-row"; const copy = document.createElement("span"); const title = document.createElement("strong"); title.textContent = jobLabels[job.status] || job.status; const meta = document.createElement("small"); meta.textContent = `${new Date(job.createdAt).toLocaleString("zh-CN")} · 尝试 ${job.attempts}/${job.maxAttempts}${job.lastError?.message ? ` · ${job.lastError.message}` : ""}`; copy.append(title, meta); row.append(copy);
    if (["queued", "running", "retrying"].includes(job.status)) { const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "取消"; cancel.addEventListener("click", async () => { cancel.disabled = true; try { await request(`/api/jobs/${encodeURIComponent(job.id)}/cancel`, { method: "POST" }); ui.scheduleStatus.textContent = "刷新任务已取消"; await loadSchedule(); } catch (error) { ui.scheduleStatus.textContent = error.message; } }); row.append(cancel); }
    return row;
  }));
}

async function loadSchedule() { const dataset = source(); if (!dataset || !["rest", "postgres"].includes(dataset.kind)) return; const [{ schedules = [] }, { jobs = [] }] = await Promise.all([request("/api/refresh-schedules"), request("/api/jobs")]); const schedule = schedules.find(({ datasetId }) => datasetId === dataset.id); ui.scheduleInterval.value = schedule?.enabled ? String(schedule.intervalMinutes) : "manual"; ui.scheduleMeta.textContent = schedule?.enabled ? `下次执行：${new Date(schedule.nextRunAt).toLocaleString("zh-CN")}` : "手动刷新，不自动执行"; renderJobs(jobs.filter(({ datasetId }) => datasetId === dataset.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))); }
async function openSchedule() { const dataset = source(); if (!dataset || !["rest", "postgres"].includes(dataset.kind)) return; ui.scheduleDialog.hidden = false; ui.scheduleDataset.textContent = dataset.name; ui.scheduleStatus.textContent = "计划按服务端时间执行"; try { await loadSchedule(); } catch (error) { ui.scheduleStatus.textContent = error.message || "刷新设置读取失败"; } }
function closeSchedule() { ui.scheduleDialog.hidden = true; }
async function saveSchedule() { const dataset = source(); if (!dataset || !["rest", "postgres"].includes(dataset.kind)) return; ui.scheduleSave.disabled = true; ui.scheduleStatus.textContent = "正在保存刷新计划..."; try { const { schedules = [] } = await request("/api/refresh-schedules"); const existing = schedules.find(({ datasetId }) => datasetId === dataset.id); const interval = ui.scheduleInterval.value; if (interval === "manual" && existing) await request(`/api/refresh-schedules/${encodeURIComponent(existing.id)}/disable`, { method: "POST" }); else if (interval !== "manual") await request(`/api/data-sources/${encodeURIComponent(dataset.id)}/refresh-schedule`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intervalMinutes: Number(interval), maxAttempts: 3 }) }); ui.scheduleStatus.textContent = interval === "manual" ? "已改为手动刷新" : "自动刷新计划已保存"; await loadSchedule(); } catch (error) { ui.scheduleStatus.textContent = error.message || "刷新计划保存失败"; } finally { ui.scheduleSave.disabled = false; } }

function closeRest() { ui.restDialog.hidden = true; }
async function connectRest() { ui.restSubmit.disabled = true; ui.restStatus.textContent = "正在连接并识别字段..."; try { const { dataSource } = await request("/api/data-sources/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: ui.restName.value.trim(), connector: { url: ui.restUrl.value.trim(), recordsPath: ui.restPath.value.trim(), credentialRef: ui.restCredential.value.trim() || undefined }, portable: ui.portable.checked }) }); if (!dataSource) throw new Error("REST 数据源连接失败"); selectedFilePayload = null; applySource(dataSource); closeRest(); } catch (error) { ui.restStatus.textContent = error.message || "REST 数据源连接失败"; } finally { ui.restSubmit.disabled = false; } }

function closePostgres() { ui.postgresDialog.hidden = true; }
async function openPostgres() { ui.postgresDialog.hidden = false; ui.postgresStatus.textContent = "正在加载可用的只读连接..."; try { const { postgres } = await request("/api/data-connectors"); const refs = postgres?.connectionRefs || []; ui.postgresRef.replaceChildren(new Option(refs.length ? "选择服务端连接" : "当前没有可用连接", ""), ...refs.map((ref) => new Option(ref, ref))); ui.postgresSubmit.disabled = !refs.length; ui.postgresStatus.textContent = refs.length ? "连接串和 SQL 不会进入浏览器、项目或成品" : "请由部署管理员配置受控 PostgreSQL 连接"; } catch (error) { ui.postgresStatus.textContent = error.message || "无法加载数据库连接"; ui.postgresSubmit.disabled = true; } ui.postgresName.focus(); }
async function connectPostgres() { ui.postgresSubmit.disabled = true; ui.postgresStatus.textContent = "正在查询并识别字段..."; try { const { dataSource } = await request("/api/data-sources/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: ui.postgresName.value.trim(), connector: { type: "postgres", connectionRef: ui.postgresRef.value }, portable: ui.portable.checked }) }); if (!dataSource) throw new Error("PostgreSQL 数据源连接失败"); selectedFilePayload = null; applySource(dataSource); closePostgres(); } catch (error) { ui.postgresStatus.textContent = error.message || "PostgreSQL 数据源连接失败"; } finally { ui.postgresSubmit.disabled = false; } }

ui.schemaButton.addEventListener("click", openSchema); ui.schemaClose.addEventListener("click", closeSchema); ui.schemaCancel.addEventListener("click", closeSchema); ui.schemaSave.addEventListener("click", saveSchema); ui.schemaDialog.addEventListener("click", (event) => { if (event.target === ui.schemaDialog) closeSchema(); });
ui.restButton.addEventListener("click", () => { ui.restStatus.textContent = "凭证值不会进入浏览器、项目或成品"; ui.restDialog.hidden = false; ui.restName.focus(); }); ui.restClose.addEventListener("click", closeRest); ui.restCancel.addEventListener("click", closeRest); ui.restSubmit.addEventListener("click", connectRest); ui.restDialog.addEventListener("click", (event) => { if (event.target === ui.restDialog) closeRest(); });
ui.postgresButton.addEventListener("click", openPostgres); ui.postgresClose.addEventListener("click", closePostgres); ui.postgresCancel.addEventListener("click", closePostgres); ui.postgresSubmit.addEventListener("click", connectPostgres); ui.postgresDialog.addEventListener("click", (event) => { if (event.target === ui.postgresDialog) closePostgres(); });
ui.importButton.addEventListener("click", () => { uploadMode = "import"; ui.input.click(); });
ui.refreshButton.addEventListener("click", async () => { if (!["rest", "postgres"].includes(source()?.kind)) { uploadMode = "refresh"; ui.input.click(); return; } ui.refreshButton.disabled = true; ui.meta.textContent = "正在创建刷新任务..."; try { await enqueueRemoteRefresh(); } catch (error) { showRefreshFailure(error); } finally { ui.refreshButton.disabled = false; } });
ui.scheduleButton.addEventListener("click", openSchedule); ui.scheduleClose.addEventListener("click", closeSchedule); ui.scheduleCancel.addEventListener("click", closeSchedule); ui.scheduleSave.addEventListener("click", saveSchedule); ui.scheduleDialog.addEventListener("click", (event) => { if (event.target === ui.scheduleDialog) closeSchedule(); });
ui.input.addEventListener("change", async () => { const file = ui.input.files?.[0]; if (!file) return; ui.importButton.disabled = true; ui.refreshButton.disabled = true; ui.copy.hidden = false; ui.name.textContent = file.name; ui.meta.textContent = "正在识别字段和检查数据质量..."; try { const payload = await payloadFromFile(file); if (uploadMode === "refresh" && source()) await refreshData(payload); else await importData(payload); selectedFilePayload = payload; } catch (error) { if (uploadMode === "import") clearSource(error.message || "数据导入失败"); else if (source()) showRefreshFailure(error); } finally { ui.importButton.disabled = false; ui.refreshButton.disabled = false; uploadMode = "import"; ui.input.value = ""; } });
ui.sheet.addEventListener("change", async () => { if (!selectedFilePayload || selectedFilePayload.format !== "xlsx") return; ui.sheet.disabled = true; ui.meta.textContent = "正在切换工作表并重新识别字段..."; try { await refreshData({ ...selectedFilePayload, sheetName: ui.sheet.value }); selectedFilePayload = { ...selectedFilePayload, sheetName: ui.sheet.value }; } catch (error) { ui.meta.textContent = error.message || "工作表切换失败"; } finally { ui.sheet.disabled = false; } });
ui.portable.addEventListener("change", async () => {
  const dataset = source();
  if (!dataset || dataset.contentKind === "page") return;
  ui.portable.disabled = true;
  try {
    const { dataSource } = await request(`/api/data-sources/${encodeURIComponent(dataset.id)}/schema`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: dataset.updatedAt, portable: ui.portable.checked }) });
    if (!dataSource) throw new Error("数据嵌入设置保存失败");
    applySource(dataSource, ui.portable.checked ? "数据将在成品中离线可用" : "数据将仅通过服务端读取");
  } catch (error) {
    ui.portable.checked = Boolean(dataset.portable);
    ui.generationStatus.textContent = error.message || "数据嵌入设置保存失败";
  } finally { ui.portable.disabled = false; }
});
loadDataSourceIcons();
