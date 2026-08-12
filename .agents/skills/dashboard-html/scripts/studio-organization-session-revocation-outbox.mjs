export function createOrganizationSessionRevocationOutboxDispatcher({ organizationRepository, authService }) {
  if (!organizationRepository?.listSessionRevocations || !organizationRepository?.acknowledgeSessionRevocation) throw new Error("Organization session revocation outbox requires an organization repository");
  if (!authService?.revokeActorSessions) throw new Error("Organization session revocation outbox requires Auth Service session revocation");
  let active = null;
  const run = async () => {
    const pending = await organizationRepository.listSessionRevocations();
    const result = { pending: pending.length, delivered: 0, failed: 0, sessionsRevoked: 0 };
    for (const { organizationId, event } of pending) {
      try {
        result.sessionsRevoked += await authService.revokeActorSessions(event.actorId, organizationId);
        await organizationRepository.acknowledgeSessionRevocation(organizationId, event.id);
        result.delivered += 1;
      } catch {
        result.failed += 1;
      }
    }
    return result;
  };
  return Object.freeze({ flush() { if (!active) active = run().finally(() => { active = null; }); return active; } });
}
