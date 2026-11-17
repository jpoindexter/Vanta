import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createDraftCustody, type DraftCustody } from './draft-custody'
import type { DraftSnapshot } from '../../../shared/src/vanta/draft-custody-protocol'

const roots: string[] = []
const owner = { connectionId: 'local', profile: 'default' }, address = { owner, session: 'draft' }
const image = { id: 'one', occurrenceId: 'one', kind: 'image' as const, label: 'one.png', imageData: { mime: 'image/png', dataBase64: 'AAECAwQ=' } }
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(profileIsActive = async (_id: string) => true) {
  const root = await mkdtemp(path.join(tmpdir(), 'vanta-update-custody-')); roots.push(root)
  return { root, custody: createDraftCustody({ root, profileIsActive }) }
}
async function open(custody: DraftCustody): Promise<DraftSnapshot> {
  const value = await custody.open(address)
  if (value.status !== 'ready') throw new Error('not ready')
  return value.snapshot
}
const write = (custody: DraftCustody, saved: DraftSnapshot) => custody.write({ address, lease: saved.lease, expectedRevision: saved.revision, attachments: [image] })

it('permits safely persisted ready drafts, blocks new custody operations and keeps bytes until exact cancellation', async () => {
  const h = await fixture(), saved = await write(h.custody, await open(h.custody))
  const file = path.join(h.root, (await readdir(h.root)).find(name => name.endsWith('.draft.json'))!), before = await readFile(file)
  const lease = await h.custody.prepareUpdate()
  await expect(write(h.custody, saved)).rejects.toThrow('update')
  await expect(h.custody.cancelUpdate('stale')).rejects.toThrow('lease')
  expect(await readFile(file)).toEqual(before)
  await h.custody.cancelUpdate(lease)
  expect(await h.custody.read(address, saved.lease)).toEqual(saved)
})

it.each(['queued', 'staging', 'sending', 'unknown'] as const)('blocks persisted %s queue checkpoints without recovering or rewriting them', async status => {
  const h = await fixture(), saved = await write(h.custody, await open(h.custody))
  const queued = await h.custody.queue.stage({ address: { ...address, entryId: 'entry' }, source: saved, entry: { id: 'entry', text: 'research', queuedAt: 1, attachments: [image] }, sourceTextScope: 'fixture', sourceTextRevision: randomUUID() })
  const file = path.join(h.root, (await readdir(h.root)).find(name => name.endsWith('.queue.json'))!)
  await writeFile(file, JSON.stringify({ ...queued, status, ...(['sending', 'unknown'].includes(status) ? { attemptId: randomUUID() } : {}) }))
  const before = await readFile(file)
  await expect(h.custody.prepareUpdate()).rejects.toThrow('queue')
  expect(await readFile(file)).toEqual(before)
  await expect(h.custody.open(address)).resolves.toBeDefined()
})

it('blocks unknown send and archive outcomes even when no request is currently in flight', async () => {
  const h = await fixture(), saved = await write(h.custody, await open(h.custody))
  const ticket = await h.custody.beginSend({ address, lease: saved.lease, revision: saved.revision, id: randomUUID(), attachmentIds: ['one'], text: 'never resend' })
  await h.custody.finishSend(ticket, 'unknown')
  await expect(h.custody.prepareUpdate()).rejects.toThrow('submission')
  const other = await fixture(), pending = await other.custody.beginArchive(owner)
  await other.custody.finishArchive(pending, 'unknown')
  await expect(other.custody.prepareUpdate()).rejects.toThrow('archive')
})

it('drains admitted writes before acknowledging readiness and denies new writes while draining', async () => {
  let started!: () => void, finish!: () => void
  const entered = new Promise<void>(resolve => { started = resolve }), waiting = new Promise<void>(resolve => { finish = resolve })
  const h = await fixture(async () => { started(); await waiting; return true })
  const pending = h.custody.open(address)
  await entered
  const preparation = h.custody.prepareUpdate()
  const denied = h.custody.open({ owner, session: 'later' })
  finish()
  await expect(denied).rejects.toThrow('update')
  await pending
  await expect(preparation).resolves.toEqual(expect.any(String))
})

it.each(['accepted', 'removed'] as const)('allows terminal %s queue evidence and retains its ledger', async outcome => {
  const h = await fixture(), saved = await write(h.custody, await open(h.custody))
  const queued = await h.custody.queue.stage({ address: { ...address, entryId: 'entry' }, source: saved, entry: { id: 'entry', text: 'research', queuedAt: 1, attachments: [image] }, sourceTextScope: 'fixture', sourceTextRevision: randomUUID() })
  if (outcome === 'removed') await h.custody.queue.remove(queued)
  else {
    const sending = await h.custody.queue.begin({ ...queued, attemptId: randomUUID() })
    await h.custody.queue.finish({ ...sending, attemptId: sending.attemptId!, outcome: 'accepted', accepted: { runtimeSessionId: 'runtime', storedSessionId: 'saved' } })
  }
  const file = path.join(h.root, (await readdir(h.root)).find(name => name.endsWith('.queue.json'))!), before = await readFile(file)
  await expect(h.custody.prepareUpdate()).resolves.toEqual(expect.any(String))
  expect(await readFile(file)).toEqual(before)
})

it('fails closed on corrupt custody evidence without leaving a failed preparation sealed', async () => {
  const h = await fixture()
  await open(h.custody)
  const file = path.join(h.root, (await readdir(h.root)).find(name => name.endsWith('.owner.json'))!), before = await readFile(file)
  await writeFile(file, 'corrupt')
  await expect(h.custody.prepareUpdate()).rejects.toThrow()
  expect(await readFile(file, 'utf8')).toBe('corrupt')
  await writeFile(file, before)
  await expect(h.custody.open(address)).resolves.toMatchObject({ status: 'ready' })
  await expect(h.custody.prepareUpdate()).resolves.toEqual(expect.any(String))
})
