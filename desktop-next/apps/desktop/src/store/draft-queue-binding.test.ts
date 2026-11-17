import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DraftQueueApi } from '../../../shared/src/vanta/draft-queue-custody'
import { createDraftCustody } from '../../electron/vanta/draft-custody'
import { $parkedQueueSessions, $queuedPromptsBySession, $restoredQueueSessions, createQueuedPromptEntry, getQueuedPrompts, isQueueParked, migrateQueuedPrompts, removeQueuedPrompt, unparkQueuedPrompts } from './composer-queue'
import { canDispatchQueuedEntry, createComposerAttachmentQueue, dispatchCustodiedQueueEntry, queuedEntryVisibleForOwner, type QueueSourceClient } from './draft-queue-binding'
import { _resetSessionOwnerHintsForTests, setSessionOwnerHint } from './session'

const roots: string[] = []
const owner = { connectionId: 'local', profile: 'queue-binding-fixture' }
const sourceAddress = { owner, session: 'draft' }
const textRevision = randomUUID()
const captureText = () => ({ scope: 'draft', revision: textRevision })
const image = { id: 'one', occurrenceId: 'one-occurrence', kind: 'image' as const, label: 'A.png', imageData: { mime: 'image/png', dataBase64: 'AAECAwQ=' } }
const route = { connectionId: owner.connectionId, profile: owner.profile, targetProfile: owner.profile }
beforeEach(() => {
  localStorage.clear(); $queuedPromptsBySession.set({}); $parkedQueueSessions.set({}); $restoredQueueSessions.set({}); _resetSessionOwnerHintsForTests()
})
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'queue-binding-')); roots.push(root)
  const custody = createDraftCustody({ root, profileIsActive: async () => true })
  const initial = await custody.open(sourceAddress)
  if (initial.status !== 'ready') throw new Error('Source unavailable')
  let source = await custody.write({ address: sourceAddress, lease: initial.snapshot.lease, expectedRevision: null, attachments: [image] })
  const native = custody.queue // One native controller/serial lane, exactly as production wiring.
  const api: DraftQueueApi = { stage: request => native.stage(request), list: (address, lease) => native.list(address, lease), read: request => native.read(request),
    update: request => native.update(request), begin: request => native.begin(request), finish: request => native.finish(request), remove: request => native.remove(request) }
  const client: QueueSourceClient = { snapshot: () => source, queueApi: () => api,
    stageQueue: async (address, entry, text) => {
      const saved = await native.stage({ address, source, entry, sourceTextRevision: text.revision, sourceTextScope: text.scope }); source = await custody.read(sourceAddress, source.lease); return saved
    } }
  return { api, native, client, getSource: () => source, custody }
}
async function queuedFixture(session = 'native-queue-root') {
  const value = await fixture(), binding = createComposerAttachmentQueue(value.client, session, { captureText, isCurrent: () => true })!
  const entry = createQueuedPromptEntry({ text: 'Look at the attached image', attachments: [image] })
  setSessionOwnerHint(session, route)
  expect(await binding.stage(entry)).toBe(true)
  return { ...value, binding, entry: getQueuedPrompts(session)[0], session }
}

it('uses the existing entry ID and stores only a projection pointer locally, not image bytes or native lease', async () => {
  const value = await queuedFixture()
  expect(value.entry.id).toMatch(/^queued-/)
  expect(value.entry.attachments[0].imageData).toEqual(image.imageData)
  const cached = localStorage.getItem('vanta.desktop.composerQueue.v1')!
  expect(cached).not.toContain(image.imageData.dataBase64)
  expect(cached).not.toContain('generation')
  expect(cached).not.toContain('previewUrl')
  expect(cached).not.toContain('uploadState')
  expect(value.getSource().attachments).toEqual([])
})

it('dispatches native text and image bytes rather than the intentionally stripped cached projection', async () => {
  const value = await queuedFixture()
  const cached = JSON.parse(localStorage.getItem('vanta.desktop.composerQueue.v1')!)[value.session][0]
  expect(cached.attachments[0].imageData).toBeUndefined()
  let payloadSeen: unknown
  const result = await dispatchCustodiedQueueEntry(cached, async (callbacks, payload) => {
    payloadSeen = payload
    await callbacks.onDispatchStarted()
    callbacks.onAccepted({ runtimeSessionId: 'accepted-runtime', storedSessionId: value.session })
    return true
  })
  expect(result).toBe('accepted')
  expect(payloadSeen).toEqual(expect.objectContaining({ text: value.entry.text, attachments: [expect.objectContaining(image)] }))
})

