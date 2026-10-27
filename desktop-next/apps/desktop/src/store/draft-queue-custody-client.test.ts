import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import type { DraftQueueApi, DraftQueueEnvelope } from '../../../shared/src/vanta/draft-queue-custody'
import { DraftQueueCustodyClient } from './draft-queue-custody-client'

const owner = { connectionId: 'local', profile: 'foo' }
const address = { owner, session: 'root', entryId: 'queued-existing-id' }
const queued = (): DraftQueueEnvelope => ({ version: 1, address, lease: { owner, generation: randomUUID() }, revision: randomUUID(), status: 'queued',
  origin: { address: { owner, session: 'draft' }, revision: null, hashes: [], sourceTextRevision: randomUUID(), sourceTextScope: 'draft' },
  entry: { id: address.entryId, text: 'Exact queued prompt', queuedAt: 1, attachments: [{ id: 'image', kind: 'image', label: 'A', imageData: { mime: 'image/png', dataBase64: 'AQ==' } }] } })
function fixture() {
  let current = queued()
  const api: DraftQueueApi = {
    stage: vi.fn(async () => current), list: vi.fn(async () => [current]), read: vi.fn(async () => current),
    update: vi.fn(async request => current = { ...current, entry: request.entry, revision: randomUUID() }),
    begin: vi.fn(async request => current = { ...current, status: 'sending', attemptId: request.attemptId, revision: randomUUID() }),
    finish: vi.fn(async request => current = { ...current, status: request.outcome === 'rejected' ? 'queued' : request.outcome, ...(request.accepted ? { accepted: request.accepted } : {}), revision: randomUUID() }),
    remove: vi.fn(async () => current = { ...current, status: 'removed', revision: randomUUID() })
  }
  const project = vi.fn(), client = new DraftQueueCustodyClient(api, project)
  return { api, client, project, current: () => current }
}

it('acceptance wins over a later false return or thrown cleanup and quotes the actual recovered identity', async () => {
  for (const throws of [false, true]) {
    const value = fixture(), identity = { runtimeSessionId: 'recovered-runtime', storedSessionId: 'stored-tip' }
    const result = await value.client.dispatch(value.current(), async callbacks => {
      callbacks.onDispatchStarted(); callbacks.onAccepted(identity)
      if (throws) throw new Error('local cleanup failed')
      return false
    })
    expect(result.status).toBe('accepted')
    expect(value.api.finish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outcome: 'accepted', accepted: identity }))
    expect(value.api.remove).not.toHaveBeenCalled()
    expect(value.project).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'accepted' }))
  }
})

it('post-invocation rejection or timeout stays unknown and is never retried', async () => {
  const value = fixture(), submit = vi.fn(async callbacks => { callbacks.onDispatchStarted(); throw new Error('socket reset') })
  const result = await value.client.dispatch(value.current(), submit)
  expect(result.status).toBe('unknown')
  expect(submit).toHaveBeenCalledTimes(1)
  expect(value.api.finish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outcome: 'unknown' }))
  expect(value.api.remove).not.toHaveBeenCalled()
})

it('blocks an inner stale-session/timeout retry before its second provider invocation', async () => {
  const value = fixture()
  let providerCalls = 0
  const result = await value.client.dispatch(value.current(), async callbacks => {
    callbacks.onDispatchStarted(); providerCalls++
    // Existing submit recovery may request a second attempt after an ambiguous timeout.
    callbacks.onDispatchStarted(); providerCalls++
    return true
  })
  expect(providerCalls).toBe(1)
  expect(result.status).toBe('unknown')
})

it('a known pre-dispatch refusal retains the queued payload without treating a boolean as acceptance', async () => {
  const value = fixture()
  const result = await value.client.dispatch(value.current(), async () => false)
  expect(result.status).toBe('rejected')
  expect(result.envelope.entry.attachments).toEqual(value.current().entry.attachments)
  expect(value.api.finish).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outcome: 'rejected' }))
})

it('does not dispatch when the native begin checkpoint fails', async () => {
  const value = fixture(), submit = vi.fn()
  vi.mocked(value.api.begin).mockRejectedValueOnce(new Error('stale revision'))
  await expect(value.client.dispatch(value.current(), submit)).rejects.toThrow('stale revision')
  expect(submit).not.toHaveBeenCalled()
  expect(value.project).not.toHaveBeenCalled()
})

it('never publishes accepted/removal when durable finish fails after provider acceptance', async () => {
  const value = fixture()
  vi.mocked(value.api.finish).mockRejectedValueOnce(new Error('disk full after acceptance'))
  await expect(value.client.dispatch(value.current(), async callbacks => {
    callbacks.onDispatchStarted(); callbacks.onAccepted({ runtimeSessionId: 'runtime', storedSessionId: 'root' })
    return true
  })).rejects.toThrow('disk full')
  expect(value.project.mock.calls.map(([envelope]) => envelope.status)).toEqual(['sending'])
  expect(value.api.remove).not.toHaveBeenCalled()
})

it('rejects a response bound to a different owner before any projection', async () => {
  const value = fixture(), initial = value.current()
  vi.mocked(value.api.list).mockResolvedValueOnce([{ ...initial, address: { ...address, owner: { ...owner, profile: 'other' } } }])
  await expect(value.client.restore({ owner, session: address.session }, initial.lease)).rejects.toThrow()
  expect(value.project).not.toHaveBeenCalled()
})
