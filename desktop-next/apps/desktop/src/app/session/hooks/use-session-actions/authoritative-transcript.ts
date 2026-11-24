import { type ChatMessage, toChatMessages } from '@/lib/chat-messages'
import type { SessionMessage, SessionResumeResult } from '@/types/desktop'

import { reconcilePersistedLiveTurn } from './persisted-live-turn'
import { appendLiveSessionProjection, reconcileDurableHistory } from './utils'

export function reconcileAuthoritativeChatMessages(
  authoritativeMessages: ChatMessage[],
  previousMessages: ChatMessage[],
  liveProjection?: Pick<SessionResumeResult, 'inflight' | 'queued' | 'session_id'>,
  sourceRows?: SessionMessage[]
): ChatMessage[] {
  if (liveProjection && sourceRows) {
    const reconciled = reconcilePersistedLiveTurn(authoritativeMessages, previousMessages, sourceRows, liveProjection)

    if (reconciled) {
      return reconciled
    }
  }

  return reconcileDurableHistory(
    liveProjection ? appendLiveSessionProjection(authoritativeMessages, liveProjection) : authoritativeMessages,
    previousMessages
  )
}

export function reconcileAuthoritativeMessages(
  authoritativeMessages: SessionResumeResult['messages'],
  previousMessages: ChatMessage[],
  liveProjection?: Pick<SessionResumeResult, 'inflight' | 'queued' | 'session_id'>
): ChatMessage[] {
  return reconcileAuthoritativeChatMessages(
    toChatMessages(authoritativeMessages),
    previousMessages,
    liveProjection,
    authoritativeMessages
  )
}
