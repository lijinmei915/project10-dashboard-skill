const maximumSections = 12;

export function normalizeGenerationProgress(progress, fallbackSectionCount = 0) {
  const requestedCount = Number(progress?.sectionCount);
  const fallbackCount = Number(fallbackSectionCount);
  const sectionCount = Math.max(0, Math.min(maximumSections, Number.isFinite(requestedCount) && requestedCount > 0 ? Math.floor(requestedCount) : Math.floor(fallbackCount) || 0));
  const requestedReady = Number(progress?.sectionsReady);
  const sectionsReady = Math.max(0, Math.min(sectionCount, Number.isFinite(requestedReady) ? Math.floor(requestedReady) : 0));
  return { sectionsReady, sectionCount };
}

export function generationProgressStates(progress, { completed = false } = {}) {
  const normalized = normalizeGenerationProgress(progress);
  const sections = Array.from({ length: normalized.sectionCount }, (_, index) => {
    if (index < normalized.sectionsReady) return "done";
    if (index === normalized.sectionsReady && !completed) return "generating";
    return "pending";
  });
  const validation = completed ? "done" : normalized.sectionCount > 0 && normalized.sectionsReady === normalized.sectionCount ? "generating" : "pending";
  return { ...normalized, sections, validation };
}
