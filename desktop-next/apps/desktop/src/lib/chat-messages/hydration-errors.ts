import { parseErrorSurface } from '@/lib/error-surface'
import type { SessionMessage } from '@/types/desktop'

import type { ChatMessage, ChatMessagePart } from './types'

// Older remote backends serve metadata as JSON text. A primitive is not a record.
export function parseDisplayMetadata(metadata: SessionMessage['display_metadata']): null | Record<string, unknown> {
  let parsed: unknown = metadata

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }

  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
}

type HydratedFailure = Pick<ChatMessage, 'error' | 'errorSurface'>

export function failedTurnError(metadata: SessionMessage['display_metadata']): null | HydratedFailure {
  const parsed = parseDisplayMetadata(metadata)
  const errorSurface = parseErrorSurface(parsed?.error_surface)

  if (!errorSurface) {
    return null
  }

  const error = typeof parsed?.error === 'string' && parsed.error.trim() ? parsed.error : errorSurface.code

  return { error, errorSurface }
}

export function savedMessageFailure(message: SessionMessage): null | HydratedFailure {
  return message.role === 'assistant' && message.display_kind === 'failed_run'
    ? failedTurnError(message.display_metadata)
    : null
}

export function isToolOnlyAssistant(
  message: SessionMessage,
  parts: ChatMessagePart[],
  failure: null | HydratedFailure
): boolean {
  return message.role === 'assistant' && !failure && parts.length > 0 && parts.every(part => part.type === 'tool-call')
}

export function canFoldAssistant(
  active: null | ChatMessage,
  parts: ChatMessagePart[],
  failure: null | HydratedFailure
): active is ChatMessage {
  return Boolean(
    active &&
    !active.error &&
    !failure &&
    (parts.some(part => part.type === 'tool-call') || active.parts.some(part => part.type === 'tool-call'))
  )
}

/** Keep legacy machine-notice behavior separate from Vanta's same-row failure. */
export function appendFailedTurn(result: ChatMessage[], message: SessionMessage, index: number): void {
  const failure = message.display_kind === 'failed_turn' ? failedTurnError(message.display_metadata) : null

  if (failure) {
    result.push({
      id: `${message.timestamp || Date.now()}-${index}-failed-turn-error`,
      role: 'assistant',
      parts: [],
      pending: false,
      serverRowSpan: 0,
      ...failure,
      ...(message.timestamp ? { timestamp: message.timestamp } : {})
    })
  }
}