it('hydrates the native bytes before a cached receipt is eligible for dispatch', async () => {
  const value = await queuedFixture(), cached = JSON.parse(localStorage.getItem('vanta.desktop.composerQueue.v1')!)
  $queuedPromptsBySession.set(cached)
  $restoredQueueSessions.set({ [value.session]: true }); $parkedQueueSessions.set({ [value.session]: true })
  const binding = createComposerAttachmentQueue(value.client, value.session, { captureText, isCurrent: () => true })!
  await binding.hydrate()
  const restored = getQueuedPrompts(value.session)[0]
  expect(restored.id).toBe(value.entry.id)
  expect(restored.attachments[0].imageData).toEqual(image.imageData)
  expect(isQueueParked(value.session)).toBe(true)
})

it('parks native recovery before publication even when the crash lost the entire localStorage projection', async () => {
  const value = await fixture(), session = `cold-cache-missing-${randomUUID()}`
  const entry = createQueuedPromptEntry({ text: 'Keep this image queued', attachments: [image] })
  await value.client.stageQueue({ owner, session, entryId: entry.id }, entry, captureText())
  const observed: boolean[] = []
  const off = $queuedPromptsBySession.listen(() => observed.push(isQueueParked(session)))
  try {
    const binding = createComposerAttachmentQueue(value.client, session, { captureText, isCurrent: () => true })!
    await binding.hydrate()
    expect(getQueuedPrompts(session)[0].id).toBe(entry.id)
    expect(getQueuedPrompts(session)[0].attachments[0].imageData).toEqual(image.imageData)
    expect($restoredQueueSessions.get()[session]).toBe(true)
    expect(observed).toEqual([true])
  } finally { off() }
})

it('binds late editor cleanup to the captured text revision rather than identical words', async () => {
  const value = await fixture()
  let revision = randomUUID()
  const originalStage = value.client.stageQueue
  let release!: () => void
  const paused = new Promise<void>(resolve => { release = resolve })
  value.client.stageQueue = async (...args) => { await paused; return originalStage(...args) }
  const binding = createComposerAttachmentQueue(value.client, 'text-revision-root', {
    captureText: () => ({ scope: 'draft', revision }), isCurrent: quote => quote === undefined || quote.revision === revision
  })!
  const transfer = binding.stage(createQueuedPromptEntry({ text: 'Same words', attachments: [image] }))
  const capturedEditor = binding.captureStageEditor()
  expect(capturedEditor()).toBe(true)
  revision = randomUUID() // User deleted and retyped the same words: new intent.
  release(); await transfer
  expect(capturedEditor()).toBe(false)
  expect(binding.isCurrentEditor()).toBe(true) // Identity-only checks remain usable for independent edit/delete operations.
})

it('keeps the native address after a positive UI lineage move and accepts exactly once under the captured owner', async () => {
  const value = await queuedFixture('old-tip'), originalAddress = value.entry.custody!.address
  migrateQueuedPrompts('old-tip', 'lineage-root'); setSessionOwnerHint('lineage-root', route)
  const moved = getQueuedPrompts('lineage-root')[0]
  expect(moved.custody!.address).toEqual(originalAddress)
  let calls = 0
  expect(await dispatchCustodiedQueueEntry(moved, async callbacks => {
    calls++; await callbacks.onDispatchStarted(); callbacks.onAccepted({ runtimeSessionId: 'recovered-runtime', storedSessionId: 'new-tip' }); return false
  })).toBe('accepted')
  expect(calls).toBe(1)
  expect(getQueuedPrompts('lineage-root')).toEqual([])
  const [saved] = await value.native.list({ owner, session: 'old-tip' }, value.getSource().lease)
  expect(saved).toMatchObject({ status: 'accepted', accepted: { runtimeSessionId: 'recovered-runtime', storedSessionId: 'new-tip' } })
})

