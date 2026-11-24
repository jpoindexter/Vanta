import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo } from 'react'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { $connection, $gatewayState } from '@/store/session'
import { $activeGatewayProfile, $newChatProfile, $newChatRoute, $newChatConnectionId } from '@/store/profile'
import { notifyError } from '@/store/notifications'
import { freshDraftWindowScope } from '@/store/fresh-draft-history'
import { $homeDraftRevision, captureHomeDraft, readHomeDraft, saveHomeDraft, type HomeDraftValue } from './home-draft'
import { $homeDraftBusy, homeActionKey } from './home-draft-action'
import { HOME_SUBMIT_REVIEW_COPY } from './home-submit-state'
import { $activeGatewayRoute, $gateway } from '@/store/gateway'
import { useStoresSelector } from '@/lib/use-session-slice'
import type { DraftOwner } from '../../../../../shared/src/vanta/draft-custody'

/** No cached owner: each Home binding follows the same current route as session.create. */
function useHomeOwner() {
  const identity = useStoresSelector([$connection, $activeGatewayProfile, $newChatProfile, $newChatRoute,
    $newChatConnectionId, $gateway, $activeGatewayRoute, $gatewayState], () => {
    const owner = captureDraftCustodyOwner(null)
    return owner ? JSON.stringify(owner) : ''
  })
  return useMemo(() => identity ? JSON.parse(identity) as DraftOwner : undefined, [identity])
}

export function useHomeDraft() {
  const busy = useStore($homeDraftBusy)
  const revision = useStore($homeDraftRevision)
  const owner = useHomeOwner(), windowScope = freshDraftWindowScope()
  const key = JSON.stringify([windowScope, owner ?? null])
  const initial = useMemo<{ value: HomeDraftValue; error?: unknown }>(() => {
    try { return { value: owner ? readHomeDraft(owner) : { text: '', projectId: null } } }
    catch (error) { return { value: { text: '', projectId: null }, error } }
  }, [owner, windowScope, revision])
  useEffect(() => { if (initial.error) notifyError(initial.error, 'Could not restore Home words.') }, [initial])
  const capture = useCallback((value: HomeDraftValue) => {
    if (!owner) throw new Error('The Home destination is not ready. Your words were retained.')
    return captureHomeDraft(owner, value)
  }, [owner])
  const change = useCallback((value: HomeDraftValue) => {
    try {
      if (!owner) throw new Error('The Home destination is not ready.')
      saveHomeDraft(owner, value)
    } catch (error) { notifyError(error, 'Could not save Home words. Keep this window open.') }
  }, [owner])
  const scope = useMemo(() => ({ owner, window: windowScope }), [owner, windowScope])
  const pending = Boolean(owner && busy[homeActionKey(owner, freshDraftWindowScope())])
  const blocked = Boolean(initial.value.delivery) && !pending
  return { key, capture, scope, control: { initial: initial.value, change, available: Boolean(owner), blocked,
    attention: blocked ? HOME_SUBMIT_REVIEW_COPY : undefined,
    pending } }
}
