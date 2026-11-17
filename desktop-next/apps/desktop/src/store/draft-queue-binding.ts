import type { DraftAddress, DraftOwner } from '../../../shared/src/vanta/draft-custody'
import type { DraftSnapshot } from '../../../shared/src/vanta/draft-custody-protocol'
import { draftQueueAddress, draftQueueEnvelope, type DraftQueueApi, type DraftQueueEnvelope, type DraftQueueEntry, type DraftQueueTextQuote } from '../../../shared/src/vanta/draft-queue-custody'
import { $queuedPromptsBySession, $restoredQueueSessions, parkQueuedPrompts, projectNativeQueuedPrompt, removeQueuedPrompt, type QueuedPromptEntry } from './composer-queue'
import { DraftQueueCustodyClient, type QueueDispatchCallbacks } from './draft-queue-custody-client'
import { custodyPayload, restoreCustodyPreviews } from './draft-custody-merge'
import { registerNativeQueueRemoval } from './draft-queue-projection'
import { getSessionOwnerHints } from './session'
import { assertDraftDispatchOwner } from './draft-dispatch-owner'

export interface QueueSourceClient {
  snapshot(): DraftSnapshot | undefined
  queueApi(): DraftQueueApi | undefined
  stageQueue(address: ReturnType<typeof draftQueueAddress>, entry: DraftQueueEntry, text: DraftQueueTextQuote): Promise<DraftQueueEnvelope | null>
}
export interface ComposerAttachmentQueue {
  readonly owner: DraftOwner
  isCurrentEditor(): boolean
  captureStageEditor(): () => boolean
  stage(entry: QueuedPromptEntry): Promise<boolean>
  update(entry: QueuedPromptEntry): Promise<boolean>
  remove(entry: QueuedPromptEntry): Promise<boolean>
  hydrate(): Promise<void>
}
const known = new Map<string, { envelope: DraftQueueEnvelope; client: DraftQueueCustodyClient }>()
const legacyRestored = new Set(Object.values($queuedPromptsBySession.get()).flatMap(queue => queue.filter(entry => entry.attachments.length && !entry.custody).map(entry => entry.id)))
export const isLegacyRestoredAttachment = (entry: QueuedPromptEntry): boolean => legacyRestored.has(entry.id)
const identity = (address: unknown): string => JSON.stringify(draftQueueAddress(address))
const receiptKey = (entry: QueuedPromptEntry): string | null => {
  try { return entry.custody ? identity(entry.custody.address) : null } catch { return null }
}
const locations = (id: string, key: string): string[] => Object.entries($queuedPromptsBySession.get())
  .filter(([, queue]) => queue.some(entry => entry.id === id && receiptKey(entry) === key)).map(([session]) => session)

export function publishNativeQueueEnvelope(raw: DraftQueueEnvelope, client: DraftQueueCustodyClient, fallbackSession: string, restored = false): void {
  const envelope = draftQueueEnvelope(raw), key = identity(envelope.address)
  const recovered = restored && !known.has(key)
  known.set(key, { envelope, client })
  const sessions = locations(envelope.entry.id, key)
  // Keep the native address immutable. Only existing positive lineage migrations may move this UI projection.
  for (const session of sessions.length ? sessions : [fallbackSession]) {
    if (envelope.status === 'accepted' || envelope.status === 'removed') {
      removeQueuedPrompt(session, envelope.entry.id, { nativeConfirmed: true, retainPreviewUrls: envelope.status === 'accepted' })
    } else {
      const routes = getSessionOwnerHints(session)
      if (routes.some(route => route.connectionId !== envelope.address.owner.connectionId || (route.targetProfile || route.profile) !== envelope.address.owner.profile)) throw new Error('Queued attachment owner conflicts with this conversation; saved bytes were retained.')
      projectNativeQueuedPrompt(session, { ...envelope.entry, attachments: restoreCustodyPreviews(envelope.entry.attachments),
        custody: { address: envelope.address, revision: envelope.revision, status: envelope.status } }, recovered)
      if (envelope.status !== 'queued') parkQueuedPrompts(session)
    }
  }
}
function captured(entry: QueuedPromptEntry) {
  const key = receiptKey(entry), value = key ? known.get(key) : undefined
  if (!value || value.envelope.revision !== entry.custody?.revision) throw new Error('Saved queued attachments need owner-bound recovery before sending.')
  return value
}
const payload = (entry: QueuedPromptEntry, address: DraftAddress): DraftQueueEntry => ({
  id: entry.id, text: entry.text, queuedAt: entry.queuedAt, attachments: custodyPayload(address, entry.attachments),
  ...(entry.displayText ? { displayText: entry.displayText } : {}), ...(entry.displayKind ? { displayKind: entry.displayKind } : {})
})

