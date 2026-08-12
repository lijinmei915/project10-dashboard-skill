export const LAYOUT_SPAN_STEPS = Object.freeze([3, 4, 6, 8, 9, 12]);

export function nearestLayoutSpan(value, steps = LAYOUT_SPAN_STEPS) {
  const numeric = Number(value);
  const baseline = steps.includes(4) ? 4 : steps[0];
  return steps.reduce((closest, step) => Math.abs(step - numeric) < Math.abs(closest - numeric) ? step : closest, baseline);
}

export function shouldStartPointerDrag(start, current, threshold = 5) {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function layoutDropSide(rect, point, rowThreshold = 0.3) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const sameRow = Math.abs(point.y - centerY) < rect.height * rowThreshold;
  if (sameRow) return point.x < centerX ? "left" : "right";
  return point.y < centerY ? "top" : "bottom";
}

export function shouldInsertBefore(rect, point, { verticalOnly = false, rowThreshold = 0.3 } = {}) {
  const side = layoutDropSide(rect, point, rowThreshold);
  return side === "top" || (!verticalOnly && side === "left");
}

export function reorderCanvasIds({ ids, sourceId, targetId, sourceRect, targetRect }) {
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = ids.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return ids;
  const sameRow = Math.abs(sourceRect.top - targetRect.top) < Math.min(sourceRect.height, targetRect.height) * 0.45;
  const movingEarlier = sourceIndex > targetIndex;
  let before;
  if (sameRow) {
    const sourceCenter = sourceRect.left + sourceRect.width / 2;
    const targetCenter = targetRect.left + targetRect.width / 2;
    const threshold = targetRect.width * 0.15;
    if (movingEarlier && sourceCenter < targetCenter + threshold) before = true;
    else if (!movingEarlier && sourceCenter > targetCenter - threshold) before = false;
    else return ids;
  } else {
    const sourceCenter = sourceRect.top + sourceRect.height / 2;
    const targetCenter = targetRect.top + targetRect.height / 2;
    const threshold = Math.min(targetRect.height * 0.15, 36);
    if (movingEarlier && sourceCenter < targetCenter + threshold) before = true;
    else if (!movingEarlier && sourceCenter > targetCenter - threshold) before = false;
    else return ids;
  }
  const next = [...ids];
  next.splice(sourceIndex, 1);
  const adjustedTargetIndex = next.indexOf(targetId);
  next.splice(adjustedTargetIndex + (before ? 0 : 1), 0, sourceId);
  return next;
}
