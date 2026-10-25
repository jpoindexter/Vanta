import { branchGroupForUser, type ChatMessage, chatMessageText } from '@/lib/chat-messages'

import { isFailedUserTurn, visibleUserOrdinal } from './utils'

export interface ReloadPlan {
  branchGroupId: string
  /** True only after the user confirmed a reload that archives later user turns. */
  confirmDeepTruncate: boolean
  /** Original persisted text of the turn — the durable-row-id content key. */
  sourceText: string
  text: string
  truncateOrdinal: number | undefined
  truncateMessageId?: string
  truncateRowId?: number
  userIndex: number
}

function recoveryInstruction(message: ChatMessage | undefined): string | undefined {
  const recovery = message?.errorSurface?.recovery
  return recovery?.actions.includes('retry_failed_step') ? recovery.checkpoint?.instruction.trim() : undefined
}

function reloadUserIndex(messages: ChatMessage[], parentIndex: number): number {
  if (parentIndex < 0) return -1
  const instruction = recoveryInstruction(messages[parentIndex])

  // The receipt binds the request. Internal user-role nudges are not a new human request.
  return messages.findLastIndex((message, index) => index <= parentIndex && message.role === 'user'
    && (!instruction || (message.sourceText ?? chatMessageText(message)).trim() === instruction))
}

function reloadAddress(messages: ChatMessage[], userIndex: number) {
  // A user message that never reached the gateway has no safe truncation address.
  const failed = isFailedUserTurn(messages, userIndex)
  const user = messages[userIndex]

  return {
    truncateOrdinal: failed ? undefined : visibleUserOrdinal(messages, userIndex),
    truncateMessageId: failed ? undefined : user.id,
    truncateRowId: failed ? undefined : user.rowId
  }
}

/** The receipt-bound request for recovery, or the ordinary preceding user turn for regenerate. */
export function planReload(messages: ChatMessage[], parentId: null | string): null | ReloadPlan {
  const parentIndex = parentId ? messages.findIndex(m => m.id === parentId) : messages.length - 1
  const userIndex = reloadUserIndex(messages, parentIndex)
  if (userIndex < 0) return null
  const user = messages[userIndex]
  if (!user) return null
  const text = (recoveryInstruction(messages[parentIndex]) ?? chatMessageText(user)).trim()
  if (!text) return null
  const target = parentId && messages[parentIndex]?.role === 'assistant'
    ? messages[parentIndex] : messages.slice(userIndex + 1).find(m => m.role === 'assistant')

  return {
    branchGroupId: target?.branchGroupId ?? branchGroupForUser(user),
    confirmDeepTruncate: false,
    sourceText: text,
    text,
    ...reloadAddress(messages, userIndex),
    userIndex
  }
}