it('holds an unknown send even after manual Resume and never invokes a second provider attempt', async () => {
  const value = await queuedFixture()
  expect(await dispatchCustodiedQueueEntry(value.entry, async callbacks => { await callbacks.onDispatchStarted(); throw new Error('reset') })).toBe('unknown')
  const unknown = getQueuedPrompts(value.session)[0]
  expect(unknown.custody!.status).toBe('unknown')
  expect(isQueueParked(value.session)).toBe(true)
  unparkQueuedPrompts(value.session)
  expect(canDispatchQueuedEntry(value.session, unknown)).toBe(false)
  await expect(dispatchCustodiedQueueEntry(unknown, async () => true)).rejects.toThrow('custody_conflict')
})

it('does not substitute an ambient profile when ownership is ambiguous or changes before invocation', async () => {
  const value = await queuedFixture()
  setSessionOwnerHint(value.session, { connectionId: 'remote', profile: owner.profile, targetProfile: owner.profile })
  let calls = 0
  await expect(dispatchCustodiedQueueEntry(value.entry, async () => { calls++; return true })).rejects.toThrow('captured draft owner could not be proven')
  expect(calls).toBe(0)
  _resetSessionOwnerHintsForTests(); setSessionOwnerHint(value.session, route)
  await expect(dispatchCustodiedQueueEntry(value.entry, async callbacks => {
    setSessionOwnerHint(value.session, { connectionId: 'remote', profile: 'other', targetProfile: 'other' })
    await callbacks.onDispatchStarted(); calls++; return true
  })).rejects.toThrow('owner conflicts')
  expect(calls).toBe(0)
  expect((await value.native.list({ owner, session: value.session }, value.getSource().lease))[0].status).toBe('queued')
})

it('does not expose native attachment rows under a different owner with the same stored session ID', async () => {
  const value = await queuedFixture()
  expect(queuedEntryVisibleForOwner(value.entry, owner)).toBe(true)
  expect(queuedEntryVisibleForOwner(value.entry, { ...owner, profile: 'different-profile' })).toBe(false)
  expect(queuedEntryVisibleForOwner(value.entry)).toBe(false)
  _resetSessionOwnerHintsForTests(); setSessionOwnerHint(value.session, { ...route, profile: 'different-profile', targetProfile: 'different-profile' })
  await expect(value.binding.hydrate()).rejects.toThrow('owner conflicts')
  expect((await value.native.list({ owner, session: value.session }, value.getSource().lease))[0].entry.attachments).toEqual([image])
})

it('native removal acknowledgment precedes removal of the queue projection', async () => {
  const value = await queuedFixture()
  expect(removeQueuedPrompt(value.session, value.entry.id)).toBe(false)
  expect(getQueuedPrompts(value.session)).toHaveLength(1)
  for (let index = 0; index < 50 && getQueuedPrompts(value.session).length; index++) await new Promise(resolve => setTimeout(resolve, 2))
  expect(getQueuedPrompts(value.session)).toEqual([])
  const [removed] = await value.native.list({ owner, session: value.session }, value.getSource().lease)
  expect(removed.status).toBe('removed')
  await expect(value.native.begin({ address: removed.address, lease: removed.lease, revision: removed.revision, attemptId: randomUUID() })).rejects.toThrow('custody_conflict')
})

it('retains legacy restarted images without assigning them a foreground owner, including after Resume', async () => {
  vi.resetModules()
  const legacy = { id: 'legacy-owner-unknown', text: 'Keep this image', queuedAt: 1, attachments: [image] }
  localStorage.setItem('vanta.desktop.composerQueue.v1', JSON.stringify({ legacy: [legacy] }))
  const binding = await import('./draft-queue-binding'), queue = await import('./composer-queue')
  expect(binding.canDispatchQueuedEntry('legacy', queue.getQueuedPrompts('legacy')[0])).toBe(false)
  queue.unparkQueuedPrompts('legacy')
  expect(binding.canDispatchQueuedEntry('legacy', queue.getQueuedPrompts('legacy')[0])).toBe(false)
  expect(queue.getQueuedPrompts('legacy')[0].attachments[0].imageData).toEqual(image.imageData)
})
