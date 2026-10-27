import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DraftQueueApi, DraftQueueEnvelope } from '../../../../../../shared/src/vanta/draft-queue-custody'
import { mainComposerScope } from '@/store/composer'
import { $parkedQueueSessions, $queuedPromptsBySession, $restoredQueueSessions, getQueuedPrompts } from '@/store/composer-queue'
import { publishNativeQueueEnvelope, type ComposerAttachmentQueue } from '@/store/draft-queue-binding'
import { DraftQueueCustodyClient } from '@/store/draft-queue-custody-client'
import { _resetSessionOwnerHintsForTests, setSessionOwnerHint, setSessionsLoading } from '@/store/session'
import { useBackgroundQueueDrain } from '../../../session/hooks/use-background-queue-drain'
import type { QueueEditState } from '../composer-utils'
import type { ChatBarProps } from '../types'
import { useComposerQueue } from './use-composer-queue'

const key = 'custody-hook-root', owner = { connectionId: 'local', profile: 'custody-hook' }
const image = { id: 'A', occurrenceId: 'A-once', kind: 'image' as const, label: 'A.png', imageData: { mime: 'image/png', dataBase64: 'AQ==' } }
beforeEach(() => { localStorage.clear(); $queuedPromptsBySession.set({}); $parkedQueueSessions.set({}); $restoredQueueSessions.set({}); setSessionsLoading(false); _resetSessionOwnerHintsForTests(); mainComposerScope.$attachments.set([image]) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); mainComposerScope.$attachments.set([]); setSessionsLoading(true) })

function composer(attachmentQueue?: ComposerAttachmentQueue, required = false, busy = true, onSubmit: ChatBarProps['onSubmit'] = async () => true) {
  const draftRef = { current: 'Inspect A' }, queueEditRef = { current: null as QueueEditState | null }, clearDraft = vi.fn(() => { draftRef.current = '' })
  const hook = renderHook(() => useComposerQueue({ activeQueueSessionKey: key, attachmentQueue, attachmentQueueOwner: owner, attachmentQueueRequired: required,
    attachments: [image], busy, clearDraft, draftRef, focusInput: () => undefined, loadIntoComposer: text => { draftRef.current = text },
    onCancel: () => undefined, onSteer: undefined, onSubmit, queueEditRef, queueSessionKey: key, sessionId: 'runtime-A' }))
  return { hook, draftRef, clearDraft }
}

it('does not consume words or images before the native transfer acknowledgment and preserves newer input', async () => {
  let finish!: (saved: boolean) => void
  const transfer = new Promise<boolean>(resolve => { finish = resolve })
  const stage = vi.fn<ComposerAttachmentQueue['stage']>(() => transfer.then(saved => { if (saved) mainComposerScope.removeOccurrences([image]); return saved })), binding = { owner, stage, isCurrentEditor: () => true, captureStageEditor: () => () => true, update: vi.fn(), remove: vi.fn(), hydrate: vi.fn() } as ComposerAttachmentQueue
  const value = composer(binding, true)
  act(() => { expect(value.hook.result.current.queueCurrentDraft()).toBe(true) })
  expect(value.clearDraft).not.toHaveBeenCalled()
  expect(mainComposerScope.$attachments.get()).toEqual([image])
  const B = { ...image, id: 'B', occurrenceId: 'B-once' }
  mainComposerScope.$attachments.set([image, B]); value.draftRef.current = 'New input B'
  await act(async () => { finish(true); await transfer })
  expect(value.draftRef.current).toBe('New input B')
  expect(mainComposerScope.$attachments.get()).toEqual([B])
  expect(stage.mock.calls[0][0].id).toMatch(/^queued-/)
})

it('keeps the full draft when native transfer fails or custody is still hydrating', async () => {
  const binding = { owner, stage: vi.fn(async () => false), isCurrentEditor: () => true, captureStageEditor: () => () => true, update: vi.fn(), remove: vi.fn(), hydrate: vi.fn() } as ComposerAttachmentQueue
  const value = composer(binding, true)
  await act(async () => { value.hook.result.current.queueCurrentDraft() })
  expect(value.clearDraft).not.toHaveBeenCalled()
  expect(value.draftRef.current).toBe('Inspect A')
  expect(mainComposerScope.$attachments.get()).toEqual([image])
  value.hook.unmount()
  const loading = composer(undefined, true)
  act(() => { expect(loading.hook.result.current.queueCurrentDraft()).toBe(false) })
  expect(getQueuedPrompts(key)).toEqual([])
})

