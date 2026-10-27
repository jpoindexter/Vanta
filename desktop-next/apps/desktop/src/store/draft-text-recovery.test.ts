import { afterEach, expect, it, vi } from 'vitest'
import { $restoredDraftNotice, clearSessionDraft, consumeSessionDraftText, currentDraftTextRevision, draftTitleFor, quoteSessionDraftText, reloadPersistedDrafts, stashSessionDraft, takeSessionDraft } from './composer'
import { $draftTextStorageUnavailable, DRAFT_TEXT_STORAGE_KEY, LEGACY_DRAFT_TEXT_STORAGE_KEY } from './draft-text-storage'

afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem(DRAFT_TEXT_STORAGE_KEY); localStorage.removeItem(LEGACY_DRAFT_TEXT_STORAGE_KEY); reloadPersistedDrafts(); clearSessionDraft('corrupt-recovery') })

it('keeps the last known draft, title, revision and image when a shared persisted snapshot is corrupt', () => {
  const image = { id: 'image', kind: 'image' as const, label: 'kept.png', imageData: { mime: 'image/png', dataBase64: 'AQ==' } }
  stashSessionDraft('corrupt-recovery', 'Keep my exact words', [image])
  const title = draftTitleFor('corrupt-recovery'), revision = currentDraftTextRevision('corrupt-recovery')
  localStorage.setItem(DRAFT_TEXT_STORAGE_KEY, '{broken')
  reloadPersistedDrafts()
  expect(takeSessionDraft('corrupt-recovery')).toEqual({ text: 'Keep my exact words', attachments: [image] })
  expect(draftTitleFor('corrupt-recovery')).toBe(title)
  expect(currentDraftTextRevision('corrupt-recovery')).toBe(revision)
  expect(localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)).toBe('{broken')
  expect($draftTextStorageUnavailable.get()).toBe(true)
})

it('retains current state on an inaccessible store, then accepts a genuinely empty snapshot', () => {
  stashSessionDraft('corrupt-recovery', 'Known words', [])
  const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('unavailable') })
  expect(reloadPersistedDrafts()).toBe(false)
  expect(takeSessionDraft('corrupt-recovery').text).toBe('Known words')
  spy.mockRestore()
  localStorage.setItem(DRAFT_TEXT_STORAGE_KEY, JSON.stringify({ version: 4, drafts: {} }))
  expect(reloadPersistedDrafts()).toBe(true)
  expect(takeSessionDraft('corrupt-recovery').text).toBe('')
  expect($draftTextStorageUnavailable.get()).toBe(false)
})

it('does not erase known text when legacy input is corrupt, and clears the warning after a valid read', () => {
  stashSessionDraft('corrupt-recovery', 'Keep before migration', [])
  const good = localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)!
  localStorage.removeItem(DRAFT_TEXT_STORAGE_KEY)
  localStorage.setItem(LEGACY_DRAFT_TEXT_STORAGE_KEY, '{invalid')
  expect(reloadPersistedDrafts()).toBe(false)
  expect(takeSessionDraft('corrupt-recovery').text).toBe('Keep before migration')
  localStorage.setItem(DRAFT_TEXT_STORAGE_KEY, good)
  expect(reloadPersistedDrafts()).toBe(true)
  expect(takeSessionDraft('corrupt-recovery').text).toBe('Keep before migration')
  expect($draftTextStorageUnavailable.get()).toBe(false)
})

it('rejects a malformed owned identity before replacing known drafts or overwriting stored bytes', () => {
  const owner = { connectionId: 'local', profile: 'A' }
  stashSessionDraft('corrupt-recovery', 'Keep owned words', [], owner)
  const invalid = JSON.stringify({ version: 4, drafts: {
    '__owned_draft_text_v1__:["local",null,"same-id"]': { text: 'Unattributed words', revision: crypto.randomUUID() }
  } })
  localStorage.setItem(DRAFT_TEXT_STORAGE_KEY, invalid)
  expect(reloadPersistedDrafts()).toBe(false)
  expect(takeSessionDraft('corrupt-recovery', owner).text).toBe('Keep owned words')
  stashSessionDraft('another-id', 'More known words', [], owner)
  expect(localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)).toBe(invalid)
  expect($draftTextStorageUnavailable.get()).toBe(true)
})

it('returns false and restores the same text/title/revision when consumption cannot persist', () => {
  stashSessionDraft('corrupt-recovery', 'Retain on failed cleanup', [])
  const quote = quoteSessionDraftText('corrupt-recovery')!, title = draftTitleFor('corrupt-recovery')
  const raw = localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)
  const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(consumeSessionDraftText(quote)).toBe(false)
  expect(takeSessionDraft('corrupt-recovery').text).toBe('Retain on failed cleanup')
  expect(currentDraftTextRevision('corrupt-recovery')).toBe(quote.revision)
  expect(draftTitleFor('corrupt-recovery')).toBe(title)
  expect(localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)).toBe(raw)
  failure.mockRestore(); reloadPersistedDrafts()
  expect(consumeSessionDraftText(quote)).toBe(true)
})

it('preserves the fresh-draft Undo notice on failed consumption and keeps stashSessionDraft void', () => {
  expect(stashSessionDraft('__new__:rollback', 'Fresh words', [])).toBeUndefined()
  const quote = quoteSessionDraftText('__new__:rollback')!
  const notice = { fromKey: 'gone', text: 'Fresh words' }
  $restoredDraftNotice.set(notice)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(consumeSessionDraftText(quote)).toBe(false)
  expect($restoredDraftNotice.get()).toBe(notice)
})
