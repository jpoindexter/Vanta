import { atom } from 'nanostores'
import type { DraftOwner } from '../../../../../shared/src/vanta/draft-custody'
import { draftAddress } from '../../../../../shared/src/vanta/draft-custody'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { selectFreshDraftKey } from '@/store/fresh-draft-scope'
import { rememberedFreshDraft } from '@/store/fresh-draft-history'
import { currentDraftTextRevision, quoteSessionDraftText, stashSessionDraft } from '@/store/session-draft-state'
import { closeHome } from '@/store/home-view'
import { assertHomeDraftCapacity, assertHomeSource, consumeHomeDraft, type HomeDraftSource } from './home-draft'

export interface HomeAttachmentHandoff {
  id: string
  owner: DraftOwner
  text: string
  source?: HomeDraftSource
}

export const $homeAttachmentHandoff = atom<HomeAttachmentHandoff | null>(null)
export const homeAttachmentDraftKey = (id: string): string => {
  if (!/^[a-z0-9-]{1,120}$/i.test(id)) throw new Error('The attachment draft identity is invalid.')
  return `__new__:home-${id}`
}

export function sameDraftOwner(owner: DraftOwner, current = captureDraftCustodyOwner(null)): boolean {
  return current?.connectionId === owner.connectionId && current.profile === owner.profile
}

/** Establish a fresh owner/key before any picker or attachment action. No session or turn is created. */
export function prepareHomeAttachmentDraft(
  request: HomeAttachmentHandoff,
  startFresh: (options: { rotateFreshDraftKey: boolean }) => void
): void {
  const key = homeAttachmentDraftKey(request.id)
  const owner = draftAddress({ owner: request.owner, session: key }).owner
  if (!sameDraftOwner(owner)) throw new Error('The attachment destination changed. Your request was retained.')
  if (request.source) assertHomeSource(owner, request.source)
  const resuming = rememberedFreshDraft(owner) === key || currentDraftTextRevision(key, owner) !== undefined
  if (!resuming) {
    if (request.text.trim()) assertHomeDraftCapacity(owner, key)
    stashSessionDraft(key, request.text, [], owner)
  }
  if (!quoteSessionDraftText(key, owner)) throw new Error('The new chat words could not be saved. Your Home draft was retained.')
  selectFreshDraftKey(key, owner)
  if (rememberedFreshDraft(owner) !== key) throw new Error('The new chat location could not be saved. Your Home draft was retained.')
  if (request.source) consumeHomeDraft(owner, request.source)
  startFresh({ rotateFreshDraftKey: false })
  closeHome()
  $homeAttachmentHandoff.set({ ...request, owner: { ...owner } })
}
