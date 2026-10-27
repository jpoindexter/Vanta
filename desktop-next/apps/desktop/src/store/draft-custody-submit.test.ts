import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createDraftCustody } from '../../electron/vanta/draft-custody'
import { DraftCustodyClient, type DraftCustodyApi } from './draft-custody-client'
import { runCustodiedSubmit } from './draft-custody-submit'

const roots: string[] = []
const address = { owner: { connectionId: 'local', profile: 'default' }, session: '__new__:original' }
const image = { id: 'image', occurrenceId: 'image-occurrence', kind: 'image' as const, label: 'image.png', imageData: { mime: 'image/png', dataBase64: 'AAECAwQ=' } }
const fixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vanta-custody-submit-')); roots.push(root)
  const native = createDraftCustody({ root, profileIsActive: async () => true })
  const api: DraftCustodyApi = { queue: native.queue, assignSend: (ticket, session) => native.assignSend(ticket, session), open: value => native.open(value), read: (value, lease) => native.read(value, lease), write: value => native.write(value), move: value => native.move(value), recover: (value, lease) => native.recover(value, lease), beginSend: value => native.beginSend(value), finishSend: (value, outcome) => native.finishSend(value, outcome) }
  const client = new DraftCustodyClient(address, api)
  await client.start(); client.update([image]); await client.flush()
  return { native, api, client }
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

it('retains a real acknowledgment despite later cleanup throw and never repeats the submission', async () => {
  const { client, native } = await fixture(), reservation = client.reserve([image], 'original text')!
  let attempts = 0
  expect(await runCustodiedSubmit(reservation, (_attachments, callbacks) => {
    attempts++; callbacks.onDispatchStarted?.(); callbacks.onAccepted?.({ runtimeSessionId: 'runtime', storedSessionId: 'stored' })
    throw new Error('local cleanup failed')
  })).toBe('accepted')
  expect(attempts).toBe(1)
  expect((await native.read(address, client.snapshot()!.lease)).attachments).toEqual([])
  expect(client.$attachments.get()).toEqual([])
})

it('keeps an unacknowledged invoked send unknown over cold restart without another attempt', async () => {
  const { client, api } = await fixture(), reservation = client.reserve([image], 'unknown text')!
  let attempts = 0
  expect(await runCustodiedSubmit(reservation, (_attachments, callbacks) => {
    attempts++; callbacks.onDispatchStarted?.(); throw new Error('transport reset')
  })).toBe('unknown')
  const cold = new DraftCustodyClient(address, api); await cold.start()
  expect(cold.canConsume()).toBe(false)
  expect(cold.snapshot()?.pendingSend?.text).toBe('unknown text')
  expect(cold.$attachments.get()[0].imageData).toEqual(image.imageData)
  expect(attempts).toBe(1)
})

it('retains rejected original text until explicit restore, without overwriting a newly typed draft', async () => {
  const { client, api } = await fixture(), reservation = client.reserve([image], 'rejected text')!
  expect(await runCustodiedSubmit(reservation, () => false)).toBe('rejected')
  const cold = new DraftCustodyClient(address, api); await cold.start()
  expect(cold.snapshot()?.pendingSend?.rejected).toBe(true)
  await cold.retry(false)
  expect(cold.$restoredText.get()).toBeNull()
  expect(cold.snapshot()?.pendingSend?.text).toBe('rejected text')
  await cold.retry(true)
  expect(cold.$restoredText.get()).toBe('rejected text')
  expect(cold.canConsume()).toBe(true)
})
