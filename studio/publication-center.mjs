import { createStudioApiClient } from "/studio/studio-api-client.mjs";

const $ = (selector) => document.querySelector(selector);
const bridge = window.DashboardStudioBridge;

if (!bridge) throw new Error("DashboardStudioBridge is required");

const ui = {
  trigger: $("#designPublishControl"), dialog: $("#publicationDialog"), close: $("#publicationClose"), cancel: $("#publicationCancel"), submit: $("#publicationSubmit"),
  visibility: $("#publicationVisibility"), revision: $("#publicationRevisionLabel"), project: $("#publicationProjectLabel"), status: $("#publicationStatus"), list: $("#publicationList"),
  shareRow: $("#publicationShareRow"), shareInput: $("#publicationShareInput"), shareCopy: $("#publicationShareCopy"), shareEmbed: $("#publicationShareEmbed"), shareOpen: $("#publicationShareOpen")
};

const { request } = createStudioApiClient();
let canApprove = false;

function closeDialog() { ui.dialog.hidden = true; }

function showShare(pathname) {
  if (!pathname) { ui.shareRow.hidden = true; ui.shareInput.value = ""; return; }
  ui.shareInput.value = new URL(pathname, window.location.origin).href;
  ui.shareRow.hidden = false;
}

function freshnessLabel(status) {
  return ({ current: "数据为发布时版本", stale: "数据已更新，建议重新发布", missing: "数据源已缺失", embedded: "数据已内嵌" })[status] || "未检测数据状态";
}

function download(publication, format = "html") {
  const link = document.createElement("a");
  link.href = format === "html" ? `/api/publications/${encodeURIComponent(publication.id)}/artifact` : `/api/publications/${encodeURIComponent(publication.id)}/render?format=${format}&width=1440`;
  link.download = format === "html" ? publication.artifact.filename : publication.artifact.filename.replace(/\.html$/i, `.${format}`);
  document.body.append(link); link.click(); link.remove();
}

