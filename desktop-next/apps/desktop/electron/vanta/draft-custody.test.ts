import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import type { DraftSnapshot } from '../../../shared/src/vanta/draft-custody-protocol'
import { createDraftCustody, type DraftCustody } from './draft-custody'

const roots: string[] = []
const owner = { connectionId: 'local', profile: 'foo' }
const address = { owner, session: 'same-id' }
const image = { id: 'one', occurrenceId: 'occurrence-one', kind: 'image' as const, label: 'one.png', imageData: { mime: 'image/png', dataBase64: 'AAECAwQ=' } }
const fixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vanta-custody-v2-')); roots.push(root)
  const active = new Set(['foo', 'default', 'worker'])
  return { root, active, custody: createDraftCustody({ root, profileIsActive: async id => active.has(id) }) }
}
const open = async (custody: DraftCustody, target = address): Promise<DraftSnapshot> => {
  const result = await custody.open(target)
  if (result.status !== 'ready') throw new Error('Fixture was not ready')
  return result.snapshot
}
const write = (custody: DraftCustody, base: DraftSnapshot, attachments = [image]) => custody.write({ address: base.address, lease: base.lease, expectedRevision: base.revision, attachments })
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

it('preserves exact image bytes and generation across restart, isolated by owner and session', async () => {
  const { root, active, custody } = await fixture(), initial = await open(custody)
  const saved = await write(custody, initial)
  const reopened = createDraftCustody({ root, profileIsActive: async id => active.has(id) })
  expect(await reopened.read(address, saved.lease)).toEqual(saved)
  expect((await open(reopened)).lease).toEqual(saved.lease)
  expect((await open(reopened, { owner: { ...owner, profile: 'worker' }, session: address.session })).attachments).toEqual([])
  await expect(reopened.open({ owner: { ...owner, connectionId: 'remote' }, session: address.session })).rejects.toThrow('custody_unsupported')
  const file = (await readdir(root)).find(name => name.endsWith('.draft.json'))!
  expect((await stat(path.join(root, file))).mode & 0o777).toBe(0o600)
})

it('rejects stale HUD replacement and stale clear; current saved bytes remain exact', async () => {
  const { custody } = await fixture(), initial = await open(custody)
  const first = await write(custody, initial), hud = await open(custody)
  const next = await write(custody, first, [image, { ...image, id: 'two', occurrenceId: 'occurrence-two', label: 'two.png' }])
  await expect(write(custody, hud, [])).rejects.toThrow('custody_conflict')
  expect(await custody.read(address, next.lease)).toEqual(next)
  await write(custody, next, [])
  await expect(write(custody, next)).rejects.toThrow('custody_conflict')
  expect((await custody.read(address, next.lease)).attachments).toEqual([])
})

it('persists a fresh empty revision so a stale null snapshot cannot pass after add then clear', async () => {
  const { root, active, custody } = await fixture(), staleEmpty = await open(custody)
  const populated = await write(custody, staleEmpty)
  const cleared = await write(custody, populated, [])
  expect(cleared.revision).not.toBeNull()
  await expect(write(custody, staleEmpty)).rejects.toThrow('custody_conflict')
  const restarted = createDraftCustody({ root, profileIsActive: async id => active.has(id) })
  await expect(write(restarted, staleEmpty)).rejects.toThrow('custody_conflict')
  expect((await restarted.read(address, cleared.lease)).attachments).toEqual([])
})

it('fences all captured writes before archive and across restart without deleting saved bytes', async () => {
  const { root, active, custody } = await fixture(), saved = await write(custody, await open(custody))
  const file = path.join(root, (await readdir(root)).find(name => name.endsWith('.draft.json'))!), bytes = await readFile(file)
  const pending = await custody.beginArchive(owner)
  await expect(write(custody, saved, [])).rejects.toThrow('custody_lifecycle')
  const restarted = createDraftCustody({ root, profileIsActive: async id => active.has(id) })
  expect(await restarted.open(address)).toMatchObject({ status: 'pending', lease: saved.lease })
  active.delete('foo')
  await restarted.finishArchive(pending, 'retired')
  await expect(write(restarted, saved)).rejects.toThrow('custody_lifecycle')
  await expect(restarted.read(address, saved.lease)).rejects.toThrow('custody_lifecycle')
  expect(await restarted.open(address)).toMatchObject({ status: 'retired', lease: saved.lease })
  expect(await readFile(file)).toEqual(bytes)
})

it('recovers an ambiguous archive only through an explicit read with the captured generation', async () => {
  const { custody } = await fixture(), saved = await write(custody, await open(custody))
  const pending = await custody.beginArchive(owner)
  await expect(custody.recover(address, saved.lease)).rejects.toThrow('still running')
  await expect(custody.recover(address, { owner, generation: randomUUID() })).rejects.toThrow('cannot be refreshed')
  // A settled unknown response (not an in-flight request) permits explicit read recovery.
  const pendingState = await custody.open(address)
  expect(pendingState.status).toBe('pending')
  await custody.finishArchive(pending, 'unknown')
  expect(await custody.recover(address, saved.lease)).toEqual(saved)
  expect((await write(custody, saved)).attachments).toEqual([image])
})

it('retains source and disk-only destination on collision; move alone owns source deletion', async () => {
  const { custody } = await fixture(), source = await write(custody, await open(custody))
  const targetAddress = { owner, session: 'root' }, empty = await open(custody, targetAddress)
  const target = await write(custody, empty, [{ ...image, id: 'two', label: 'two.png' }])
  await expect(custody.move({ from: source, to: empty })).rejects.toThrow('both saved copies retained')
  expect(await custody.read(address, source.lease)).toEqual(source)
  expect(await custody.read(targetAddress, target.lease)).toEqual(target)
})

it.each([5, 10])('round-trips an allowed %i MiB image without regex stack overflow', async mib => {
  const { custody } = await fixture(), initial = await open(custody)
  const dataBase64 = Buffer.alloc(mib * 1024 * 1024, 3).toString('base64')
  const saved = await write(custody, initial, [{ ...image, imageData: { mime: 'image/png', dataBase64 } }])
  expect((await custody.read(address, saved.lease)).attachments[0].imageData?.dataBase64).toBe(dataBase64)
})
