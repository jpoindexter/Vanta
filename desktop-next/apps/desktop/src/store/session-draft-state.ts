import { atom } from 'nanostores'
import { deriveDraftTitle } from '@/lib/draft-title'
import type { DraftOwner } from '../../../shared/src/vanta/draft-custody'
import type { ComposerAttachment, ComposerAttachmentPatch } from './composer'
import { draftKey, freshDraftScope, isFreshDraftScope } from './fresh-draft-scope'
import { draftTextIdentity } from './draft-text-identity'
import { rememberFreshDraft } from './fresh-draft-history'
import { DRAFT_TEXT_STORAGE_KEY, LEGACY_DRAFT_TEXT_STORAGE_KEY, loadDraftTextRecords, saveDraftTextRecords, type DraftTextQuote, type DraftTextRecord } from './draft-text-storage'

export function attachmentOccurrenceIndex(attachments: ComposerAttachment[], expected: ComposerAttachment): number {
  return attachments.findIndex(item =>
    expected.occurrenceId === undefined
      ? item === expected
      : item.id === expected.id && item.occurrenceId === expected.occurrenceId
  )
}

export const SESSION_DRAFTS_STORAGE_KEY = DRAFT_TEXT_STORAGE_KEY

const MAX_PERSISTED_DRAFTS = 50
const EMPTY_SESSION_DRAFT: SessionDraft = { attachments: [], text: '' }

export interface SessionDraft {
  attachments: ComposerAttachment[]
  text: string
}

/** Inline "Restored your unsent message" notice for the fresh draft (see
 *  `adoptGoneSessionDraft`). `null` = nothing to show. */
export interface RestoredDraftNotice {
  /** The dead stored-session key the text came from. */
  fromKey: string
  toKey?: string
  /** The text as restored — Undo only applies while the draft still equals it. */
  text: string
}

export const $restoredDraftNotice = atom<RestoredDraftNotice | null>(null)

const cloneDraft = (draft: SessionDraft): SessionDraft => ({
  attachments: draft.attachments.map(attachment => ({ ...attachment })),
  text: draft.text
})

const initialTextRecords = loadDraftTextRecords() ?? new Map<string, DraftTextRecord>()
const textRevisions = new Map([...initialTextRecords].map(([key, value]) => [key, value.revision]))
const observedDraftTexts = new Map([...initialTextRecords].map(([key, value]) => [key, value.text]))
export const draftsBySession = new Map<string, SessionDraft>([...initialTextRecords].map(([key, value]) => [key, { text: value.text, attachments: [] }]))

/**
 * Patch one asynchronous attachment occurrence wherever the main composer owns
 * it. During a session switch the occurrence moves from the live atom into the
 * per-session in-memory draft stash; a preview may finish on either side of
 * that handoff. Updating both stores is safe because occurrence ids are unique,
 * and merging into the latest object preserves concurrent staging metadata.
 */
export function patchStashedDraftAttachmentOccurrence(
  expected: ComposerAttachment,
  patch: ComposerAttachmentPatch
): boolean {
  let updated = false

  for (const [key, draft] of draftsBySession) {
    const index = attachmentOccurrenceIndex(draft.attachments, expected)

    if (index < 0) {
      continue
    }

    const attachments = [...draft.attachments]
    attachments[index] = { ...attachments[index]!, ...patch }
    draftsBySession.set(key, { ...draft, attachments })
    updated = true
  }

  return updated
}

/**
 * What each unsent draft would be called, keyed the same way its text is.
 *
 * A draft has no session to carry a title, so the tab showing it reads this
 * instead of the "New session" placeholder. Written from `stashSessionDraft`,
 * the one funnel every composer's text already flows through — the debounce
 * that persists a draft is the same beat that renames its tab, so typing costs
 * nothing extra. Only tabs showing a draft subscribe, and each selects its own
 * key, so a rename repaints one label rather than the strip.
 *
 * Seeded from the persisted texts: a draft left open across a restart comes
 * back already named.
 */
export const $draftTitles = atom<Record<string, string>>(
  Object.fromEntries(
    [...draftsBySession].map(([key, draft]) => [key, deriveDraftTitle(draft.text)]).filter(([, title]) => title)
  )
)

/** Read one draft's title out of the map — for a `useStoreSelector`, so a tab
 *  repaints on its OWN rename rather than on every draft's. */
export const draftTitleIn = (titles: Record<string, string>, scope: string | null | undefined, owner?: DraftOwner): string =>
  titles[draftKey(scope, owner)] ?? ''

export const draftTitleFor = (scope: string | null | undefined, owner?: DraftOwner): string => draftTitleIn($draftTitles.get(), scope, owner)

function publishDraftTitle(key: string, title: string): void {
  const current = $draftTitles.get()

  if ((current[key] ?? '') === title) {
    return
  }

  const next = { ...current }

  if (title) {
    next[key] = title
  } else {
    delete next[key]
  }

  $draftTitles.set(next)
}

