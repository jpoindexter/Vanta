import { atom } from 'nanostores'
import type { DraftOwner } from '../../../../../shared/src/vanta/draft-custody'
import { assertHomeOwner, assertHomeSource, type HomeDraftSource } from './home-draft'
import { freshDraftWindowScope } from '@/store/fresh-draft-history'
import { HomeSubmitStateError, isHomeSubmitting } from './home-submit-state'

export const homeActionKey = (owner: DraftOwner, window: string) => JSON.stringify([window, owner.connectionId, owner.profile])
export const $homeDraftBusy = atom<Record<string, string>>({})
const inFlight = new Map<string, Promise<void>>()

/** One actual action per Home scope; later edits remain a different, unconsumed source revision. */
export interface HomeActionScope { owner: DraftOwner | undefined; window: string }
type Captured = { owner: DraftOwner; source: HomeDraftSource }
export function runHomeDraftAction(scope: HomeActionScope, capture: () => Captured, action: (captured: Captured) => Promise<void>): Promise<void> {
  if (!scope.owner || scope.window !== freshDraftWindowScope()) throw new Error('The Home destination changed. Your saved words were retained.')
  assertHomeOwner(scope.owner)
  const key = homeActionKey(scope.owner, scope.window)
  const pending = inFlight.get(key)
  if (pending) return pending
  const captured = capture()
  if (captured.owner.connectionId !== scope.owner.connectionId || captured.owner.profile !== scope.owner.profile || captured.source.window !== scope.window) throw new Error('The Home capture changed destination. Your saved words were retained.')
  assertHomeSource(captured.owner, captured.source)
  if (isHomeSubmitting(captured.owner, captured.source)) throw new HomeSubmitStateError(false)
  const request = Promise.resolve().then(() => action(captured)).finally(() => {
    if (inFlight.get(key) !== request) return
    inFlight.delete(key)
    const next = { ...$homeDraftBusy.get() }; delete next[key]; $homeDraftBusy.set(next)
  })
  inFlight.set(key, request)
  $homeDraftBusy.set({ ...$homeDraftBusy.get(), [key]: captured.source.revision })
  return request
}
