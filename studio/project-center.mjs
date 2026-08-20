import { createStudioApiClient } from "/studio/studio-api-client.mjs";
import { createButton, createSelect } from "/studio/ui-kit.mjs";
import { createProviderConnectionSettings } from "/studio/provider-connection-settings.mjs";

const $ = (selector) => document.querySelector(selector);
const bridge = window.DashboardStudioBridge;

if (!bridge) throw new Error("DashboardStudioBridge is required");

const ui = {
  authControl: $("#studioAuthControl"),
  control: $("#studioProjectControl"), label: $("#studioProjectLabel"),
  projectDialog: $("#projectDialog"), projectClose: $("#projectDialogClose"), projectCancel: $("#projectDialogCancel"), showArchived: $("#projectShowArchived"), projectStatus: $("#projectStatus"), projectList: $("#projectList"), projectListCount: $("#projectListCount"), projectSearch: $("#projectSearch"), projectStatusFilter: $("#projectStatusFilter"), projectSort: $("#projectSort"), projectOwnership: $("#projectOwnership"), projectListView: $("#projectListView"), projectListTab: $("#projectListTab"), projectComposerView: $("#projectComposerView"), projectSettingsView: $("#projectSettingsView"), newAiProject: $("#projectNewAi"), projectAiEdit: $("#projectAiEditTab"),
  organizationControl: $("#organizationControl"), organizationDialog: $("#organizationDialog"), organizationClose: $("#organizationDialogClose"), organizationCancel: $("#organizationDialogCancel"), organizationName: $("#organizationName"), organizationMemberList: $("#organizationMemberList"), organizationStatus: $("#organizationStatus"), organizationSave: $("#organizationSave"), organizationAudit: $("#organizationAudit"), organizationMetricsGrid: $("#organizationMetricsGrid"), organizationMetricsStatus: $("#organizationMetricsStatus"), organizationMetricsFailures: $("#organizationMetricsFailures"), organizationReadinessGrid: $("#organizationReadinessGrid"), organizationReadinessStatus: $("#organizationReadinessStatus"),
  memberDialog: $("#memberDialog"), memberClose: $("#memberDialogClose"), memberCancel: $("#memberDialogCancel"), memberProjectName: $("#memberProjectName"), memberList: $("#memberList"), memberStatus: $("#memberStatus"), memberSave: $("#memberSave"),
  auditDialog: $("#auditDialog"), auditClose: $("#auditDialogClose"), auditCancel: $("#auditDialogCancel"), auditProjectName: $("#auditProjectName"), auditList: $("#auditList"), auditStatus: $("#auditStatus")
};

let managedMemberProject = null;
let managedOrganization = null;
const { request } = createStudioApiClient();
const providerSettings = createProviderConnectionSettings({ root: ui.organizationDialog, request });

function mountProjectFilterSelect(select) {
  if (!select || select.closest(".project-filter-select")) return;
  const wrapper = document.createElement("div");
  wrapper.className = "project-filter-select";
  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(select);
  const custom = document.createElement("div");
  custom.className = "custom-select";
  custom.dataset.open = "false";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const label = document.createElement("span");
  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.classList.add("custom-select-chevron");
  chevron.setAttribute("viewBox", "0 0 24 24");
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = "<path d=\"m6 9 6 6 6-6\"/>";
  trigger.append(label, chevron);
  const list = document.createElement("div");
  list.className = "custom-select-listbox";
  list.setAttribute("role", "listbox");
  custom.append(trigger, list); wrapper.append(custom);
  const close = () => { custom.dataset.open = "false"; trigger.setAttribute("aria-expanded", "false"); };
  const render = () => {
    const options = [...select.options];
    label.textContent = options.find((option) => option.value === select.value)?.textContent || "";
    list.replaceChildren(...options.map((option) => {
      const item = document.createElement("button"); item.type = "button"; item.className = "custom-select-option";
      item.setAttribute("role", "option"); item.setAttribute("aria-selected", String(option.value === select.value));
      const optionLabel = document.createElement("span"); optionLabel.textContent = option.textContent;
      const check = document.createElementNS("http://www.w3.org/2000/svg", "svg"); check.classList.add("custom-select-check"); check.setAttribute("viewBox", "0 0 24 24"); check.innerHTML = "<path d=\"m5 12 4 4L19 6\"/>";
      item.append(optionLabel, check);
      item.addEventListener("click", () => { select.value = option.value; select.dispatchEvent(new Event("change", { bubbles: true })); close(); render(); });
      return item;
    }));
  };
  trigger.addEventListener("click", () => { const open = custom.dataset.open !== "true"; custom.dataset.open = String(open); trigger.setAttribute("aria-expanded", String(open)); });
  select.addEventListener("change", render); document.addEventListener("pointerdown", (event) => { if (!wrapper.contains(event.target)) close(); }, true);
  render();
}

