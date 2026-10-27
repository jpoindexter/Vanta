import type { DraftOwner } from '../../../../../shared/src/vanta/draft-custody'
import { currentDraftTextRevision, quoteSessionDraftText, stashHomeSessionDraft } from '@/store/session-draft-state'
import { notify, notifyError } from '@/store/notifications'
import { assertHomeSource, consumeHomeDraft, homeDraftScope, noteHomeDraftChange, readHomeDraft, type HomeDraftSource } from './home-draft'

export const HOME_SUBMIT_REVIEW_COPY = 'This request may already have been sent. Check your chats before editing and sending again.'
export class HomeSubmitStateError extends Error {
  constructor(readonly accepted: boolean) {
    super(accepted ? 'Your message was accepted, but its saved Home draft could not be cleared. Do not send it again.'
      : HOME_SUBMIT_REVIEW_COPY)
  }
}

export function reportHomeActionError(error: unknown, fallback: string): void {
  if (error instanceof HomeSubmitStateError) notify({ kind: 'warning', title: error.accepted ? 'Message accepted' : 'Check your chats', message: error.message })
  else notifyError(error, fallback)
}

export function isHomeSubmitting(owner: DraftOwner, source: HomeDraftSource): boolean {
  return readHomeDraft(owner).delivery === 'submitting' && currentDraftTextRevision(homeDraftScope(), owner) === source.revision
}

function markSubmitting(owner: DraftOwner, source: HomeDraftSource): void {
  assertHomeSource(owner, source)
  const saved = readHomeDraft(owner)
  if (currentDraftTextRevision(homeDraftScope(), owner) !== source.revision) throw new Error('Home changed before sending. Your newer words were retained.')
  if (saved.delivery) throw new HomeSubmitStateError(false)
  stashHomeSessionDraft({ scope: homeDraftScope(), owner, ...saved, delivery: 'submitting' })
  if (quoteSessionDraftText(homeDraftScope(), owner)?.revision !== source.revision) throw new Error('The send checkpoint could not be saved. No message was sent.')
  noteHomeDraftChange()
}

/** Persist ambiguity before the first request; cleanup failure never restores retry-safe unsent status. */
export async function submitHomeOnce(captured: { owner: DraftOwner; source: HomeDraftSource }, submit: () => Promise<unknown>): Promise<void> {
  markSubmitting(captured.owner, captured.source)
  try { await submit() } catch { throw new HomeSubmitStateError(false) }
  const current = currentDraftTextRevision(homeDraftScope(), captured.owner)
  if (current !== captured.source.revision) return // A later edit is not this send's source.
  try { if (!consumeHomeDraft(captured.owner, captured.source)) throw new HomeSubmitStateError(true) }
  catch { throw new HomeSubmitStateError(true) }
}
