import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createDraftCustody } from './draft-custody'

let root = ''
const address = { owner: { connectionId: 'local', profile: 'default' }, session: '__new__:actual-draft-key' }
const image = { id: 'one', occurrenceId: 'one-occurrence', kind: 'image' as const, label: 'one.png', imageData: { mime: 'image/png', dataBase64: 'AAECAwQ=' } }
const fixture = async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'vanta-custody-send-'))
  const custody = createDraftCustody({ root, profileIsActive: async () => true })
  const opened = await custody.open(address)
  if (opened.status !== 'ready') throw new Error('Fixture not ready')
  const snapshot = await custody.write({ address, lease: opened.snapshot.lease, expectedRevision: null, attachments: [image] })
  const ticket = { address, lease: snapshot.lease, revision: snapshot.revision, id: randomUUID(), attachmentIds: [image.occurrenceId], text: 'Unsent fixture text' }
  return { custody, snapshot, ticket }
}
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }) })

it('pins durable submitted bytes before UI clear; acknowledgment consumes only those occurrences', async () => {
  const { custody, snapshot, ticket } = await fixture()
  await custody.beginSend(ticket)
  await expect(custody.write({ address, lease: snapshot.lease, expectedRevision: snapshot.revision, attachments: [] })).rejects.toThrow('custody_pending_send')
  await expect(custody.finishSend(ticket, 'restore')).rejects.toThrow('still running')
  const second = { ...image, id: 'two', occurrenceId: 'two-occurrence', label: 'two.png' }
  await custody.write({ address, lease: snapshot.lease, expectedRevision: snapshot.revision, attachments: [image, second] })
  const accepted = await custody.finishSend(ticket, 'accepted')
  expect(accepted.attachments).toEqual([second])
  expect(accepted.pendingSend).toBeUndefined()
  expect(JSON.stringify(ticket)).not.toContain(image.imageData.dataBase64)
})

it('cold restart retains an interrupted-send checkpoint and restores only on an explicit private action', async () => {
  const { custody, ticket } = await fixture()
  await custody.beginSend(ticket)
  const restarted = createDraftCustody({ root, profileIsActive: async () => true })
  expect(await restarted.open(address)).toMatchObject({ status: 'ready', snapshot: { pendingSend: { id: ticket.id }, attachments: [image] } })
  const restored = await restarted.finishSend(ticket, 'restore')
  expect(restored.attachments).toEqual([image])
  expect(restored.pendingSend).toBeUndefined()
})

it('rejects a stale actual address and never clears another fresh draft on late outcome', async () => {
  const { custody, ticket } = await fixture()
  await custody.beginSend(ticket)
  const other = { ...address, session: '__new__:later-draft-key' }
  const opened = await custody.open(other)
  if (opened.status !== 'ready') throw new Error('Fixture not ready')
  const saved = await custody.write({ address: other, lease: opened.snapshot.lease, expectedRevision: null, attachments: [image] })
  await expect(custody.finishSend({ ...ticket, address: other }, 'accepted')).rejects.toThrow('checkpoint changed')
  await custody.finishSend(ticket, 'accepted')
  expect(await custody.read(other, saved.lease)).toEqual(saved)
})
