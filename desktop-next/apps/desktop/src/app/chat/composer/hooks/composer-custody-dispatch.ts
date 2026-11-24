import { currentDraftTextRevision, isFreshDraftScope } from '@/store/composer'
import type { CustodyReservation } from '@/store/draft-custody-client'
import { attachDraftRecovery } from '@/store/draft-custody-registry'
import { runCustodiedSubmit } from '@/store/draft-custody-submit'
import { assertDraftDispatchOwner } from '@/store/draft-dispatch-owner'
import type { useComposerScope } from '../scope'
import type { UseComposerSubmitArgs } from './use-composer-submit'

interface ReservedDispatch extends Pick<UseComposerSubmitArgs,
  'onSubmit' | 'sessionId' | 'draftScopeRef' | 'draftRef' | 'custodyRef' | 'clearDraft' | 'stashAt'> {
  reservation: CustodyReservation
  text: string
  actualScope: string | null
  submittedScope: string | null
  assignedScope: () => string | undefined
  assignment: { onComposerScopeAssigned?: (scope: string) => void }
  attachments: ReturnType<typeof useComposerScope>['attachments']
}

function consumeReservedDraft(options: ReservedDispatch): boolean | void {
  const { reservation, actualScope, text } = options
  if ((options.draftScopeRef.current || reservation.client.address.session) !== actualScope ||
    options.custodyRef?.current !== reservation.client) return false
  if (options.draftRef.current === text && (!reservation.textQuote ||
    currentDraftTextRevision(actualScope, reservation.client.address.owner) === reservation.textQuote.revision)) {
    options.clearDraft()
    options.stashAt(actualScope, '', [])
  }
  const ids = new Set(reservation.attachments.map(item => item.occurrenceId || item.id))
  options.attachments.$attachments.set(options.attachments.$attachments.get()
    .filter(item => !ids.has(item.occurrenceId || item.id)))
}

/** Bind owner and revision to this send; late cleanup cannot consume a newer draft. */
export function dispatchReservedComposer(options: ReservedDispatch): void {
  const { reservation, actualScope, submittedScope } = options
  void runCustodiedSubmit(reservation, (payload, callbacks) => options.onSubmit(options.text, {
    attachments: payload,
    composerScope: submittedScope,
    ...(!isFreshDraftScope(actualScope) && actualScope ? { storedSessionId: actualScope, sessionId: options.sessionId } : {}),
    ...options.assignment,
    ...callbacks,
    onDispatchStarted: async () => {
      await assertDraftDispatchOwner(options.assignedScope() || submittedScope, reservation.client.address.owner)
      callbacks.onDispatchStarted?.()
    }
  }), () => consumeReservedDraft(options)).then(outcome => {
    const assigned = options.assignedScope()
    if (assigned && (outcome !== 'accepted' || reservation.client.snapshot()?.pendingSend)) {
      attachDraftRecovery(reservation.client, assigned)
    }
  })
}
