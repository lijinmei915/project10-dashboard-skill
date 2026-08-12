const bridge = window.DashboardStudioBridge;
const downloadControl = document.querySelector("#designDownloadControl");

if (!bridge) throw new Error("DashboardStudioBridge is required");
if (!downloadControl) throw new Error("Export control is required");

function downloadHtml(html, filename) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveHtmlFile(html, filename) {
  if (typeof window.showSaveFilePicker !== "function") {
    downloadHtml(html, filename);
    return "download";
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "HTML 文件", accept: { "text/html": [".html"] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(new Blob([html], { type: "text/html;charset=utf-8" }));
    await writable.close();
    return "saved";
  } catch (error) {
    if (error.name === "AbortError") return "cancelled";
    throw error;
  }
}

function reportFilename(title, suffix) {
  const safeTitle = (title || "dashboard-report").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-");
  return `${safeTitle}-${suffix}.html`;
}

async function fetchRevisionExport() {
  await bridge.prepareRevision();
  const { project } = bridge.getExportContext();
  if (!project?.id || !project.currentRevisionId) throw new Error("当前工作区无法保存为项目版本");
  const endpoint = `/api/projects/${encodeURIComponent(project.id)}`;
  const requestExport = () => fetch(`${endpoint}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revisionId: project.currentRevisionId })
  });
  let response = await requestExport();
  if (response.status === 404) {
    const migration = await fetch(`${endpoint}/migrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project })
    });
    if (!migration.ok) {
      const payload = await migration.json().catch(() => ({}));
      throw Object.assign(new Error(payload.error || "旧项目迁移失败"), { responseStatus: migration.status });
    }
    response = await requestExport();
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw Object.assign(new Error(payload.error || "版本成品导出失败"), { responseStatus: response.status });
  }
  return {
    html: await response.text(),
    revisionId: response.headers.get("x-dashboard-revision") || project.currentRevisionId
  };
}

async function saveClean() {
  try {
    const revisionArtifact = await fetchRevisionExport();
    const context = bridge.getExportContext();
    const result = await saveHtmlFile(revisionArtifact.html, reportFilename(context.title, "版本成品"));
    if (result === "cancelled") bridge.setExportStatus("已取消保存");
    else bridge.setExportStatus(`已导出版本 ${revisionArtifact.revisionId}`);
  } catch (error) {
    console.error("保存成品失败", error);
    bridge.setExportStatus(`保存成品失败：${error.message}`);
  }
}

downloadControl.addEventListener("click", saveClean);
window.DashboardFileExporter = Object.freeze({ getRevisionHtml: fetchRevisionExport, saveClean });
