import type { DraftOwner } from '../../../../../shared/src/vanta/draft-custody'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { freshDraftWindowScope } from '@/store/fresh-draft-history'
import { consumeSessionDraftText, currentDraftTextRevision, quoteSessionDraftText, reloadPersistedDrafts, stashHomeSessionDraft, takeSessionDraft } from '@/store/session-draft-state'
import { ownedDraftTextScope } from '@/store/draft-text-identity'
import { $draftTextStorageUnavailable, HOME_DRAFT_SCOPE_PREFIX, MAX_PERSISTED_DRAFT_TEXTS, loadDraftTextRecords } from '@/store/draft-text-storage'
import { atom } from 'nanostores'

export interface HomeDraftValue { text: string; projectId: string | null; delivery?: 'submitting' }
export interface HomeDraftSource { window: string; revision: string }
export type HomeDraftCapture = (value: HomeDraftValue) => { owner: DraftOwner; source: HomeDraftSource }
export const homeDraftScope = (window = freshDraftWindowScope()) => HOME_DRAFT_SCOPE_PREFIX + window
export const $homeDraftRevision = atom(0)
export const noteHomeDraftChange = () => $homeDraftRevision.set($homeDraftRevision.get() + 1)

/** Home cannot evict another saved draft to allocate its source or text destination. */
export function assertHomeDraftCapacity(owner: DraftOwner, scope: string): void {
  const records = loadDraftTextRecords()
  if (!records) throw new Error('Saved drafts are unavailable. Your saved words were retained.')
  if (!records.has(ownedDraftTextScope(owner, scope)) && records.size >= MAX_PERSISTED_DRAFT_TEXTS) {
    throw new Error('Saved drafts are full. Keep this window open and finish a saved draft before starting another.')
  }
}

export function assertHomeOwner(owner: DraftOwner): void {
  const current = captureDraftCustodyOwner(null)
  if (current?.connectionId !== owner.connectionId || current.profile !== owner.profile) throw new Error('The Home destination changed. Your words were retained.')
}

export function readHomeDraft(owner: DraftOwner): HomeDraftValue {
  if (!reloadPersistedDrafts()) throw new Error('Saved drafts are unavailable. Your saved words were not replaced.')
  const draft = takeSessionDraft(homeDraftScope(), owner)
  return { text: draft.text, projectId: draft.home?.projectId ?? null, ...(draft.home?.delivery ? { delivery: draft.home.delivery } : {}) }
}

export function saveHomeDraft(owner: DraftOwner, value: HomeDraftValue): HomeDraftSource {
  assertHomeOwner(owner)
  if (!reloadPersistedDrafts()) throw new Error('Saved drafts are unavailable. Your saved words were not replaced.')
  assertHomeDraftCapacity(owner, homeDraftScope())
  const previous = takeSessionDraft(homeDraftScope(), owner)
  const pendingSame = previous.home?.delivery && previous.text === value.text && previous.home.projectId === value.projectId
  if (!pendingSame) stashHomeSessionDraft({ scope: homeDraftScope(), owner, ...value })
  const quote = quoteSessionDraftText(homeDraftScope(), owner)
  if (!quote) throw new Error('Your Home draft could not be saved. Keep this window open and try again.')
  noteHomeDraftChange()
  return { window: freshDraftWindowScope(), revision: quote.revision }
}

export function captureHomeDraft(owner: DraftOwner, value: HomeDraftValue) {
  assertHomeOwner(owner)
  const saved = readHomeDraft(owner)
  const recorded = currentDraftTextRevision(homeDraftScope(), owner)
  const sameText = value.text === saved.text || value.text === saved.text.trim()
  const sameProject = saved.projectId === null || value.projectId === saved.projectId
  if (recorded && (!sameText || !sameProject)) throw new Error('The Home draft changed. Your newer words were retained.')
  return { owner, source: saveHomeDraft(owner, recorded ? { ...saved, projectId: value.projectId } : value) }
}

export function consumeHomeDraft(owner: DraftOwner, source: HomeDraftSource): boolean {
  assertHomeSource(owner, source)
  if (!reloadPersistedDrafts()) throw new Error('Saved drafts are unavailable. Your saved words were retained.')
  const consumed = consumeSessionDraftText({ scope: ownedDraftTextScope(owner, homeDraftScope(source.window)), revision: source.revision })
  noteHomeDraftChange()
  if (!consumed && $draftTextStorageUnavailable.get()) throw new Error('The destination has your words, but the saved Home source could not be cleared. Keep this window open.')
  return consumed
}

export function assertHomeSource(owner: DraftOwner, source: HomeDraftSource): void {
  assertHomeOwner(owner)
  if (source.window !== freshDraftWindowScope()) throw new Error('The Home window changed. Your saved words were retained.')
}

export async function waitForHomeOwner(owner: DraftOwner): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const current = captureDraftCustodyOwner(null)
    if (current?.connectionId === owner.connectionId && current.profile === owner.profile) return
    await new Promise(resolve => window.setTimeout(resolve, 100))
  }
  throw new Error('The Home destination is not ready. Your saved words were retained.')
}
