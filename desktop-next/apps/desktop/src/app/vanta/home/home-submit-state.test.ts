import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { $notifications } from '@/store/notifications'
import { reloadPersistedDrafts } from '@/store/session-draft-state'
import { captureHomeDraft, readHomeDraft, saveHomeDraft } from './home-draft'
import { homeTaskActions } from './home-task-actions'
import { $homeDraftBusy } from './home-draft-action'
import { HomeSubmitStateError, reportHomeActionError, submitHomeOnce } from './home-submit-state'
vi.mock('@/store/draft-custody-owner', () => ({ captureDraftCustodyOwner: vi.fn() }))
const owner = { connectionId: 'local', profile: 'writer' }, scope = { owner, window: 'main' }
beforeEach(() => { localStorage.clear(); reloadPersistedDrafts(); vi.mocked(captureDraftCustodyOwner).mockReturnValue(owner) })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); reloadPersistedDrafts(); $notifications.set([]) })
const captured = () => ({ owner, source: saveHomeDraft(owner, { text: 'Original', projectId: null }) })
const capture = (value: { text: string; projectId: string | null }) => captureHomeDraft(owner, value)

it('deduplicates pending Send/Attach across recreated action callbacks before saving over newer words', async () => {
  let finish!: () => void
  captured()
  const startTask = vi.fn(() => new Promise<void>(resolve => { finish = resolve })), prepareAttachment = vi.fn()
  const first = homeTaskActions({ scope, capture, startTask, prepareAttachment })
  const running = first.startTask('Original', null)
  await vi.waitFor(() => expect(startTask).toHaveBeenCalledOnce())
  saveHomeDraft(owner, { text: 'Newer Home edits', projectId: 'bravo' })
  const spy = vi.fn(capture), second = homeTaskActions({ scope, capture: spy, startTask, prepareAttachment })
  const duplicate = second.startTask('Original', null), staleAttach = second.prepareAttachment('Original', null)
  expect(spy).not.toHaveBeenCalled()
  expect(readHomeDraft(owner).text).toBe('Newer Home edits')
  finish(); await Promise.all([running, duplicate, staleAttach])
  expect(startTask).toHaveBeenCalledOnce(); expect(prepareAttachment).not.toHaveBeenCalled()
  expect(readHomeDraft(owner).text).toBe('Newer Home edits')
  expect($homeDraftBusy.get()).toEqual({})
})

it('retains a durable non-retry-safe marker after an ambiguous provider failure and never submits the same source again', async () => {
  const request = captured(), submit = vi.fn(async () => { throw new Error('connection reset') })
  await expect(submitHomeOnce(request, submit)).rejects.toBeInstanceOf(HomeSubmitStateError)
  reloadPersistedDrafts()
  expect(readHomeDraft(owner)).toMatchObject({ text: 'Original', delivery: 'submitting' })
  await expect(submitHomeOnce(request, submit)).rejects.toThrow('may already')
  expect(submit).toHaveBeenCalledOnce()
})

it('reports accepted-but-cleanup-failed explicitly and preserves its marker across reload, not retry-safe unsent status', async () => {
  const request = captured()
  const submit = vi.fn(async () => { vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') }) })
  let failure: unknown
  try { await submitHomeOnce(request, submit) } catch (error) { failure = error }
  expect(failure).toMatchObject({ accepted: true })
  reportHomeActionError(failure, 'Could not start')
  expect($notifications.get()[0]).toMatchObject({ kind: 'warning', title: 'Message accepted' })
  expect($notifications.get()[0].message).toContain('Do not send it again')
  vi.restoreAllMocks(); vi.mocked(captureDraftCustodyOwner).mockReturnValue(owner); reloadPersistedDrafts()
  expect(readHomeDraft(owner)).toMatchObject({ text: 'Original', delivery: 'submitting' })
  await expect(submitHomeOnce(request, submit)).rejects.toThrow('may already')
  expect(submit).toHaveBeenCalledOnce()
})

it('does not send if its durable pre-submit checkpoint fails', async () => {
  const request = captured(), submit = vi.fn(async () => undefined)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  await expect(submitHomeOnce(request, submit)).rejects.toThrow('No message was sent')
  expect(submit).not.toHaveBeenCalled()
})

it('does not let a stale post-completion callback overwrite a newer source', () => {
  captured(); saveHomeDraft(owner, { text: 'Newer', projectId: 'bravo' })
  expect(() => captureHomeDraft(owner, { text: 'Original', projectId: null })).toThrow('changed')
  expect(readHomeDraft(owner).text).toBe('Newer')
})
