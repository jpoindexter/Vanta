import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createDraftCustody } from '../../electron/vanta/draft-custody'
import { DraftCustodyClient, type DraftCustodyApi } from './draft-custody-client'

const roots: string[] = []
const address = { owner: { connectionId: 'local', profile: 'default' }, session: 'same-id' }
const a = { id: 'a', occurrenceId: 'occ-a', kind: 'image' as const, label: 'a.png', imageData: { mime: 'image/png', dataBase64: 'AAECAwQ=' } }
const b = { ...a, id: 'b', occurrenceId: 'occ-b', label: 'b.png' }
const fixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vanta-custody-client-')); roots.push(root)
  const native = createDraftCustody({ root, profileIsActive: async () => true })
  const queue = native.queue
  const api: DraftCustodyApi = { queue, assignSend: (ticket, session) => native.assignSend(ticket, session), open: vi.fn(value => native.open(value)), read: (value, lease) => native.read(value, lease), write: value => native.write(value), move: value => native.move(value), recover: (value, lease) => native.recover(value, lease), beginSend: vi.fn(ticket => native.beginSend(ticket)), finishSend: (ticket, outcome) => native.finishSend(ticket, outcome) }
  return { native, api: Object.assign(api, { queue }), root }
}
const ready = (client: DraftCustodyClient) => expect.poll(() => client.$view.get().phase).toBe('ready')
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

it('holds writes/send while hydration is pending, then preserves saved A and newly dropped B', async () => {
  const { native, api } = await fixture(), original = await native.open(address)
  if (original.status !== 'ready') throw new Error('Fixture not ready')
  await native.write({ address, lease: original.snapshot.lease, expectedRevision: null, attachments: [a] })
  const saved = await native.open(address)
  let release!: (value: Awaited<ReturnType<DraftCustodyApi['open']>>) => void
  vi.mocked(api.open).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  const client = new DraftCustodyClient(address, api), starting = client.start()
  client.update([b])
  expect(client.canConsume()).toBe(false)
  expect(client.reserve([b], 'new text')).toBeNull()
  expect(api.beginSend).not.toHaveBeenCalled()
  expect((await native.read(address, original.snapshot.lease)).attachments.map(item => item.id)).toEqual(['a'])
  release(saved)
  await starting
  await ready(client)
  expect(client.$attachments.get().map(item => item.id)).toEqual(['a', 'b'])
  expect((await native.read(address, original.snapshot.lease)).attachments.map(item => item.id)).toEqual(['a', 'b'])
})

it('never clobbers concurrent HUD bytes; explicit recovery applies local removals without dropping new remote additions', async () => {
  const { native, api } = await fixture(), first = new DraftCustodyClient(address, api), hud = new DraftCustodyClient(address, api)
  await first.start(); await hud.start()
  first.update([a]); await ready(first)
  hud.update([b])
  await expect.poll(() => hud.$view.get().phase).toBe('conflict')
  expect(first.snapshot()?.attachments.map(item => item.id)).toEqual(['a'])
  expect(hud.$attachments.get().map(item => item.id)).toEqual(['b'])
  await hud.retry(); await ready(hud)
  expect(hud.snapshot()?.attachments.map(item => item.id)).toEqual(['a', 'b'])
  first.update([])
  await expect.poll(() => first.$view.get().phase).toBe('conflict')
  await first.retry(); await ready(first)
  expect((await native.read(address, first.snapshot()!.lease)).attachments.map(item => item.id)).toEqual(['b'])
})

it('pins before UI clear and consumes only acknowledged submitted occurrences, retaining newly typed work', async () => {
  const { api, native } = await fixture(), client = new DraftCustodyClient(address, api)
  await client.start(); client.update([a]); await ready(client)
  const reservation = client.reserve([a], 'exact submitted text')!
  client.update([])
  expect((await native.read(address, client.snapshot()!.lease)).attachments).toEqual([a])
  expect(await client.begin(reservation)).toBe(true)
  client.update([b]); await client.flush()
  await client.finish(reservation, 'accepted')
  await ready(client)
  expect(client.$attachments.get().map(item => item.id)).toEqual(['b'])
  expect((await native.read(address, client.snapshot()!.lease)).attachments.map(item => item.id)).toEqual(['b'])
})

it('preserves unknown-send bytes/text over restart and never sends automatically after explicit restore', async () => {
  const { api } = await fixture(), client = new DraftCustodyClient(address, api)
  await client.start(); client.update([a]); await ready(client)
  const reservation = client.reserve([a], 'exact interrupted text')!
  client.update([]); await client.begin(reservation); await client.finish(reservation, 'unknown')
  expect(client.canConsume()).toBe(false)
  const cold = new DraftCustodyClient(address, api)
  await cold.start()
  expect(cold.$view.get().phase).toBe('interrupted')
  expect(cold.canConsume()).toBe(false)
  await cold.retry()
  expect(cold.$attachments.get()[0].imageData).toEqual(a.imageData)
  expect(cold.$restoredText.get()).toBe('exact interrupted text')
  expect(api.beginSend).toHaveBeenCalledTimes(1)
})

it('a stale retry retains its captured generation and cannot reopen archived profile custody', async () => {
  const { native, api } = await fixture(), client = new DraftCustodyClient(address, api)
  await client.start(); client.update([a]); await ready(client)
  const pending = await native.beginArchive(address.owner)
  await native.finishArchive(pending, 'retired')
  client.update([b])
  await expect.poll(() => client.$view.get().phase).toBe('pending-profile')
  await client.retry()
  expect(client.canConsume()).toBe(false)
  expect(api.open).toHaveBeenCalledTimes(1)
  expect(client.$attachments.get()[0].id).toBe('b')
})
