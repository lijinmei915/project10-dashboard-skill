export function createAuditOutboxDispatcher({ projectRepository, auditRepository }) {
  if (!projectRepository?.listOutbox || !projectRepository?.acknowledgeOutbox) throw new Error("Audit outbox requires a project repository with outbox support");
  if (!auditRepository?.append) throw new Error("Audit outbox requires an audit repository");
  let active = null;

  async function run() {
    const pending = await projectRepository.listOutbox();
    const result = { pending: pending.length, delivered: 0, failed: 0 };
    for (const { projectId, event } of pending) {
      try {
        await auditRepository.append(event);
        await projectRepository.acknowledgeOutbox(projectId, event.id);
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
