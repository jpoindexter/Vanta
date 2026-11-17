/**
 * Shell status vocabulary: the one status a session shows in the sidebar row,
 * the titlebar pill and the "Needs you" group, so they cannot disagree.
 *
 * It reads the same stores the transcript's cards read: pending approvals
 * (`$approvalRequests`), pending clarify questions (`$clarifyRequests`) and the
 * per-session `needsInput` / `busy` flags, folded onto the existing dot state.
 * Nothing here invents a status the runtime did not report.
 */

import { computed } from 'nanostores'

import { stableRecord } from '@/lib/stable-array'
import { $approvalRequests } from '@/store/prompts'
import { $sessions, lineageAliases } from '@/store/session'
import type { SessionDotState } from '@/store/session-dot-state'
import { $sessionStates } from '@/store/session-states'

export type ShellStatus = 'done' | 'draft' | 'failed' | 'needs-input' | 'running' | 'waiting'

/** What a session is blocked on, or that its last turn failed. */
export type SessionFact = 'approval' | 'failed' | 'input'

const RUNNING_DOTS: ReadonlySet<SessionDotState> = new Set(['background', 'stalled', 'working'])

/** Statuses that need the human: they populate "Needs you" and the count badge. */
export const isNeedsYouStatus = (status: ShellStatus): boolean => status === 'waiting' || status === 'needs-input'

export function shellStatusFor(dot: SessionDotState | undefined, fact: SessionFact | undefined): ShellStatus {
  if (fact === 'approval') {
    return 'waiting'
  }

  if (fact === 'input' || dot === 'needs-input') {
    return 'needs-input'
  }

  if (dot && RUNNING_DOTS.has(dot)) {
    return 'running'
  }

  if (fact === 'failed') {
    return 'failed'
  }

  return dot === 'draft' ? 'draft' : 'done'
}

let facts: Readonly<Record<string, SessionFact>> = {}

/** Per stored-session-id fact, published under every alias of the conversation
 *  (compression rotates the stored id, see `lineageAliases`). Stable across
 *  stream deltas: it only changes when a prompt or a failure appears/clears. */
export const $sessionFacts = computed(
  [$sessionStates, $sessions, $approvalRequests],
  (states, sessions, approvals) => {
    const next: Record<string, SessionFact> = {}

    for (const [runtimeId, state] of Object.entries(states)) {
      let fact: SessionFact | undefined

      if (state.needsInput) {
        fact = approvals[runtimeId] ? 'approval' : 'input'
      } else if (!state.busy && state.messages.at(-1)?.error) {
        fact = 'failed'
      }

      if (!fact) {
        continue
      }

      for (const alias of lineageAliases(state.storedSessionId ?? runtimeId, sessions)) {
        next[alias] = fact
      }
    }

    return (facts = stableRecord(facts, next) as Record<string, SessionFact>)
  }
)