export function createComposerAttachmentQueue(source: QueueSourceClient, uiSessionKey: string, options?: { captureText: () => DraftQueueTextQuote | null; isCurrent: (text?: DraftQueueTextQuote) => boolean }): ComposerAttachmentQueue | undefined {
  const snapshot = source.snapshot(), api = source.queueApi()
  if (!snapshot || !api) return undefined
  const owner = snapshot.address.owner, lease = snapshot.lease
  const client = new DraftQueueCustodyClient(api, (envelope, restored) => publishNativeQueueEnvelope(envelope, client, uiSessionKey, restored))
  let stageText: DraftQueueTextQuote | undefined
  return {
    owner,
    isCurrentEditor: () => options?.isCurrent() ?? false,
    captureStageEditor: () => { const captured = stageText; return () => options?.isCurrent(captured) ?? false },
    async stage(entry) {
      const address = { owner, session: uiSessionKey, entryId: entry.id }
      const text = options?.captureText()
      if (!text) return false
      stageText = text
      const saved = await source.stageQueue(address, payload(entry, address), text)
      if (!saved) return false
      if (JSON.stringify(saved.lease) !== JSON.stringify(lease)) throw new Error('Queued attachment owner changed before transfer.')
      publishNativeQueueEnvelope(saved, client, uiSessionKey)
      return true
    },
    async update(entry) { const value = captured(entry); await value.client.update(value.envelope, payload(entry, value.envelope.address)); return true },
    async remove(entry) { const value = captured(entry); await value.client.remove(value.envelope); return true },
    async hydrate() {
      const sessions = new Set([uiSessionKey])
      for (const entry of $queuedPromptsBySession.get()[uiSessionKey] ?? []) {
        if (entry.custody && JSON.stringify(entry.custody.address.owner) === JSON.stringify(owner)) sessions.add(entry.custody.address.session)
      }
      for (const session of sessions) await client.restore({ owner, session }, lease)
    }
  }
}

/** Colliding backend session IDs must not reveal another profile's native attachment queue. */
export function queuedEntryVisibleForOwner(entry: QueuedPromptEntry, owner?: DraftOwner): boolean {
  if (!entry.custody) return true
  return Boolean(owner && entry.custody.address.owner.connectionId === owner.connectionId && entry.custody.address.owner.profile === owner.profile)
}

/** No native lease is read from localStorage. Legacy restarted attachments remain visible but cannot auto-dispatch. */
export function canDispatchQueuedEntry(sessionKey: string, entry: QueuedPromptEntry): boolean {
  if (!entry.custody) return !legacyRestored.has(entry.id) && !(entry.attachments.length && $restoredQueueSessions.get()[sessionKey])
  try { return captured(entry).envelope.status === 'queued' } catch { return false }
}
export async function dispatchCustodiedQueueEntry(entry: QueuedPromptEntry, submit: (callbacks: QueueDispatchCallbacks, payload: QueuedPromptEntry) => Promise<boolean | void>): Promise<'accepted' | 'rejected' | 'unknown'> {
  const value = captured(entry)
  const verifyOwner = async () => {
    const sessions = locations(entry.id, identity(value.envelope.address))
    if (sessions.length !== 1) throw new Error('Queued attachment conversation is ambiguous; nothing was sent.')
    await assertDraftDispatchOwner(sessions[0], value.envelope.address.owner)
  }
  await verifyOwner()
  const result = await value.client.dispatch(value.envelope, callbacks => submit({ ...callbacks,
    onDispatchStarted: async () => { await verifyOwner(); await callbacks.onDispatchStarted() }
  }, { ...value.envelope.entry, attachments: restoreCustodyPreviews(value.envelope.entry.attachments) }))
  return result.status
}

registerNativeQueueRemoval(async ({ entry, sessionKey }) => {
  try { const value = captured(entry); await value.client.remove(value.envelope) }
  catch (error) { parkQueuedPrompts(sessionKey); throw error }
})
