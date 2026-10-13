import type { UsagePayload } from './schemas'

export type TurnStatus = 'complete' | 'error' | 'interrupted'

export interface TurnOutcome {
  error?: string
  status: TurnStatus
}

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
