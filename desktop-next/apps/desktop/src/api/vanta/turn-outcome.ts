import type { UsagePayload } from './schemas'

export type TurnStatus = 'complete' | 'error' | 'interrupted'

/** Why a turn failed, when the renderer needs more than the sentence (a provider that must be reconnected). */
export type FailureKind = 'provider_auth'

export interface TurnOutcome {
  error?: string
  failureKind?: FailureKind
  status: TurnStatus
}

/** The provider refused the saved credential (an expired or revoked key). The request is kept; reconnecting resumes it. */
export const PROVIDER_AUTH_TEXT = 'The model provider rejected the saved key. Reconnect it and Vanta resumes your request.'

const STOP_TEXT: Record<string, string> = {
  context_length: 'Task stopped because the context limit was reached.',
  max_iterations: 'Task stopped at the iteration safety limit.',
  repeated_failure: 'Task stopped after repeated failures.',
  tool_budget: 'Task stopped at the tool-call safety limit.'
}

/** Vanta `stoppedReason` to the Hermes `message.complete` status. Unknown reasons are failures, not silent successes. */
export function outcomeForStop(reason: string | undefined): TurnOutcome {
  if (reason === undefined || reason === 'done') {
    return { status: 'complete' }
  }

  if (reason === 'interrupted' || reason === 'soft_stopped') {
    return { status: 'interrupted' }
  }

  if (reason === 'provider_auth') {
    return { error: PROVIDER_AUTH_TEXT, failureKind: 'provider_auth', status: 'error' }
  }

  return { error: STOP_TEXT[reason] ?? 'Task stopped before completion.', status: 'error' }
}

export function usagePayload(usage: UsagePayload | undefined): null | Record<string, number> {
  if (!usage) {
    return null
  }

  const input = usage.inputTokens ?? 0
  const output = usage.outputTokens ?? 0

  return { completion: output, input, output, prompt: input, total: input + output }
}
