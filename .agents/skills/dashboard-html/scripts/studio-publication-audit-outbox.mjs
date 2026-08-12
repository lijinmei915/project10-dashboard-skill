export function createPublicationAuditOutboxDispatcher({ publicationRepository, auditRepository }) {
  if (!publicationRepository?.listOutbox || !publicationRepository?.acknowledgeOutbox) throw new Error("Publication audit outbox requires a publication repository with outbox support");
  if (!auditRepository?.append) throw new Error("Publication audit outbox requires an audit repository");
  let active = null;

  async function run() {
    const pending = await publicationRepository.listOutbox();
    const result = { pending: pending.length, delivered: 0, failed: 0 };
    for (const { publicationId, event } of pending) {
      try {
        await auditRepository.append(event);
        await publicationRepository.acknowledgeOutbox(publicationId, event.id);
        result.delivered += 1;
      } catch {
        result.failed += 1;
      }
    }
    return result;
  }

  return Object.freeze({
    flush() {
      if (!active) active = run().finally(() => { active = null; });
      return active;
    }
  });
}
