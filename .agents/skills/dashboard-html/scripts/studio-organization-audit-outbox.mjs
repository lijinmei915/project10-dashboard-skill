export function createOrganizationAuditOutboxDispatcher({ organizationRepository, auditRepository }) {
  if (!organizationRepository?.listOutbox || !organizationRepository?.acknowledgeOutbox) throw new Error("Organization audit outbox requires an organization repository");
  if (!auditRepository?.append) throw new Error("Organization audit outbox requires an audit repository");
  let active = null;
  const run = async () => {
    const pending = await organizationRepository.listOutbox();
    const result = { pending: pending.length, delivered: 0, failed: 0 };
    for (const { organizationId, event } of pending) {
      try { await auditRepository.append(event); await organizationRepository.acknowledgeOutbox(organizationId, event.id); result.delivered += 1; } catch { result.failed += 1; }
    }
    return result;
  };
  return Object.freeze({ flush() { if (!active) active = run().finally(() => { active = null; }); return active; } });
}
