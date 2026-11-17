import { type RefObject, useEffect } from 'react'
import { isFreshDraftScope, stashSessionDraft, type ComposerAttachmentScope } from '@/store/composer'
import { isBrowsingHistory } from '@/store/composer-input-history'
import { onUpdateDraftFlush } from '@/store/update-draft-flush'
import type { DraftOwner } from '../../../../../../shared/src/vanta/draft-custody'
import type { QueueEditState } from '../composer-utils'

interface DraftExitFlush {
  scope: RefObject<string | null>
  editing: RefObject<QueueEditState | null>
  session: RefObject<string | null | undefined>
  owner: RefObject<DraftOwner | undefined>
  pending: RefObject<{ scope: string | null; text: string; owner?: DraftOwner } | null>
  attachments: ComposerAttachmentScope
  text: () => string
}

/** Reload skips React cleanup; explicit update preparation needs the same synchronous final-keystroke save. */
export function useDraftExitFlush(deps: DraftExitFlush): void {
  useEffect(() => {
    const flush = () => {
      const scope = deps.scope.current, editing = deps.editing.current
      if ((editing && (editing.sessionKey === scope || (!editing.sessionKey && isFreshDraftScope(scope)))) || isBrowsingHistory(deps.session.current)) return
      const text = deps.text(); deps.pending.current = null
      const owner = deps.owner.current
      if (owner) stashSessionDraft(scope, text, deps.attachments.$attachments.get(), owner)
    }
    const offUpdate = onUpdateDraftFlush(() => {
      if (deps.editing.current || isBrowsingHistory(deps.session.current)) throw new Error('Finish editing the queued message or leave message history before updating.')
      flush()
    })
    window.addEventListener('pagehide', flush)
    return () => { offUpdate(); window.removeEventListener('pagehide', flush); flush() }
  }, [deps.text])
}