function embedCode(url) {
  const embedUrl = new URL(url); embedUrl.pathname = embedUrl.pathname.replace(/^\/p\//, "/embed/");
  return `<iframe src="${embedUrl.href}" title="Dashboard" loading="lazy" style="width:100%;min-height:720px;border:0" allowfullscreen></iframe>`;
}

async function copyText(value, message) {
  try { await navigator.clipboard.writeText(value); ui.status.textContent = message; }
  catch { ui.shareInput.value = value; ui.shareInput.select(); ui.status.textContent = "已选中内容"; }
}

async function revoke(publication) {
  if (!window.confirm(`撤回发布 ${publication.id}？撤回后原链接将不可下载，记录仍会保留。`)) return;
  ui.status.textContent = "正在撤回发布...";
  await request(`/api/publications/${encodeURIComponent(publication.id)}/revoke`, { method: "POST" });
  ui.status.textContent = "发布已撤回";
  await loadPublications();
}

async function approve(publication) {
  if (!window.confirm(`批准发布 ${publication.id}？批准后外部访问链接将立即生效。`)) return;
  ui.status.textContent = "正在批准发布...";
  await request(`/api/publications/${encodeURIComponent(publication.id)}/approve`, { method: "POST" });
  ui.status.textContent = "发布已批准";
  await loadPublications();
}

function button(label, handler, action) {
  const element = document.createElement("button"); element.type = "button"; element.textContent = label;
  if (action) element.dataset.action = action;
  element.addEventListener("click", () => Promise.resolve(handler()).catch((error) => { ui.status.textContent = error.message; }));
  return element;
}

function render(items) {
  if (!items.length) {
    const empty = document.createElement("p"); empty.className = "data-schema-status"; empty.textContent = "当前项目还没有发布记录"; ui.list.replaceChildren(empty); return;
  }
  ui.list.replaceChildren(...items.map(({ publication, freshness, accessStats }) => {
    const row = document.createElement("div"); row.className = "publication-row"; row.dataset.publicationId = publication.id;
    const copy = document.createElement("span"); copy.className = "publication-row-copy";
    const title = document.createElement("strong"); title.textContent = `${({ pending: "待审批", published: "已发布", revoked: "已撤回" })[publication.status] || publication.status} · ${publication.revisionId}`;
    const meta = document.createElement("span");
    meta.textContent = `${new Date(publication.createdAt).toLocaleString("zh-CN")} · ${{ private: "私有", unlisted: "持链接可访问", public: "公开" }[publication.access.visibility] || publication.access.visibility} · ${freshnessLabel(freshness?.status)} · 访问 ${accessStats?.allowed || 0} 次${accessStats?.denied ? ` / 拒绝 ${accessStats.denied} 次` : ""}`;
    copy.append(title, meta);
    const actions = document.createElement("span"); actions.className = "publication-row-actions";
    if (publication.status === "pending") {
      if (canApprove) actions.append(button("批准发布", () => approve(publication), "approve"));
      actions.append(button("HTML", () => download(publication)), button("PNG", () => download(publication, "png")), button("PDF", () => download(publication, "pdf")), button("撤回", () => revoke(publication), "revoke"));
    } else if (publication.status !== "revoked") {
      if (publication.access.visibility === "public") {
        actions.append(button("打开", () => window.open(`/p/${encodeURIComponent(publication.id)}`, "_blank", "noopener")));
        actions.append(button("嵌入", () => copyText(embedCode(new URL(`/p/${encodeURIComponent(publication.id)}`, window.location.origin)), "嵌入代码已复制")));
      }
      actions.append(button("HTML", () => download(publication)), button("PNG", () => download(publication, "png")), button("PDF", () => download(publication, "pdf")), button("撤回", () => revoke(publication), "revoke"));
    }
    row.append(copy, actions); return row;
  }));
}

async function loadPublications() {
  const project = bridge.getCurrentProject();
  if (!project?.id) { render([]); return; }
  const [{ publications = [] }, auth] = await Promise.all([request("/api/publications", { cache: "no-store" }), request("/api/auth/status", { cache: "no-store" })]);
  canApprove = auth?.actor?.organizationRole === "admin";
  const summaries = publications.filter(({ projectId }) => projectId === project.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const details = await Promise.all(summaries.map(async (summary) => {
    try {
      const [detail, access] = await Promise.all([request(`/api/publications/${encodeURIComponent(summary.id)}`), request(`/api/publication-access?publicationId=${encodeURIComponent(summary.id)}`)]);
      const accessStats = (access.events || []).reduce((stats, event) => ({ ...stats, [event.decision]: (stats[event.decision] || 0) + 1 }), { allowed: 0, denied: 0 });
      return { ...detail, accessStats };
    } catch { return { publication: summary, freshness: null, accessStats: { allowed: 0, denied: 0 } }; }
  }));
  render(details);
}

async function openDialog() {
  ui.dialog.hidden = false; showShare(null);
  const project = bridge.getCurrentProject();
  ui.project.textContent = project?.name || "当前项目的已保存版本";
  ui.revision.textContent = project?.currentRevisionId ? `当前版本 ${project.currentRevisionId}` : "先保存当前版本后发布";
  ui.status.textContent = "发布固定指向不可变版本";
  try { if (project) await bridge.ensureCurrentProject(); await loadPublications(); }
  catch (error) { ui.status.textContent = error.message; }
}

async function openPublication(publicationId) {
  const { publication } = await request(`/api/publications/${encodeURIComponent(publicationId)}`, { cache: "no-store" });
  if (!publication) throw new Error("发布记录不存在");
  if (bridge.getCurrentProject()?.id !== publication.projectId) await window.DashboardProjectCenter?.activateProject(publication.projectId);
  await openDialog();
  const row = ui.list.querySelector(`[data-publication-id="${CSS.escape(publication.id)}"]`);
  if (row) { row.dataset.current = "true"; row.scrollIntoView({ block: "nearest" }); }
}

async function publish() {
  ui.submit.disabled = true; ui.status.textContent = "正在保存当前版本...";
  try {
    const context = await bridge.prepareRevision();
    ui.status.textContent = "正在创建发布快照...";
    const payload = await request("/api/publications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: context.projectId, revisionId: context.revisionId, visibility: ui.visibility.value }) });
    ui.status.textContent = payload.publication.status === "pending" ? "已提交审批，批准后链接生效" : `已发布版本 ${payload.publication.revisionId}`;
    ui.revision.textContent = `当前版本 ${context.revisionId}`;
    await loadPublications(); showShare(payload.share?.path || null);
    if (payload.publication.status === "pending" && payload.share?.path) ui.status.textContent = "已提交审批，批准后链接生效；请妥善保存此一次性访问链接";
  } catch (error) { ui.status.textContent = error.message || "发布失败"; }
  finally { ui.submit.disabled = false; }
}

ui.trigger.addEventListener("click", openDialog); ui.close.addEventListener("click", closeDialog); ui.cancel.addEventListener("click", closeDialog);
ui.dialog.addEventListener("click", (event) => { if (event.target === ui.dialog) closeDialog(); });
ui.submit.addEventListener("click", publish);
ui.shareCopy.addEventListener("click", () => copyText(ui.shareInput.value, "访问链接已复制"));
ui.shareEmbed.addEventListener("click", () => copyText(embedCode(ui.shareInput.value), "嵌入代码已复制"));
ui.shareOpen.addEventListener("click", () => window.open(ui.shareInput.value, "_blank", "noopener"));
window.DashboardPublicationCenter = Object.freeze({ openDialog, openPublication });
window.dispatchEvent(new CustomEvent("dashboard-publication-center-ready"));
