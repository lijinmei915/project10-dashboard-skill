function failureCategory(error) {
  const code = String(error?.code || "").toLowerCase();
  if (code.includes("timeout") || error?.name === "AbortError") return "timeout";
  if (code.includes("network") || code.includes("connect") || code.includes("fetch")) return "network";
  if (code.includes("reject") || code.includes("http")) return "rejected";
  return "delivery-failed";
}

export function createAuditAnchorDispatcher({ auditRepository, sink, maxAttempts = 8 } = {}) {
  if (!auditRepository?.listAnchorOutbox || !auditRepository?.acknowledgeAnchor || !auditRepository?.recordAnchorFailure) throw new Error("Audit anchor dispatcher requires an anchor-capable audit repository");
  if (!sink?.append) throw new Error("Audit anchor dispatcher requires an external anchor sink");
  let active = null;
  const run = async () => {
    const pending = await auditRepository.listAnchorOutbox({ maxAttempts });
    const result = { pending: pending.length, delivered: 0, failed: 0 };
    for (const anchor of pending) {
      try {
        const receipt = await sink.append(structuredClone(anchor));
        await auditRepository.acknowledgeAnchor(anchor, { receiptReference: receipt?.receiptReference || null });
        result.delivered += 1;
      } catch (error) {
        await auditRepository.recordAnchorFailure(anchor, failureCategory(error));
        result.failed += 1;
      }
    }
    return result;
  };
  return Object.freeze({ flush() { if (!active) active = run().finally(() => { active = null; }); return active; } });
}
