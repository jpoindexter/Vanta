import { atom } from 'nanostores'
import type { DraftOwner } from '../../../../../shared/src/vanta/draft-custody'
import { draftAddress } from '../../../../../shared/src/vanta/draft-custody'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { selectFreshDraftKey } from '@/store/fresh-draft-scope'
import { rememberedFreshDraft } from '@/store/fresh-draft-history'
import { currentDraftTextRevision, stashSessionDraft } from '@/store/session-draft-state'
import { closeHome } from '@/store/home-view'

export interface HomeAttachmentHandoff {
  id: string
  owner: DraftOwner
  text: string
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
  const resuming = rememberedFreshDraft(owner) === key || currentDraftTextRevision(key, owner) !== undefined
  if (!resuming) stashSessionDraft(key, request.text, [], owner)
  selectFreshDraftKey(key, owner)
  startFresh({ rotateFreshDraftKey: false })
  closeHome()
  $homeAttachmentHandoff.set({ ...request, owner: { ...owner } })
}
