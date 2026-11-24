/**
 * The one status the titlebar pill shows for the focused chat.
 *
 * Pure so every branch is testable: offline beats everything (nothing else is
 * true while the backend is away), then the blocking states, running, and
 * finally the settled ones. A chat nothing was sent to has no status at all.
 */

import type { ConnectionState } from '@vanta/shared'

export type PillStatus = 'done' | 'failed' | 'needs-input' | 'offline' | 'running' | 'waiting'

export interface PillInput {
  gateway: ConnectionState
  /** The focused chat's runtime flags; undefined before it is bound. */
  state?: {
    busy: boolean
    hasError: boolean
    hasMessages: boolean
    needsInput: boolean
  }
  /** A pending approval (as opposed to a question) is what blocks the chat. */
  approvalPending: boolean
}

/** Closed or errored means the backend is away; idle and connecting are boot. */
const isOffline = (gateway: ConnectionState): boolean => gateway === 'closed' || gateway === 'error'

export function pillStatusFor({ approvalPending, gateway, state }: PillInput): PillStatus | null {
  if (isOffline(gateway)) {
    return 'offline'
  }

  if (!state) {
    return null
  }

  if (state.needsInput) {
    return approvalPending ? 'waiting' : 'needs-input'
  }

  if (state.busy) {
    return 'running'
  }

  if (state.hasError) {
    return 'failed'
  }

  return state.hasMessages ? 'done' : null
}

/** m:ss for the running pill. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = String(total % 60).padStart(2, '0')

  return `${Math.floor(total / 60)}:${seconds}`
}
