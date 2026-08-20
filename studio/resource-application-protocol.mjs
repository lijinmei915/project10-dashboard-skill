export const RESOURCE_CHANNEL = "dashboard-studio:resources:v1";

export function readResourceContext(input = "") {
  const url = new URL(input || "http://localhost/studio/resources", "http://localhost");
  const targetId = url.searchParams.get("target")?.trim() || null;
  const targetType = url.searchParams.get("targetType")?.trim() || null;
  const session = url.searchParams.get("session")?.trim() || null;
  const canApplyChart = Boolean(targetId && targetType === "chart" && session);
  const canApplyIcon = Boolean(targetId && ["card", "chart", "section"].includes(targetType) && session);
  return { targetId, targetType, session, canApplyChart, canApplyIcon };
}

export function resourceCenterUrl({ target = null, session = null } = {}) {
  const url = new URL("/studio/resources", "http://localhost");
  const targetType = target?.kind === "section" ? "section" : target?.type === "chart" ? "chart" : target?.id ? "card" : null;
  if (target?.id && targetType && session) {
    url.searchParams.set("target", target.id);
    url.searchParams.set("targetType", targetType);
    url.searchParams.set("session", session);
  }
  return `${url.pathname}${url.search}`;
}

export function chartApplicationMessage({ chartType, targetId, session }) {
  return { kind: "apply-chart", version: 1, chartType, targetId, session };
}

export function iconApplicationMessage({ iconName, targetId, targetType, session }) {
  return { kind: "apply-icon", version: 1, iconName, targetId, targetType, session };
}

export function validateChartApplication(message, { chartTypes, selectedTarget, session }) {
  if (!message || message.kind !== "apply-chart" || message.version !== 1) return { ok: false, reason: "unsupported" };
  if (!session || message.session !== session) return { ok: false, reason: "session" };
  if (!selectedTarget || selectedTarget.type !== "chart" || selectedTarget.id !== message.targetId) return { ok: false, reason: "target" };
  if (!chartTypes.includes(message.chartType)) return { ok: false, reason: "chart-type" };
  return { ok: true, value: { chartType: message.chartType, targetId: message.targetId } };
}

export function validateIconApplication(message, { selectedTarget, session }) {
  if (!message || message.kind !== "apply-icon" || message.version !== 1) return { ok: false, reason: "unsupported" };
  if (!session || message.session !== session) return { ok: false, reason: "session" };
  if (!selectedTarget || selectedTarget.id !== message.targetId || selectedTarget.targetType !== message.targetType) return { ok: false, reason: "target" };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(message.iconName || "")) return { ok: false, reason: "icon-name" };
  return { ok: true, value: { iconName: message.iconName, targetId: message.targetId, targetType: message.targetType } };
}
