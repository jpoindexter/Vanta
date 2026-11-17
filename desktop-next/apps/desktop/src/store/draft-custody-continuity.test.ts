import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createDraftCustody } from '../../electron/vanta/draft-custody'
import { DraftCustodyClient, type DraftCustodyApi } from './draft-custody-client'
import { consumeSessionDraftText, currentDraftTextRevision, noteDraftTextEdit, quoteSessionDraftText, reloadPersistedDrafts, stashSessionDraft, takeSessionDraft } from './composer'
import { runCustodiedSubmit } from './draft-custody-submit'
import { DRAFT_TEXT_STORAGE_KEY, LEGACY_DRAFT_TEXT_STORAGE_KEY, loadDraftTextRecords, saveDraftTextRecords } from './draft-text-storage'

const roots: string[] = []
const owner = { connectionId: 'local', profile: 'default' }
const address = { owner, session: '__new__:continuity-fixture' }
const image = { id: 'a', occurrenceId: 'occ-a', kind: 'image' as const, label: 'a.png', imageData: { mime: 'image/png', dataBase64: 'AAECAwQ=' } }
const second = { ...image, id: 'b', occurrenceId: 'occ-b', label: 'b.png' }
const fixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vanta-custody-continuity-')); roots.push(root)
  const restart = () => createDraftCustody({ root, profileIsActive: async () => true })
  const native = restart()
  const apiFor = (native: ReturnType<typeof restart>): DraftCustodyApi => ({ queue: native.queue, open: value => native.open(value), read: (value, lease) => native.read(value, lease), write: value => native.write(value), move: value => native.move(value), recover: (value, lease) => native.recover(value, lease), beginSend: value => native.beginSend(value), assignSend: (value, session) => native.assignSend(value, session), finishSend: (value, outcome) => native.finishSend(value, outcome) })
  const api = apiFor(native), client = new DraftCustodyClient(address, api)
  await client.start(); client.update([image]); await client.flush()
  return { native, client, api, restart, apiFor }
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  window.localStorage.removeItem(DRAFT_TEXT_STORAGE_KEY); window.localStorage.removeItem(LEGACY_DRAFT_TEXT_STORAGE_KEY)
  reloadPersistedDrafts()
})

it('recovers native queue once after transfer-before-renderer-clear and suppresses only its exact text revision', async () => {
  const { client, restart, apiFor } = await fixture()
  stashSessionDraft(address.session, 'same words', [image])
  const quote = quoteSessionDraftText(address.session)!
  const entry = { id: 'existing-queue-entry', queuedAt: 1, text: 'same words', attachments: [image] }
  const saved = await client.stageQueue({ ...address, entryId: entry.id }, entry, quote)
  expect(saved?.status).toBe('queued') // Deliberately do NOT clear the original localStorage text.
  const coldNative = restart(), cold = new DraftCustodyClient(address, apiFor(coldNative))
  await cold.start(); reloadPersistedDrafts()
  expect(cold.$attachments.get()).toEqual([])
  expect((await coldNative.queue.list(address, cold.snapshot()!.lease)).map(item => item.entry.id)).toEqual([entry.id])
  expect(cold.snapshot()?.consumedText).toContainEqual(quote)
  expect(consumeSessionDraftText(quote)).toBe(true)
  expect(takeSessionDraft(address.session).text).toBe('')
  noteDraftTextEdit(address.session, ''); noteDraftTextEdit(address.session, 'same words')
  stashSessionDraft(address.session, 'same words', [])
  expect(currentDraftTextRevision(address.session)).not.toBe(quote.revision)
  expect(consumeSessionDraftText(quote)).toBe(false)
  expect(takeSessionDraft(address.session).text).toBe('same words')
})

it('keeps a durable exact first-create recovery over cold restart; collision preserves both, then explicit restore succeeds', async () => {
  const { client, restart, apiFor } = await fixture()
  const reservation = client.reserve([image], 'original rejected text')!
  const targetAddress = { owner, session: 'actual-assigned-session' }
  await runCustodiedSubmit(reservation, () => { client.assign(reservation, targetAddress.session); return false })
  const coldNative = restart(), api = apiFor(coldNative), target = new DraftCustodyClient(targetAddress, api)
  await target.start()
  expect(target.snapshot()?.recoveries).toEqual([address])
  const source = new DraftCustodyClient(address, api)
  await source.hydrateCaptured(target.snapshot()!.lease)
  target.$recoverySource.set(source)
  target.update([second]); await target.flush()
  const beforeSource = await coldNative.read(address, source.snapshot()!.lease)
  const beforeTarget = await coldNative.read(targetAddress, target.snapshot()!.lease)
  await target.retry(true)
  expect(await coldNative.read(address, source.snapshot()!.lease)).toEqual(beforeSource)
  expect(await coldNative.read(targetAddress, target.snapshot()!.lease)).toEqual(beforeTarget)
  expect(target.$recoverySource.get()).toBe(source)
  target.update([]); await target.flush() // Actual normal remove path remains usable after collision.
  await target.retry(true)
  expect(target.$attachments.get()[0].imageData).toEqual(image.imageData)
  expect(target.$restoredText.get()).toBe('original rejected text')
  expect(target.canConsume()).toBe(true)
  expect((await coldNative.read(address, source.snapshot()!.lease)).attachments).toEqual([])
})

it('separates same-ID owners and keeps later unsent bytes after the first fresh send was acknowledged', async () => {
  const { client, native, api } = await fixture()
  const otherAddress = { owner: { connectionId: 'local', profile: 'other' }, session: address.session }
  const other = new DraftCustodyClient(otherAddress, api)
  await other.start(); other.update([second]); await other.flush()
  const reservation = client.reserve([image], 'accepted text')!
  expect(await runCustodiedSubmit(reservation, (_attachments, callbacks) => {
    client.assign(reservation, 'assigned-session')
    client.update([second])
    callbacks.onDispatchStarted?.(); callbacks.onAccepted?.({ runtimeSessionId: 'runtime', storedSessionId: 'assigned-session' })
  })).toBe('accepted')
  expect((await native.read(otherAddress, other.snapshot()!.lease)).attachments).toEqual([second])
  expect(client.snapshot()?.attachments).toEqual([second])
  expect(client.snapshot()?.pendingSend?.handoff).toBe(true)
  await expect(native.finishSend(reservation.ticket!, 'accepted')).rejects.toThrow('checkpoint changed')
})

it('backward-reads legacy text, retains corrupt v4 bytes, and keeps text+nonce in a single record', () => {
  window.localStorage.removeItem(DRAFT_TEXT_STORAGE_KEY)
  window.localStorage.setItem(LEGACY_DRAFT_TEXT_STORAGE_KEY, JSON.stringify({ old: 'preserved legacy words' }))
  const legacy = loadDraftTextRecords()!
  expect(legacy.get('old')?.text).toBe('preserved legacy words')
  expect(saveDraftTextRecords(legacy)).toBe(true)
  expect(loadDraftTextRecords()?.get('old')).toEqual(legacy.get('old'))
  window.localStorage.setItem(DRAFT_TEXT_STORAGE_KEY, '{broken')
  expect(saveDraftTextRecords(new Map())).toBe(false)
  expect(window.localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)).toBe('{broken')
})
