import type { DraftOwner } from '../../../shared/src/vanta/draft-custody'
import { recordDislike, recordFriction } from './desktop-metrics'
import { sameDraftTextOwner } from './draft-text-identity'
import { draftKey, freshDraftScope } from './fresh-draft-scope'
import { $restoredDraftNotice, clearSessionDraft, draftsBySession, stashSessionDraft } from './session-draft-state'

/**
 * Move a stashed composer draft from one session key onto another.
 *
 * Auto-compression rotates the live stored tip id (root → continuation) while
 * the user may still be typing. Drafts keyed on the obsolete tip would otherwise
 * vanish from the composer when selection follows the new tip. A new chat is
 * stored under the pre-session key until its first session id arrives. No-op
 * unless the destination resolves, the keys differ, and the source has content. Does not overwrite a
 * non-empty destination draft.
 */
export function migrateSessionDraft(fromKey: string | null | undefined, toKey: string | null | undefined, owner?: DraftOwner): boolean {
  const from = draftKey(fromKey, owner)
  const to = draftKey(toKey, owner)

  if (!toKey?.trim() || from === to || !sameDraftTextOwner(from, to)) {
    return false
  }

  const source = draftsBySession.get(from)

  if (!source || (!source.text.trim() && source.attachments.length === 0)) {
    return false
  }

  const dest = draftsBySession.get(to)

  if (dest && (dest.text.trim() || dest.attachments.length > 0)) {
    return false
  }

  stashSessionDraft(to, source.text, source.attachments)
  clearSessionDraft(from)

  return true
}

/**
 * The stored id the pre-session chat is about to be re-homed onto, announced
 * by the site that assigns it (first-send `session.create`, cold-start
 * resume-last-session) and consumed by the composer's scope swap.
 *
 * The swap cannot tell an assignment apart from the user opening another
 * session from a new chat — both flip the scope from the `__new__` bucket to
 * a concrete id — and only the assignment may carry the draft along: a
 * sidebar click keeps per-scope drafts where they were typed.
 */
const announcedNewSessionDraftKeys = new Map<string, string>()

export function announceNewSessionDraftKey(toKey: string | null | undefined, fromKey = freshDraftScope(), owner?: DraftOwner): void {
  if (toKey?.trim()) announcedNewSessionDraftKeys.set(draftKey(toKey, owner), draftKey(fromKey, owner))
  else announcedNewSessionDraftKeys.clear()
}

/** Consume the announcement; move the `__new__` draft when it names `toKey`. */
export function adoptNewSessionDraft(toKey: string | null | undefined, owner?: DraftOwner): boolean {
  const target = draftKey(toKey, owner), source = announcedNewSessionDraftKeys.get(target)
  if (!source) return false
  announcedNewSessionDraftKeys.delete(target)
  return migrateSessionDraft(source, target)
}

/**
 * Recovery for the unsent text of a session that turned out to be GONE
 * (#111868): deleted, or a stale id from a wiped / renamed backend.
 *
 * The resume path already drops such a window to a fresh draft without
 * toasting or looping (62af32efe7c, bounded by `goneSessionVerdict`). The
 * composer's draft stash is keyed per stored session, so the text the user
 * typed into the dead id is not lost — but nothing will ever open that key
 * again, so it is invisible. The gone verdict announces the dead key here;
 * the composer's scope swap (concrete id → the `__new__` bucket) consumes
 * it AFTER the outgoing cleanup stashed the live editor text, so even
 * keystrokes still inside the persist debounce ride along.
 *
 * Offer, don't hijack: the fresh draft is seeded and an inline notice with
 * Undo is published — no navigation, no focus steal, no toast. Fires once:
 * the source key is cleared by the move, so re-opening the dead id later
 * finds nothing to restore.
 */
const announcedGoneSessionDraftKeys = new Map<string, string>()

export function announceGoneSessionDraft(fromKey: string | null | undefined, owner?: DraftOwner): void {
  if (fromKey?.trim()) announcedGoneSessionDraftKeys.set(JSON.stringify(owner ?? null), draftKey(fromKey, owner))
  else announcedGoneSessionDraftKeys.delete(JSON.stringify(owner ?? null))
}

/**
 * Consume the announcement when a composer enters the fresh-draft scope.
 * Moves the dead key's draft into the `__new__` bucket and publishes the
 * notice. Declines (no notice) when nothing was announced, the key holds no
 * text, or the user is already composing a new chat — never clobber what
 * they are typing. Keyed on the announcement, not on the composer observing
 * an id → fresh transition: the composer can remount across the drop (a
 * loading route mounts no composer), so the dead scope may never have been
 * this instance's previous scope.
 */
export function adoptGoneSessionDraft(owner?: DraftOwner): boolean {
  const ownerKey = JSON.stringify(owner ?? null), announced = announcedGoneSessionDraftKeys.get(ownerKey)
  announcedGoneSessionDraftKeys.delete(ownerKey)

  if (!announced) {
    return false
  }

  const source = draftsBySession.get(draftKey(announced))

  if (!source || (!source.text.trim() && !source.attachments.length)) {
    return false
  }

  const destination = draftKey(null, owner)
  const dest = draftsBySession.get(destination)

  if (dest && (dest.text.trim() || dest.attachments.length > 0)) {
    return false
  }

  const { attachments, text } = source
  stashSessionDraft(destination, text, attachments)
  clearSessionDraft(announced)
  $restoredDraftNotice.set({ fromKey: announced, text, ...(owner ? { toKey: destination } : {}) })

  return true
}

export function dismissRestoredDraftNotice(): void {
  recordFriction('notice_dismissed', 'restored_draft')
  $restoredDraftNotice.set(null)
}

/**
 * Undo the restore: put the text back under the dead key (where it was,
 * still recoverable by the same path) and empty the fresh draft. Only while
 * the live text is still exactly what was restored — once the user has
 * edited it, Undo would destroy their work, so it only dismisses the notice.
 * Returns whether the fresh draft was emptied (the caller repaints).
 */
export function undoRestoredDraft(liveText: string, owner?: DraftOwner): boolean {
  const notice = $restoredDraftNotice.get()
  const destination = draftKey(null, owner)
  if (notice && (notice.toKey ?? freshDraftScope()) !== destination) return false
  $restoredDraftNotice.set(null)

  if (!notice || liveText !== notice.text) {
    return false
  }

  const current = draftsBySession.get(destination)
  stashSessionDraft(notice.fromKey, notice.text, current?.attachments ?? [])
  clearSessionDraft(destination)
  recordDislike('undo', 'restored_draft')

  return true
}