it('a late transfer cannot clear or unpark another owner with the same key and words', async () => {
  let finish!: (saved: boolean) => void
  const transfer = new Promise<boolean>(resolve => { finish = resolve })
  let current = true
  const binding = { owner, stage: () => transfer, isCurrentEditor: () => current, captureStageEditor: () => () => current, update: vi.fn(), remove: vi.fn(), hydrate: vi.fn() } as ComposerAttachmentQueue
  const value = composer(binding, true)
  act(() => { value.hook.result.current.queueCurrentDraft() })
  current = false
  const B = { ...image, label: 'Another owner same occurrence ID' }
  mainComposerScope.$attachments.set([B]); $parkedQueueSessions.set({ [key]: true })
  await act(async () => { finish(true); await transfer })
  expect(value.clearDraft).not.toHaveBeenCalled()
  expect(value.draftRef.current).toBe('Inspect A')
  expect(mainComposerScope.$attachments.get()).toEqual([B])
  expect($parkedQueueSessions.get()[key]).toBe(true)
})

function nativeProjection() {
  let current: DraftQueueEnvelope = { version: 1, address: { owner, session: key, entryId: 'queued-hook-existing' }, lease: { owner, generation: randomUUID() }, revision: randomUUID(), status: 'queued',
    origin: { address: { owner, session: 'draft' }, revision: null, hashes: [], sourceTextRevision: randomUUID(), sourceTextScope: 'draft' }, entry: { id: 'queued-hook-existing', text: 'Queued A', queuedAt: 1, attachments: [image] } }
  const api = { begin: vi.fn(async (request: Parameters<DraftQueueApi['begin']>[0]) => current = { ...current, attemptId: request.attemptId, status: 'sending', revision: randomUUID() }),
    finish: vi.fn(async (request: Parameters<DraftQueueApi['finish']>[0]) => current = { ...current, status: request.outcome === 'rejected' ? 'queued' : request.outcome, ...(request.accepted ? { accepted: request.accepted } : {}), revision: randomUUID() }) } as unknown as DraftQueueApi
  const client = new DraftQueueCustodyClient(api, envelope => publishNativeQueueEnvelope(envelope, client, key))
  setSessionOwnerHint(key, { ...owner, targetProfile: owner.profile })
  publishNativeQueueEnvelope(current, client, key)
  return { api }
}

it.each(['foreground', 'background'])('%s drainer consumes only the accepted callback, even when cleanup returns false', async mode => {
  const value = nativeProjection(), submit = vi.fn<ChatBarProps['onSubmit']>(async (_text, options) => {
    await options?.onDispatchStarted?.(); options?.onAccepted?.({ runtimeSessionId: 'accepted-runtime', storedSessionId: key }); return false
  })
  if (mode === 'foreground') composer(undefined, false, false, submit)
  else renderHook(() => useBackgroundQueueDrain({ enabled: true, selectedStoredSessionId: 'different-session', runtimeIdByStoredSessionIdRef: { current: new Map([[key, 'runtime-A']]) }, submitText: submit }))
  await waitFor(() => expect(getQueuedPrompts(key)).toEqual([]))
  expect(submit).toHaveBeenCalledTimes(1)
  expect(value.api.finish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outcome: 'accepted', accepted: { runtimeSessionId: 'accepted-runtime', storedSessionId: key } }))
})

it.each(['foreground', 'background'])('%s drainer parks an unknown send without invoking its automatic retry ladder again', async mode => {
  const value = nativeProjection(), submit = vi.fn<ChatBarProps['onSubmit']>(async (_text, options) => { await options?.onDispatchStarted?.(); throw new Error('reset') })
  if (mode === 'foreground') composer(undefined, false, false, submit)
  else renderHook(() => useBackgroundQueueDrain({ enabled: true, selectedStoredSessionId: 'different-session', runtimeIdByStoredSessionIdRef: { current: new Map([[key, 'runtime-A']]) }, submitText: submit }))
  await waitFor(() => expect(getQueuedPrompts(key)[0].custody?.status).toBe('unknown'))
  expect($parkedQueueSessions.get()[key]).toBe(true)
  expect(submit).toHaveBeenCalledTimes(1)
  expect(value.api.finish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outcome: 'unknown' }))
})
