import { type RefObject, useLayoutEffect } from 'react'

import type { DraftOwner } from '../../../../../../shared/src/vanta/draft-custody'
import { adoptGoneSessionDraft, adoptNewSessionDraft, type ComposerAttachment, freshDraftScope, isFreshDraftScope, takeSessionDraft } from '@/store/composer'
import { isBrowsingHistory } from '@/store/composer-input-history'
import { clearDraftSuggestions } from '@/store/composer-suggestions'
import type { QueueEditState } from '../composer-utils'
import { initializeFreshDraftOwner } from '@/store/fresh-draft-scope'

interface DraftScopeContext {
  activeQueueSessionKey: string | null
  owner: DraftOwner | undefined
  draftScopeRef: RefObject<string | null>
  draftTextOwnerRef: RefObject<DraftOwner | undefined>
  draftPersistTimerRef: RefObject<number | undefined>
  pendingDraftPersistRef: RefObject<{ scope: string | null; text: string; owner?: DraftOwner } | null>
  queueEditStateRef: RefObject<QueueEditState | null>
  sessionId: string | null | undefined
  sessionIdRef: RefObject<string | null | undefined>
  syncDraftFromEditor: () => string
  stashAt: (scope: string | null, text?: string, attachments?: ComposerAttachment[]) => void
  loadIntoComposer: (text: string, attachments: ComposerAttachment[], scopeChanged?: boolean) => void
}

function adoptAssignedDraft(context: DraftScopeContext): void {
  const { owner, activeQueueSessionKey, draftScopeRef } = context
  if (!owner) return
  if ((isFreshDraftScope(draftScopeRef.current) || !draftScopeRef.current) && activeQueueSessionKey) {
    adoptNewSessionDraft(activeQueueSessionKey, owner)
  } else if (!activeQueueSessionKey) {
    adoptGoneSessionDraft(owner)
  }
}

function stashLeavingDraft(context: DraftScopeContext, loadedScope: string): void {
  const latestText = context.syncDraftFromEditor()
  const editing = context.queueEditStateRef.current
  if (editing?.sessionKey === context.activeQueueSessionKey) {
    context.stashAt(loadedScope, editing.draft, editing.attachments)
  } else if (!isBrowsingHistory(context.sessionId)) {
    context.stashAt(loadedScope, latestText)
  }
  clearDraftSuggestions(context.sessionIdRef.current)
}

/** Swap before paint: otherwise a fast Enter can submit the previous chat's images (#59305).
 * Assignment follows the announced stored key, never a later runtime ID; cleanup retains its
 * captured writer so a pending navigation render cannot move words to another owner (#54527). */
export function useSessionDraftScope(context: DraftScopeContext): void {
  const { activeQueueSessionKey, owner } = context
  const ownerKey = JSON.stringify(owner ?? null)
  useLayoutEffect(() => {
    const fresh = !activeQueueSessionKey || (isFreshDraftScope(activeQueueSessionKey) && activeQueueSessionKey === freshDraftScope())
    const loadedScope = fresh && owner ? initializeFreshDraftOwner(owner) : activeQueueSessionKey || freshDraftScope()
    window.clearTimeout(context.draftPersistTimerRef.current)
    context.pendingDraftPersistRef.current = null
    adoptAssignedDraft(context)
    context.draftScopeRef.current = loadedScope
    context.draftTextOwnerRef.current = owner
    const saved = owner ? takeSessionDraft(loadedScope, owner) : { text: '', attachments: [] }
    context.loadIntoComposer(saved.text, saved.attachments, true)
    return () => stashLeavingDraft(context, loadedScope)
  }, [activeQueueSessionKey, ownerKey])
}
