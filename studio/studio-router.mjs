function projectIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/studio\/projects\/([^/]+)$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

function publicationIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/studio\/publications\/([^/]+)$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

async function activateRoute() {
  const center = window.DashboardProjectCenter;
  if (!center) return;
  const projectId = projectIdFromPath();
  const publicationId = publicationIdFromPath();
  if (projectId) await center.activateProject(projectId);
  else if (window.location.pathname === "/studio/projects") await center.openProjectDialog();
  else if (window.location.pathname === "/studio/organizations/current") await center.openOrganization();
  else if (publicationId && window.DashboardPublicationCenter) await window.DashboardPublicationCenter.openPublication(publicationId);
}

function syncProjectRoute(event) {
  if (!window.location.pathname.startsWith("/studio/projects")) return;
  const projectId = window.DashboardProjectCenter?.currentProjectId();
  if (!projectId) return;
  const nextPath = `/studio/projects/${encodeURIComponent(projectId)}`;
  if (window.location.pathname !== nextPath) window.history.replaceState(null, "", `${nextPath}${window.location.search}${window.location.hash}`);
}

window.addEventListener("dashboard-project-center-ready", () => activateRoute().catch(() => {}), { once: true });
window.addEventListener("dashboard-publication-center-ready", () => activateRoute().catch(() => {}), { once: true });
window.addEventListener("dashboard-auth-ready", () => activateRoute().catch(() => {}));
window.addEventListener("dashboard-project-change", syncProjectRoute);
if (window.DashboardProjectCenter) activateRoute().catch(() => {});

export { projectIdFromPath, publicationIdFromPath };
