import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { draftOwnerState, draftSnapshot, type DraftSnapshot, type DraftLease } from '../../../shared/src/vanta/draft-custody-protocol'
import type { DraftAddress } from '../../../shared/src/vanta/draft-custody'
import { draftQueueFinish, type DraftQueueEnvelope } from '../../../shared/src/vanta/draft-queue-custody'
import { createDraftCustody } from './draft-custody'
import { createCustodyFiles, custodyDigest } from './draft-custody-files'
import { createDraftQueueCustody, type DraftQueueCustodyDeps } from './draft-queue-custody'

const roots: string[] = []
const owner = { connectionId: 'local', profile: 'foo' }
const draft = { owner, session: 'draft-before-first-send' }
const address = { owner, session: 'stored-root', entryId: 'queued-1729-existing-id' }
const textQuote = { sourceTextRevision: randomUUID(), sourceTextScope: 'draft' }
const image = { id: 'one', occurrenceId: 'occurrence-one', kind: 'image' as const, label: 'one.png', imageData: { mime: 'image/png', dataBase64: 'AAECAwQ=' } }
const nextImage = { ...image, id: 'two', occurrenceId: 'occurrence-two', label: 'two.png' }
const quote = (value: DraftQueueEnvelope) => ({ address: value.address, lease: value.lease, revision: value.revision })
const entry = (attachments = [image]) => ({ id: address.entryId, text: 'Inspect this exact image', queuedAt: 1729, attachments })
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vanta-queue-custody-')); roots.push(root)
  const custody = createDraftCustody({ root, profileIsActive: async () => true })
  const opened = await custody.open(draft)
  if (opened.status !== 'ready') throw new Error('Fixture did not open')
  const source = await custody.write({ address: draft, lease: opened.snapshot.lease, expectedRevision: null, attachments: [image] })
  const files = createCustodyFiles(root)
  const assertLease = async (lease: DraftLease) => {
    const state = draftOwnerState(await files.read(custodyDigest(lease.owner) + '.owner.json'))
    if (state.status !== 'active' || state.generation !== lease.generation) throw new Error('custody_lifecycle')
  }
  const readDraft = async (address: DraftAddress, lease: DraftLease): Promise<DraftSnapshot> => {
    await assertLease(lease)
    const saved = await files.read(custodyDigest(address) + '.draft.json')
    const snapshot = saved === null ? { address, lease, revision: null, attachments: [] } : draftSnapshot(saved)
    const pending = await files.read(custodyDigest(address) + '.send.json') as DraftSnapshot['pendingSend'] | null
    return pending ? { ...snapshot, pendingSend: { id: pending.id, attachmentIds: pending.attachmentIds, text: pending.text } } : snapshot
  }
  const deps: DraftQueueCustodyDeps = {
    files,
    assertLease,
    readDraft,
    consumeDraft: async request => {
      const current = await readDraft(request.address, request.lease)
      const attachments = current.attachments.filter(item => !request.hashes.includes(custodyDigest(item)))
      if (attachments.length !== current.attachments.length) await custody.write({ address: request.address, lease: request.lease, expectedRevision: current.revision, attachments })
    }
  }
  return { root, source, custody, files, deps, queue: createDraftQueueCustody(deps) }
}
const stage = (value: Awaited<ReturnType<typeof fixture>>, source: DraftSnapshot = value.source) => value.queue.stage({ address, source, entry: entry(), ...textQuote })

it('moves exact source occurrences to the existing queue ID and restores byte-for-byte after restart', async () => {
  const value = await fixture(), saved = await stage(value)
  expect(saved).toMatchObject({ status: 'queued', address, entry: entry() })
  expect((await value.custody.read(draft, value.source.lease)).attachments).toEqual([])
  const restarted = createDraftQueueCustody(value.deps)
  expect(await restarted.list({ owner, session: address.session }, saved.lease)).toEqual([saved])
  expect((await restarted.list({ owner, session: address.session }, saved.lease))[0].entry.attachments[0].imageData).toEqual(image.imageData)
})

it('leaves source untouched if staging cannot be written', async () => {
  const value = await fixture()
  const queue = createDraftQueueCustody({ ...value.deps, files: { ...value.files, write: async () => { throw new Error('disk full') } } })
  await expect(queue.stage({ address, source: value.source, entry: entry(), ...textQuote })).rejects.toThrow('disk full')
  expect((await value.custody.read(draft, value.source.lease)).attachments).toEqual([image])
  expect(await value.queue.list({ owner, session: address.session }, value.source.lease)).toEqual([])
})

it('reconciles a crash after destination staging before draft restore, preserving newer source additions', async () => {
  const value = await fixture()
  const crashed = createDraftQueueCustody({ ...value.deps, consumeDraft: async () => { throw new Error('crash before consume') } })
  await expect(crashed.stage({ address, source: value.source, entry: entry(), ...textQuote })).rejects.toThrow('crash')
  expect(await value.queue.consumedSourceTextRevisions(draft, value.source.lease)).toEqual([])
  await value.custody.write({ address: draft, lease: value.source.lease, expectedRevision: value.source.revision, attachments: [image, nextImage] })
  await value.queue.recoverForDraft(draft, value.source.lease)
  expect(await value.queue.consumedSourceTextRevisions(draft, value.source.lease)).toEqual([{ scope: textQuote.sourceTextScope, revision: textQuote.sourceTextRevision }])
  expect((await value.custody.read(draft, value.source.lease)).attachments).toEqual([nextImage])
  expect((await value.queue.list({ owner, session: address.session }, value.source.lease)).map(item => item.entry.id)).toEqual([address.entryId])
})

