import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { $homeOpen, openHome } from '@/store/home-view'
import { $freshDraftKey } from '@/store/fresh-draft-scope'
import { DRAFT_TEXT_STORAGE_KEY } from '@/store/draft-text-storage'
import { reloadPersistedDrafts, stashSessionDraft, takeSessionDraft } from '@/store/session-draft-state'
import { prepareHomeAttachmentDraft, homeAttachmentDraftKey } from './attachment-handoff'
import { consumeHomeDraft, readHomeDraft, saveHomeDraft } from './home-draft'
import { homeTaskActions } from './home-task-actions'

vi.mock('@/store/draft-custody-owner', () => ({ captureDraftCustodyOwner: vi.fn() }))
const owner = { connectionId: 'local', profile: 'writer' }
const scope = { owner, window: 'main' }
beforeEach(() => { localStorage.clear(); reloadPersistedDrafts(); vi.mocked(captureDraftCustodyOwner).mockReturnValue(owner); openHome() })
afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(window, 'desktopBridge'); localStorage.clear(); reloadPersistedDrafts() })
const capture = (value: { text: string; projectId: string | null }) => ({ owner, source: saveHomeDraft(owner, value) })

it('durably captures fresh words before consuming the exact Home source and keeps the older chat private', () => {
  stashSessionDraft('old', 'Older words', [], owner)
  const source = saveHomeDraft(owner, { text: 'Home words', projectId: 'bravo' })
  const request = { id: crypto.randomUUID(), owner, source, text: 'Home words' }
  prepareHomeAttachmentDraft(request, vi.fn())
  reloadPersistedDrafts()
  expect(takeSessionDraft(homeAttachmentDraftKey(request.id), owner).text).toBe('Home words')
  expect(readHomeDraft(owner)).toEqual({ text: '', projectId: 'bravo' })
  expect(takeSessionDraft('old', owner).text).toBe('Older words')
})

it('preserves later Home edits and later fresh edits when replaying the original captured request', () => {
  const source = saveHomeDraft(owner, { text: 'First', projectId: 'bravo' })
  saveHomeDraft(owner, { text: 'Later Home', projectId: 'alpha' })
  const request = { id: crypto.randomUUID(), owner, source, text: 'First' }
  prepareHomeAttachmentDraft(request, vi.fn())
  stashSessionDraft(homeAttachmentDraftKey(request.id), 'Later fresh', [], owner)
  prepareHomeAttachmentDraft(request, vi.fn())
  expect(takeSessionDraft(homeAttachmentDraftKey(request.id), owner).text).toBe('Later fresh')
  expect(readHomeDraft(owner)).toEqual({ text: 'Later Home', projectId: 'alpha' })
})

it('refuses capture on unavailable draft storage before closing Home, consuming source or rotating the fresh draft', () => {
  const source = saveHomeDraft(owner, { text: 'Retain', projectId: 'bravo' }), key = $freshDraftKey.get()
  const raw = localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(() => prepareHomeAttachmentDraft({ id: crypto.randomUUID(), owner, source, text: 'Retain' }, vi.fn())).toThrow('could not be saved')
  expect($freshDraftKey.get()).toBe(key)
  expect($homeOpen.get()).toBe(true)
  expect(localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)).toBe(raw)
})

it('retains Home text throughout a pending or rejected send and only consumes after accepted submit', async () => {
  let resolve!: () => void
  const start = vi.fn(() => new Promise<void>(done => { resolve = done }))
  const actions = homeTaskActions({ capture, scope, prepareAttachment: vi.fn(), startTask: start })
  const pending = actions.startTask('Submit once', null)
  await vi.waitFor(() => expect(start).toHaveBeenCalledOnce())
  expect(readHomeDraft(owner).text).toBe('Submit once')
  expect($homeOpen.get()).toBe(true)
  resolve(); await pending
  expect(readHomeDraft(owner).text).toBe('')
  const rejected = homeTaskActions({ capture, scope, prepareAttachment: vi.fn(), startTask: vi.fn(async () => { throw new Error('offline') }) })
  await expect(rejected.startTask('Do not erase', null)).rejects.toThrow('may already')
  expect(readHomeDraft(owner).text).toBe('Do not erase')
})

it('keeps the selected project durable even for an empty Home draft', () => {
  const source = saveHomeDraft(owner, { text: '', projectId: 'bravo' })
  reloadPersistedDrafts()
  expect(readHomeDraft(owner)).toEqual({ text: '', projectId: 'bravo' })
  expect(consumeHomeDraft(owner, source)).toBe(true)
  expect(readHomeDraft(owner).projectId).toBe('bravo')
})
