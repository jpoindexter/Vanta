import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { ownedDraftTextScope } from '@/store/draft-text-identity'
import { DRAFT_TEXT_STORAGE_KEY, MAX_PERSISTED_DRAFT_TEXTS, saveDraftTextRecords, loadDraftTextRecords } from '@/store/draft-text-storage'
import { reloadPersistedDrafts, takeSessionDraft } from '@/store/session-draft-state'
import { $freshDraftKey } from '@/store/fresh-draft-scope'
import { prepareHomeAttachmentDraft } from './attachment-handoff'
import { readHomeDraft, saveHomeDraft } from './home-draft'
vi.mock('@/store/draft-custody-owner', () => ({ captureDraftCustodyOwner: vi.fn() }))
const owner = { connectionId: 'local', profile: 'writer' }
beforeEach(() => { localStorage.clear(); reloadPersistedDrafts(); vi.mocked(captureDraftCustodyOwner).mockReturnValue(owner) })
afterEach(() => { localStorage.clear(); reloadPersistedDrafts(); vi.restoreAllMocks() })
function fill(count: number) {
  expect(saveDraftTextRecords(new Map(Array.from({ length: count }, (_, index) =>
    [ownedDraftTextScope(owner, 'older-' + index), { text: 'Private older words ' + index, revision: crypto.randomUUID() }])))).toBe(true)
  reloadPersistedDrafts()
}

it('does not evict any of exactly50 saved records when a new Home source is allocated', () => {
  fill(MAX_PERSISTED_DRAFT_TEXTS)
  const raw = localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)
  expect(() => saveHomeDraft(owner, { text: 'New words', projectId: 'bravo' })).toThrow('drafts are full')
  expect(localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)).toBe(raw)
  expect(loadDraftTextRecords()?.size).toBe(MAX_PERSISTED_DRAFT_TEXTS)
  expect(takeSessionDraft('older-0', owner).text).toBe('Private older words 0')
})

it('refuses a new durable text destination before rotation or source consumption when Home occupies the50th slot', () => {
  fill(MAX_PERSISTED_DRAFT_TEXTS - 1)
  const source = saveHomeDraft(owner, { text: 'Keep Home words', projectId: 'bravo' })
  const raw = localStorage.getItem(DRAFT_TEXT_STORAGE_KEY), key = $freshDraftKey.get()
  expect(() => prepareHomeAttachmentDraft({ id: crypto.randomUUID(), owner, source, text: 'Keep Home words' }, vi.fn())).toThrow('drafts are full')
  expect(localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)).toBe(raw)
  expect($freshDraftKey.get()).toBe(key)
  expect(readHomeDraft(owner).text).toBe('Keep Home words')
})

it('does not demand another text slot for an empty/image-only prepared destination', () => {
  fill(MAX_PERSISTED_DRAFT_TEXTS - 1)
  const source = saveHomeDraft(owner, { text: '', projectId: 'bravo' })
  expect(() => prepareHomeAttachmentDraft({ id: crypto.randomUUID(), owner, source, text: '' }, vi.fn())).not.toThrow()
  expect(loadDraftTextRecords()?.size).toBe(MAX_PERSISTED_DRAFT_TEXTS)
  expect(takeSessionDraft('older-0', owner).text).toBe('Private older words 0')
})