it('reconciles a crash after source consumption without losing or duplicating the queue entry', async () => {
  const value = await fixture(), baseWrite = value.files.write
  const crashed = createDraftQueueCustody({ ...value.deps, files: { ...value.files, write: async (key, payload) => {
    if ((payload as DraftQueueEnvelope).status === 'queued') throw new Error('crash after consume')
    await baseWrite(key, payload)
  } } })
  await expect(crashed.stage({ address, source: value.source, entry: entry(), ...textQuote })).rejects.toThrow('crash')
  expect((await value.custody.read(draft, value.source.lease)).attachments).toEqual([])
  await value.queue.recoverForDraft(draft, value.source.lease)
  expect(await value.queue.list({ owner, session: address.session }, value.source.lease)).toHaveLength(1)
})

it('rejects stale snapshots, substituted images, and cross-owner addresses before consuming anything', async () => {
  const value = await fixture()
  await expect(value.queue.stage({ address, source: value.source, entry: entry([nextImage]), ...textQuote })).rejects.toThrow('custody_conflict')
  await expect(value.queue.stage({ address: { ...address, owner: { ...owner, profile: 'other' } }, source: value.source, entry: entry(), ...textQuote })).rejects.toThrow('Invalid')
  await value.custody.write({ address: draft, lease: value.source.lease, expectedRevision: value.source.revision, attachments: [image, nextImage] })
  await expect(stage(value)).rejects.toThrow('custody_conflict')
  expect((await value.custody.read(draft, value.source.lease)).attachments).toEqual([image, nextImage])
})

it('does not transfer pending-send occurrences but can transfer independent newly-added ones', async () => {
  const value = await fixture()
  const saved = await value.custody.write({ address: draft, lease: value.source.lease, expectedRevision: value.source.revision, attachments: [image, nextImage] })
  await value.custody.beginSend({ address: draft, lease: saved.lease, revision: saved.revision, id: randomUUID(), attachmentIds: [image.occurrenceId], text: 'send A' })
  const current = await value.custody.read(draft, saved.lease)
  await expect(stage(value, current)).rejects.toThrow('custody_conflict')
  const queued = await value.queue.stage({ address, source: current, entry: entry([nextImage]), ...textQuote })
  expect(queued.entry.attachments).toEqual([nextImage])
  expect((await value.custody.read(draft, saved.lease)).attachments).toEqual([image])
})

it('CAS rejects stale edit/remove and a removed tombstone prevents late stage resurrection', async () => {
  const value = await fixture(), saved = await stage(value)
  const edited = await value.queue.update({ ...quote(saved), entry: { ...saved.entry, text: 'Edited once' } })
  await expect(value.queue.remove(quote(saved))).rejects.toThrow('custody_conflict')
  const removed = await value.queue.remove(quote(edited))
  expect(removed.entry.attachments).toEqual([])
  await expect(stage(value)).rejects.toThrow('custody_conflict')
  expect((await value.queue.list({ owner, session: address.session }, saved.lease))[0].status).toBe('removed')
})

it('checkpoints before dispatch and turns an interrupted send into unknown, never queued', async () => {
  const value = await fixture(), queued = await stage(value)
  const sending = await value.queue.begin({ ...quote(queued), attemptId: randomUUID() })
  await expect(value.queue.remove(quote(sending))).rejects.toThrow('custody_conflict')
  const restarted = createDraftQueueCustody(value.deps)
  const [unknown] = await restarted.list({ owner, session: address.session }, queued.lease)
  expect(unknown.status).toBe('unknown')
  await expect(restarted.begin({ ...quote(unknown), attemptId: randomUUID() })).rejects.toThrow('custody_conflict')
})

it('keeps actual accepted identity after exact-once finish and removal', async () => {
  const value = await fixture(), queued = await stage(value), attemptId = randomUUID()
  const sending = await value.queue.begin({ ...quote(queued), attemptId })
  const accepted = { runtimeSessionId: 'recovered-runtime', storedSessionId: 'stored-tip' }
  const acknowledged = await value.queue.finish({ ...quote(sending), attemptId, outcome: 'accepted', accepted })
  expect(acknowledged.accepted).toEqual(accepted)
  await expect(value.queue.finish({ ...quote(sending), attemptId, outcome: 'accepted', accepted })).rejects.toThrow('custody_conflict')
  const removed = await value.queue.remove(quote(acknowledged))
  expect(removed.accepted).toEqual(accepted)
  expect(removed.entry.text).toBe('')
  expect(await value.queue.consumedSourceTextRevisions(draft, value.source.lease)).toEqual([{ scope: textQuote.sourceTextScope, revision: textQuote.sourceTextRevision }])
})

it('blocks archived owner leases and validates accepted IPC identity before effects', async () => {
  const value = await fixture(), queued = await stage(value)
  expect(() => draftQueueFinish({ ...quote(queued), attemptId: randomUUID(), outcome: 'accepted' })).toThrow('Invalid')
  expect(() => draftQueueFinish({ ...quote(queued), attemptId: randomUUID(), outcome: 'unknown', accepted: { runtimeSessionId: 'x', storedSessionId: null } })).toThrow('Invalid')
  await value.custody.beginArchive(owner)
  await expect(value.queue.begin({ ...quote(queued), attemptId: randomUUID() })).rejects.toThrow('custody_lifecycle')
})