[ui.projectStatusFilter, ui.projectSort, ui.projectOwnership].forEach(mountProjectFilterSelect);

const providerManagerBody = ui.organizationDialog.querySelector(".provider-manager-body");
if (providerManagerBody && ui.projectSettingsView) ui.projectSettingsView.append(providerManagerBody);
const providerWorkspaceFooter = ui.organizationDialog.querySelector("#providerWorkspaceFooter") || providerManagerBody?.querySelector("#providerWorkspaceFooter");
if (providerWorkspaceFooter && ui.projectSettingsView) ui.projectSettingsView.append(providerWorkspaceFooter);

function syncControl() {
  const project = bridge.getCurrentProject();
  ui.label.textContent = "项目 / AI";
  ui.control.title = project ? `${project.name}${project.status === "archived" ? " · 已归档" : ""}` : "项目中心";
}
if (!new URLSearchParams(location.search).has("ci")) document.body.classList.add("studio-project-entry-ready");

function showProjectList() {
  window.DashboardAiComposerCenter?.setEmbedded(null);
  window.DashboardAiComposerCenter?.setOpen(false);
  ui.projectComposerView.hidden = true;
  ui.projectListView.hidden = false;
  ui.projectSettingsView.hidden = true;
  ui.projectListTab.setAttribute("aria-pressed", "true");
  ui.newAiProject.setAttribute("aria-pressed", "false");
  ui.projectAiEdit.setAttribute("aria-pressed", "false");
  ui.projectListView.scrollTop = 0;
}
function closeProjectDialog() { showProjectList(); ui.projectDialog.hidden = true; }
function closeAuditDialog() { ui.auditDialog.hidden = true; }
function closeMemberDialog() { ui.memberDialog.hidden = true; managedMemberProject = null; }
function closeOrganizationDialog() { ui.organizationDialog.hidden = true; ui.projectSettingsView.hidden = true; managedOrganization = null; }

function beginAiProject() {
  if (bridge.getActorRole() === "viewer") return;
  if (bridge.isDirty() && !window.confirm("当前项目有未保存修改。新建 AI 项目会保留当前视觉作为生成基线，但不会保存这些修改。是否继续？")) return;
  bridge.beginAiProject();
  ui.projectListView.hidden = true;
  ui.projectSettingsView.hidden = true;
  ui.projectComposerView.hidden = false;
  ui.projectListTab.setAttribute("aria-pressed", "false");
  ui.newAiProject.setAttribute("aria-pressed", "true");
  ui.projectAiEdit.setAttribute("aria-pressed", "false");
  window.DashboardAiComposerCenter?.setEmbedded(ui.projectComposerView, { focus: true });
}

function editCurrentProjectWithAi() {
  if (bridge.getActorRole() === "viewer" || !bridge.getCurrentProject()) return;
  ui.projectListView.hidden = true;
  ui.projectSettingsView.hidden = true;
  ui.projectComposerView.hidden = false;
  ui.projectListTab.setAttribute("aria-pressed", "false");
  ui.newAiProject.setAttribute("aria-pressed", "false");
  ui.projectAiEdit.setAttribute("aria-pressed", "true");
  window.DashboardAiComposerCenter?.setEmbedded(ui.projectComposerView, { focus: true });
}