/**
 * Re-read the persisted drafts written by ANOTHER window into this one's map.
 *
 * Drafts are per-renderer state backed by shared localStorage, and the map
 * above is read exactly once at module load. Two windows on the same session
 * (HUD mode ⇄ the app window) therefore diverge the moment either one types:
 * whichever window mounted first keeps its stale copy forever, so text typed
 * in the HUD is simply gone when you return to the app.
 *
 * Merge, don't clobber — the local map may hold attachments (never persisted)
 * that the incoming text-only snapshot can't know about.
 */
export function reloadPersistedDrafts(): boolean {
  const records = loadDraftTextRecords()
  if (records === null) return false
  const incoming = new Map([...records].map(([key, value]) => [key, { text: value.text, attachments: [] }]))

  for (const [key, draft] of incoming) {
    textRevisions.set(key, records.get(key)!.revision)
    observedDraftTexts.set(key, draft.text)
    const local = draftsBySession.get(key)
    draftsBySession.set(key, local?.attachments.length ? { ...local, text: draft.text } : draft)
    publishDraftTitle(key, deriveDraftTitle(draft.text))
  }

  // A key that vanished from storage was cleared (sent) in the other window.
  for (const key of [...draftsBySession.keys()]) {
    if (!incoming.has(key)) {
      draftsBySession.delete(key)
      textRevisions.delete(key)
      observedDraftTexts.delete(key)
      publishDraftTitle(key, '')
    }
  }
  return true
}

// localStorage `storage` events fire across Electron BrowserWindows of the
// same origin, so the other window's write is the sync signal.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === SESSION_DRAFTS_STORAGE_KEY || event.key === LEGACY_DRAFT_TEXT_STORAGE_KEY) {
      reloadPersistedDrafts()
    }
  })
}

function persistDraftTexts() {
  return saveDraftTextRecords(new Map([...draftsBySession].filter(([, draft]) => draft.text).slice(-MAX_PERSISTED_DRAFTS)
    .map(([key, draft]) => [key, { text: draft.text, revision: textRevisions.get(key) || noteDraftTextEdit(key, draft.text) }])))
}

/** Record edit identity at input time, even when delete/retype falls inside the persistence debounce. */
export function noteDraftTextEdit(scope: string | null | undefined, text: string, owner?: DraftOwner): string {
  const key = draftKey(scope, owner)
  if (observedDraftTexts.get(key) !== text || !textRevisions.has(key)) textRevisions.set(key, crypto.randomUUID())
  observedDraftTexts.set(key, text)
  return textRevisions.get(key)!
}
export function quoteSessionDraftText(scope: string | null | undefined, owner?: DraftOwner): DraftTextQuote | null {
  const key = draftKey(scope, owner), revision = textRevisions.get(key)
  return revision && persistDraftTexts() ? { scope: key, revision } : null
}
export function currentDraftTextRevision(scope: string | null | undefined, owner?: DraftOwner): string | undefined { return textRevisions.get(draftKey(scope, owner)) }
export function consumeSessionDraftText(quote: DraftTextQuote): boolean {
  const current = draftsBySession.get(quote.scope)
  if (!current || textRevisions.get(quote.scope) !== quote.revision) return false
  stashSessionDraft(quote.scope, '', current.attachments)
  return true
}

export function stashSessionDraft(scope: string | null | undefined, text: string, attachments: ComposerAttachment[], owner?: DraftOwner) {
  const key = draftKey(scope, owner)
  const captured = draftTextIdentity(key)
  if (captured?.session === freshDraftScope() && (text.trim() || attachments.length)) rememberFreshDraft(captured.owner, captured.session)
  noteDraftTextEdit(key, text)

  // Delete-then-set keeps MRU order for MAX_PERSISTED_DRAFTS eviction.
  draftsBySession.delete(key)

  if (text.trim() || attachments.length > 0) {
    draftsBySession.set(key, cloneDraft({ attachments, text }))
  } else if (isFreshDraftScope(key)) {
    // The fresh draft was sent or emptied — a restore notice has nothing left
    // to undo.
    $restoredDraftNotice.set(null)
  }

  persistDraftTexts()
  publishDraftTitle(key, deriveDraftTitle(text))
}

export function takeSessionDraft(scope: string | null | undefined, owner?: DraftOwner): SessionDraft {
  const stashed = draftsBySession.get(draftKey(scope, owner))

  return stashed ? cloneDraft(stashed) : EMPTY_SESSION_DRAFT
}

export const clearSessionDraft = (scope: string | null | undefined, owner?: DraftOwner) => stashSessionDraft(scope, '', [], owner)

/**
 * Stored draft scopes that hold content, excluding the new-chat key. The
 * dead-session prune sweeps these to discard drafts whose sessions no longer
 * exist on the backend; the new-chat draft is never a session reference.
 */
export function stashedDraftScopes(owner?: DraftOwner): string[] {
  return [...draftsBySession.keys()].flatMap(key => {
    const identity = draftTextIdentity(key)
    if (!identity) return !owner && !isFreshDraftScope(key) ? [key] : []
    return owner && identity.owner.connectionId === owner.connectionId && identity.owner.profile === owner.profile &&
      !isFreshDraftScope(identity.session) ? [identity.session] : []
  })
}
