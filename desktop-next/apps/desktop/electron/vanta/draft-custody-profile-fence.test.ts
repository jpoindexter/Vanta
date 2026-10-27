import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { VantaTransport } from '../../../shared/src/vanta'
import { createDraftCustody } from './draft-custody'
import { createProfileCustodyFence } from './draft-custody-profile-fence'
import { createRequestBridge } from './request-bridge'

let root = ''
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }) })
it.each([false, true])('fences exact stable ID before one archive call; unknown=%s never retries mutation', async unknown => {
  root = await mkdtemp(path.join(os.tmpdir(), 'vanta-custody-fence-'))
  let live = true
  const custody = createDraftCustody({ root, profileIsActive: async id => id === 'foo' && live })
  const ready = await custody.open({ owner: { connectionId: 'local', profile: 'foo' }, session: 'draft' })
  if (ready.status !== 'ready') throw new Error('Fixture not ready')
  const send: VantaTransport['request'] = vi.fn(async call => {
    if (call.method === 'GET') return { ok: true, status: 200, data: { profiles: live ? [{ id: 'foo', name: 'New display label' }] : [] } }
    await expect(custody.write({ address: ready.snapshot.address, lease: ready.snapshot.lease, expectedRevision: null, attachments: [] })).rejects.toThrow('custody_lifecycle')
    live = false
    if (unknown) throw new Error('Response reset after archive')
    return { ok: true, status: 200, data: { archived: true, name: 'New display label' } }
  })
  const fence = createProfileCustodyFence(custody, send)
  const bridge = createRequestBridge({ request: send, openEvents: vi.fn() }, { closed: 'closed', frame: 'frame' }, fence)
  const result = bridge.request({ method: 'POST', path: '/api/profiles/delete', body: { name: 'New display label' } })
  if (unknown) await expect(result).rejects.toThrow('Response reset')
  else expect((await result).ok).toBe(true)
  expect(vi.mocked(send).mock.calls.filter(([call]) => call.method === 'POST')).toHaveLength(1)
  expect(await custody.open(ready.snapshot.address)).toMatchObject({ status: unknown ? 'pending' : 'retired', lease: ready.snapshot.lease })
  if (unknown) await expect(custody.recover(ready.snapshot.address, ready.snapshot.lease)).rejects.toThrow('custody_lifecycle')
  expect(vi.mocked(send).mock.calls.filter(([call]) => call.method === 'POST')).toHaveLength(1)
})

it('passes display-only rename without relocating or retiring stable-ID custody', async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'vanta-custody-rename-'))
  const custody = createDraftCustody({ root, profileIsActive: async id => id === 'foo' })
  const address = { owner: { connectionId: 'local', profile: 'foo' }, session: 'draft' }
  const before = await custody.open(address)
  const send = vi.fn(async () => ({ ok: true, status: 200, data: { id: 'foo', name: 'Bar' } }))
  expect((await createProfileCustodyFence(custody, send)({ method: 'POST', path: '/api/profiles/rename', body: { name: 'foo', newName: 'Bar' } })).data).toMatchObject({ id: 'foo' })
  expect(await custody.open(address)).toEqual(before)
  expect(send).toHaveBeenCalledTimes(1)
})

it('refuses recovery while the actual archive request awaits, then retires on acknowledgment', async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'vanta-custody-inflight-'))
  const custody = createDraftCustody({ root, profileIsActive: async () => true })
  const address = { owner: { connectionId: 'local', profile: 'foo' }, session: 'draft' }
  const opened = await custody.open(address)
  if (opened.status !== 'ready') throw new Error('Fixture not ready')
  let acknowledge!: (value: { ok: boolean; status: number; data: { archived: boolean } }) => void
  let began!: () => void
  const started = new Promise<void>(resolve => { began = resolve })
  const send: VantaTransport['request'] = async call => {
    if (call.method === 'GET') return { ok: true, status: 200, data: { profiles: [{ id: 'foo', name: 'Foo' }] } }
    began()
    return new Promise(resolve => { acknowledge = resolve })
  }
  const request = createProfileCustodyFence(custody, send)({ method: 'POST', path: '/api/profiles/delete', body: { name: 'foo' } })
  await started
  await expect(custody.recover(address, opened.snapshot.lease)).rejects.toThrow('still running')
  await expect(custody.write({ address, lease: opened.snapshot.lease, expectedRevision: null, attachments: [] })).rejects.toThrow('custody_lifecycle')
  acknowledge({ ok: true, status: 200, data: { archived: true } })
  expect((await request).ok).toBe(true)
  expect(await custody.open(address)).toMatchObject({ status: 'retired' })
})