async function activateProject(projectId) {
  if (bridge.isDirty() && !window.confirm("当前有未保存修改，切换项目会放弃这些修改。是否继续？")) return;
  ui.projectStatus.textContent = "正在打开项目...";
  const { project } = await request(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
  await bridge.activateProject(project);
  closeProjectDialog();
}

async function reloadProject(projectId) {
  if (bridge.isDirty() && !window.confirm("当前有未保存修改，重新加载会放弃这些修改并恢复服务器上的最新版本。是否继续？")) return;
  ui.projectStatus.textContent = "正在重新加载项目...";
  const { project } = await request(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
  await bridge.activateProject(project);
  closeProjectDialog();
}

async function updateProject(project, changes) {
  const payload = await request(`/api/projects/${encodeURIComponent(project.id)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: project.updatedAt, ...changes })
  });
  bridge.updateCurrentProject(payload.project);
  return payload.project;
}

async function renameProject(project) {
  const name = window.prompt("项目名称", project.name)?.trim();
  if (!name || name === project.name) return;
  ui.projectStatus.textContent = "正在重命名...";
  await updateProject(project, { name });
  await loadProjects();
}

async function copyProject(project) {
  const name = window.prompt("副本名称", `${project.name} 副本`)?.trim();
  if (!name) return;
  ui.projectStatus.textContent = "正在复制当前版本...";
  await request(`/api/projects/${encodeURIComponent(project.id)}/copy`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: `project-copy-${Date.now()}`, name })
  });
  ui.projectStatus.textContent = "副本已创建";
  await loadProjects();
}

async function toggleArchive(project) {
  const archive = project.status !== "archived";
  if (archive && !window.confirm(`归档“${project.name}”？归档后项目只读，可随时恢复。`)) return;
  ui.projectStatus.textContent = archive ? "正在归档..." : "正在恢复...";
  await updateProject(project, { status: archive ? "archived" : "active" });
  await loadProjects();
}

async function openAudit(project) {
  ui.auditDialog.hidden = false;
  ui.auditProjectName.textContent = project.name;
  ui.auditStatus.textContent = "正在读取项目记录...";
  const { events = [] } = await request(`/api/audit-events?projectId=${encodeURIComponent(project.id)}&limit=200`, { cache: "no-store" });
  const labels = {
    "project.created": "创建项目", "project.copied": "复制项目", "project.renamed": "重命名项目", "project.archived": "归档项目", "project.restored": "恢复项目", "project.access.updated": "更新成员权限",
    "publication.published": "发布版本", "publication.submitted": "提交发布审批", "publication.approved": "批准发布", "publication.revoked": "撤回发布"
  };
  if (!events.length) {
    const empty = document.createElement("p"); empty.className = "data-schema-status"; empty.textContent = "暂无项目操作记录"; ui.auditList.replaceChildren(empty);
  } else ui.auditList.replaceChildren(...events.map((event) => {
    const row = document.createElement("div"); row.className = "audit-row";
    const title = document.createElement("strong"); title.textContent = labels[event.action] || event.action;
    const meta = document.createElement("span"); meta.textContent = `${event.actor.name} · ${new Date(event.at).toLocaleString("zh-CN")}`;
    row.append(title, meta); return row;
  }));
  ui.auditStatus.textContent = `${events.length} 条记录`;
}

async function openOrganizationAudit() {
  ui.auditDialog.hidden = false;
  ui.auditProjectName.textContent = managedOrganization?.name || "当前组织";
  ui.auditStatus.textContent = "正在读取组织记录...";
  const { events = [] } = await request("/api/audit-events?scope=organization&limit=200", { cache: "no-store" });
  const labels = { "organization.updated": "更新组织", "organization.members.updated": "更新组织成员" };
  if (!events.length) {
    const empty = document.createElement("p"); empty.className = "data-schema-status"; empty.textContent = "暂无组织治理记录"; ui.auditList.replaceChildren(empty);
  } else ui.auditList.replaceChildren(...events.map((event) => {
    const row = document.createElement("div"); row.className = "audit-row";
    const title = document.createElement("strong"); title.textContent = labels[event.action] || event.action;
    const meta = document.createElement("span"); meta.textContent = `${event.actor.name} · ${new Date(event.at).toLocaleString("zh-CN")}`;
    row.append(title, meta); return row;
  }));
  ui.auditStatus.textContent = `${events.length} 条组织记录`;
}

function renderMembers(project, actors) {
  const roles = new Map((project.access?.members || []).map(({ actorId, role }) => [actorId, role]));
  ui.memberList.replaceChildren(...actors.map((actor) => {
    const row = document.createElement("label"); row.className = "member-row";
    const copy = document.createElement("span"); copy.className = "member-row-copy";
    const name = document.createElement("strong"); name.textContent = actor.name;
    const meta = document.createElement("span"); meta.textContent = `${actor.id} · ${actor.role}${actor.id === project.access?.ownerId ? " · 所有者" : ""}`;
    copy.append(name, meta);
    const isOwner = actor.id === project.access?.ownerId;
    const select = createSelect(
      isOwner
        ? [{ value: "owner", label: "所有者" }]
        : [{ value: "none", label: "无权限" }, { value: "viewer", label: "只读" }, { value: "editor", label: "可编辑" }],
      { value: isOwner ? "owner" : roles.get(actor.id) || "none", ariaLabel: `${actor.name} 的项目权限` }
    );
    select.dataset.actorId = actor.id;
    select.disabled = isOwner;
    row.append(copy, select); return row;
  }));
}

async function openMembers(project) {
  ui.memberDialog.hidden = false;
  ui.memberStatus.textContent = "正在读取同组织身份...";
  const [{ project: fullProject }, { actors = [] }] = await Promise.all([
    request(`/api/projects/${encodeURIComponent(project.id)}`, { cache: "no-store" }),
    request("/api/auth/actors", { cache: "no-store" })
  ]);
  managedMemberProject = fullProject;
  ui.memberProjectName.textContent = fullProject.name;
  renderMembers(fullProject, actors);
  ui.memberStatus.textContent = "全局角色仍限制成员能力上限";
}

async function saveMembers() {
  if (!managedMemberProject) return;
  ui.memberSave.disabled = true;
  ui.memberStatus.textContent = "正在保存成员权限...";
  try {
    const members = [...ui.memberList.querySelectorAll("select[data-actor-id]")].filter((select) => !select.disabled && select.value !== "none").map((select) => ({ actorId: select.dataset.actorId, role: select.value }));
    const { project } = await request(`/api/projects/${encodeURIComponent(managedMemberProject.id)}/access`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedUpdatedAt: managedMemberProject.updatedAt, members })
    });
    bridge.updateCurrentProject(project);
    await loadProjects();
    closeMemberDialog();
  } catch (error) { ui.memberStatus.textContent = error.message; }
  finally { ui.memberSave.disabled = false; }
}

function organizationSelect(member, field, entries) {
  const select = createSelect(entries.map(([value, label]) => ({ value, label })), {
    value: member[field],
    ariaLabel: `${member.name} 的组织${field === "role" ? "角色" : "状态"}`
  });
  select.dataset.actorId = member.actorId;
  select.dataset.organizationField = field;
  return select;
}

function renderOrganization(organization) {
  ui.organizationName.value = organization.name;
  ui.organizationMemberList.replaceChildren(...organization.members.map((member) => {
    const row = document.createElement("div"); row.className = "member-row";
    const copy = document.createElement("span"); copy.className = "member-row-copy";
    const name = document.createElement("strong"); name.textContent = member.name;
    const meta = document.createElement("span"); meta.textContent = `${member.actorId} · ${member.status === "active" ? "已启用" : "已暂停"}`;
    copy.append(name, meta);
    row.append(copy, organizationSelect(member, "role", [["admin", "组织管理员"], ["member", "成员"]]), organizationSelect(member, "status", [["active", "启用"], ["suspended", "暂停"]]));
    return row;
  }));
}

function formatRate(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatDuration(value) {
  const milliseconds = Math.max(0, Number(value) || 0);
  return milliseconds < 1_000 ? `${Math.round(milliseconds)} ms` : `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)} s`;
}

function renderGenerationMetrics(metrics) {
  const items = [
    ["候选可用率", formatRate(metrics.rates?.acceptance)],
    ["成功率", formatRate(metrics.rates?.success)],
    ["自动修复", formatRate(metrics.rates?.repair)],
    ["已评审", String((metrics.feedback?.accepted || 0) + (metrics.feedback?.dismissed || 0))],
    ["P50 总耗时", formatDuration(metrics.latencyMs?.total?.p50)],
    ["P95 总耗时", formatDuration(metrics.latencyMs?.total?.p95)]
  ];
  ui.organizationMetricsGrid.replaceChildren(...items.map(([label, value]) => {
    const item = document.createElement("div"); item.className = "organization-metric";
    const term = document.createElement("dt"); term.textContent = label;
    const detail = document.createElement("dd"); detail.textContent = value;
    item.append(term, detail);
    return item;
  }));
  ui.organizationMetricsStatus.textContent = `${metrics.totals?.created || 0} 次请求 · 近 24 小时`;
  ui.organizationMetricsFailures.textContent = metrics.failures?.length
    ? `失败分类：${metrics.failures.map(({ code, count }) => `${code} ${count}`).join(" · ")}`
    : "当前窗口无失败任务";
}

async function loadGenerationMetrics() {
  ui.organizationMetricsStatus.textContent = "正在读取近 24 小时指标...";
  ui.organizationMetricsFailures.textContent = "失败分类将在有数据时显示";
  try {
    const { metrics } = await request("/api/generation/metrics", { cache: "no-store" });
    renderGenerationMetrics(metrics);
  } catch (error) {
    ui.organizationMetricsGrid.replaceChildren();
    ui.organizationMetricsStatus.textContent = "指标暂不可用";
    ui.organizationMetricsFailures.textContent = error.message;
  }
}

function renderPlatformReadiness(readiness) {
  const items = [
    ["存储", readiness.deployment === "managed" ? "托管" : "本地"],
    ["身份", readiness.authentication?.status === "ok" ? "已就绪" : "配置异常"],
    ["身份映射", readiness.identity?.status === "ok" ? "已就绪" : "不可用"],
    ["分布式执行", readiness.execution?.distributed ? "已启用" : "本地执行"],
    ["审计锚定", readiness.auditAnchor?.status === "configured" ? "已配置" : "未配置"],
    ["数据权限", readiness.dataAccessPolicy?.status === "configured" ? "已配置" : "未配置"]
  ];
  ui.organizationReadinessGrid.replaceChildren(...items.map(([label, value]) => {
    const item = document.createElement("div"); item.className = "organization-readiness-item";
    const term = document.createElement("dt"); term.textContent = label;
    const detail = document.createElement("dd"); detail.textContent = value;
    item.append(term, detail);
    return item;
  }));
  ui.organizationReadinessStatus.textContent = readiness.status === "ok" ? "最近探测正常" : "部分能力异常";
}

async function loadPlatformReadiness() {
  ui.organizationReadinessStatus.textContent = "正在读取运行状态...";
  try {
    const readiness = await request("/api/platform/readiness", { cache: "no-store" });
    renderPlatformReadiness(readiness);
  } catch (error) {
    ui.organizationReadinessGrid.replaceChildren();
    ui.organizationReadinessStatus.textContent = "运行状态暂不可用";
  }
}

async function loadOrganization() {
  const { organization } = await request("/api/organizations/current", { cache: "no-store" });
  ui.organizationControl.hidden = organization.currentMember?.role !== "admin";
  return organization;
}

async function openOrganization() {
  ui.projectDialog.hidden = false;
  ui.projectListView.hidden = true;
  ui.projectComposerView.hidden = true;
  ui.projectSettingsView.hidden = false;
  ui.projectListTab.setAttribute("aria-pressed", "false");
  ui.newAiProject.setAttribute("aria-pressed", "false");
  ui.projectAiEdit.setAttribute("aria-pressed", "false");
  ui.organizationControl.setAttribute("aria-pressed", "true");
  const managerBody = ui.projectSettingsView.querySelector(".provider-manager-body");
  if (managerBody) managerBody.scrollTop = 0;
  ui.organizationStatus.textContent = "正在读取 AI 连接...";
  try {
    await providerSettings.load();
    providerSettings.openActive({ focus: false });
    if (managerBody) managerBody.scrollTop = 0;
    ui.organizationStatus.textContent = "连接配置仅对当前账号生效";
  } catch (error) { ui.organizationStatus.textContent = error.message; }
}

async function saveOrganization() {
  if (!managedOrganization) return;
  ui.organizationSave.disabled = true;
  ui.organizationStatus.textContent = "正在保存组织设置...";
  try {
    let organization = managedOrganization;
    const name = ui.organizationName.value.trim();
    if (name !== organization.name) ({ organization } = await request("/api/organizations/current", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: organization.updatedAt, name }) }));
    const members = organization.members.map((member) => {
      const role = ui.organizationMemberList.querySelector(`select[data-actor-id="${CSS.escape(member.actorId)}"][data-organization-field="role"]`)?.value;
      const status = ui.organizationMemberList.querySelector(`select[data-actor-id="${CSS.escape(member.actorId)}"][data-organization-field="status"]`)?.value;
      return { actorId: member.actorId, role, status };
    });
    ({ organization } = await request("/api/organizations/current/members", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: organization.updatedAt, members }) }));
    managedOrganization = organization;
    renderOrganization(organization);
    ui.organizationStatus.textContent = "组织设置已保存";
  } catch (error) { ui.organizationStatus.textContent = error.message; }
  finally { ui.organizationSave.disabled = false; }
}

function actionButton(label, handler, variant = "outline") {
  const button = createButton(label, { variant });
  button.addEventListener("click", () => handler().catch((error) => { ui.projectStatus.textContent = error.message; }));
  return button;
}

let allProjects = [];
function renderProjects(projects = allProjects) {
  const current = bridge.getCurrentProject();
  const hasProjects = projects.length > 0;
  ui.projectListView.querySelector(".project-list-toolbar").hidden = !hasProjects;
  ui.projectListView.querySelector(".project-list-filters").hidden = !hasProjects;
  const query = ui.projectSearch.value.trim().toLowerCase();
  const status = ui.projectStatusFilter.value;
  const ownership = ui.projectOwnership.value;
  const visible = projects.filter((project) => (!query || project.name.toLowerCase().includes(query)) && (status === "all" || project.status === status) && (ownership === "all" || ["admin", "owner", "editor"].includes(project.accessRole))).sort((left, right) => ui.projectSort.value === "name" ? left.name.localeCompare(right.name, "zh-CN") : String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
  ui.projectListCount.textContent = `${visible.length} / ${projects.length}`;
  if (!visible.length) {
    const empty = document.createElement("p"); empty.className = "data-schema-status"; empty.textContent = projects.length ? "没有符合条件的项目" : (status === "archived" ? "还没有已归档项目" : "还没有进行中的项目"); ui.projectList.replaceChildren(empty); return;
  }
  ui.projectList.replaceChildren(...visible.map((project) => {
    const row = document.createElement("div"); row.className = "project-row"; row.dataset.current = String(current?.id === project.id);
    const copy = document.createElement("span"); copy.className = "project-row-copy";
    const title = document.createElement("strong"); title.textContent = project.name;
    const meta = document.createElement("span"); meta.textContent = `${project.status === "archived" ? "已归档" : "进行中"} · ${project.revisionCount} 个版本 · ${project.accessRole}`;
    copy.append(title, meta);
    const actions = document.createElement("span"); actions.className = "project-row-actions";
    const open = actionButton(current?.id === project.id ? "重新加载" : "打开", () => current?.id === project.id ? reloadProject(project.id) : activateProject(project.id), "default");
    actions.append(open, actionButton("记录", () => openAudit(project)));
    const writable = bridge.getActorRole() !== "viewer";
    if (writable) actions.append(actionButton("复制", () => copyProject(project)));
    if (writable && ["admin", "owner", "editor"].includes(project.accessRole) && project.status !== "archived") actions.append(actionButton("重命名", () => renameProject(project)));
    if (writable && ["admin", "owner"].includes(project.accessRole)) actions.append(actionButton("成员", () => openMembers(project)), actionButton(project.status === "archived" ? "恢复" : "归档", () => toggleArchive(project)));
    row.append(copy, actions); return row;
  }));
}

async function loadProjects() {
  const includeArchived = ui.projectStatusFilter.value !== "active";
  const { projects = [] } = await request(`/api/projects${includeArchived ? "?includeArchived=true" : ""}`, { cache: "no-store" });
  allProjects = projects; renderProjects(); ui.projectStatus.textContent = `${projects.length} 个项目`;
}

async function openProjectDialog() {
  window.DashboardAiComposerCenter?.setOpen(false);
  ui.projectDialog.hidden = false; ui.projectStatus.textContent = "正在读取项目...";
  ui.newAiProject.hidden = bridge.getActorRole() === "viewer";
  ui.projectAiEdit.hidden = bridge.getActorRole() === "viewer" || !bridge.getCurrentProject();
  try { await loadProjects(); } catch (error) { ui.projectStatus.textContent = error.message; }
}

ui.control.addEventListener("click", openProjectDialog);
ui.authControl.addEventListener("click", () => { closeProjectDialog(); closeOrganizationDialog(); closeMemberDialog(); closeAuditDialog(); providerSettings.close(); });
ui.projectClose.addEventListener("click", closeProjectDialog); ui.projectCancel.addEventListener("click", closeProjectDialog);
ui.projectDialog.addEventListener("click", (event) => { if (event.target === ui.projectDialog) closeProjectDialog(); });
[ui.projectStatusFilter].forEach((control) => control.addEventListener("change", () => loadProjects().catch((error) => { ui.projectStatus.textContent = error.message; })));
[ui.projectSearch, ui.projectSort, ui.projectOwnership].forEach((control) => control.addEventListener(control === ui.projectSearch ? "input" : "change", () => renderProjects()));
ui.newAiProject.addEventListener("click", beginAiProject);
ui.projectListTab.addEventListener("click", showProjectList);
ui.projectAiEdit.addEventListener("click", editCurrentProjectWithAi);
window.addEventListener("dashboard-ai-composer-embedded-close", showProjectList);
window.addEventListener("dashboard-generation-job-started", closeProjectDialog);
ui.organizationControl.addEventListener("click", openOrganization); ui.organizationClose.addEventListener("click", closeOrganizationDialog); ui.organizationCancel.addEventListener("click", closeOrganizationDialog); ui.organizationSave.addEventListener("click", saveOrganization);
ui.organizationAudit.addEventListener("click", () => openOrganizationAudit().catch((error) => { ui.organizationStatus.textContent = error.message; }));
ui.organizationDialog.addEventListener("click", (event) => { if (event.target === ui.organizationDialog) closeOrganizationDialog(); });
ui.memberClose.addEventListener("click", closeMemberDialog); ui.memberCancel.addEventListener("click", closeMemberDialog); ui.memberSave.addEventListener("click", saveMembers);
ui.memberDialog.addEventListener("click", (event) => { if (event.target === ui.memberDialog) closeMemberDialog(); });
ui.auditClose.addEventListener("click", closeAuditDialog); ui.auditCancel.addEventListener("click", closeAuditDialog);
ui.auditDialog.addEventListener("click", (event) => { if (event.target === ui.auditDialog) closeAuditDialog(); });
window.addEventListener("dashboard-project-change", syncControl);
syncControl();
window.DashboardProjectCenter = Object.freeze({ activateProject, openProjectDialog, openOrganization, currentProjectId: () => bridge.getCurrentProject()?.id || null });
window.dispatchEvent(new CustomEvent("dashboard-project-center-ready"));
