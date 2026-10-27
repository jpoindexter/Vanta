import { type DraftAddress } from '../../../shared/src/vanta/draft-custody'
import { DraftCustodyClient } from './draft-custody-client'
import type { ComposerAttachment, ComposerAttachmentPatch } from './composer'

const clients = new Map<string, DraftCustodyClient>()
export const custodyAddressKey = (address: DraftAddress): string => JSON.stringify([address.owner.connectionId, address.owner.profile, address.session])
export function draftCustodyClient(address: DraftAddress): DraftCustodyClient {
  const key = custodyAddressKey(address)
  let client = clients.get(key)
  if (!client) { client = new DraftCustodyClient(address, window.desktopBridge?.draftAttachments); clients.set(key, client) }
  return client
}
export function patchStashedCustodyOccurrence(expected: ComposerAttachment, patch: ComposerAttachmentPatch): boolean {
  let updated = false
  for (const client of clients.values()) {
    const current = client.$attachments.get(), index = current.findIndex(item => expected.occurrenceId
      ? item.id === expected.id && item.occurrenceId === expected.occurrenceId : item === expected)
    if (index < 0) continue
    const next = [...current]; next[index] = { ...next[index], ...patch }; client.update(next)
    updated = true
  }
  return updated
}
export function resetDraftCustodyRegistryForTests(): void { clients.clear() }
/** Exact first-create assignment only; navigation is not a custody transfer. */
export function attachDraftRecovery(source: DraftCustodyClient, assignedSession: string): void {
  if (!assignedSession || assignedSession === source.address.session) return
  draftCustodyClient({ owner: source.address.owner, session: assignedSession }).$recoverySource.set(source)
}
export async function hydrateLinkedDraftRecoveries(target: DraftCustodyClient): Promise<void> {
  const saved = target.snapshot()
  if (!saved) return
  for (const address of saved.recoveries ?? []) {
    const source = draftCustodyClient(address)
    await source.hydrateCaptured(saved.lease)
    if (target.snapshot()?.revision !== saved.revision) return
    if (source.snapshot()?.pendingSend) target.$recoverySource.set(source)
    else if (target.$recoverySource.get() === source) target.$recoverySource.set(null)
  }
}
