import type { ChatResult, RunReceipt } from './schemas'

// A run that failed or stopped early. The server names why (`stoppedReason`, `receipt.failureKind`) and offers
// saved recovery actions with a checkpoint; this turns that into one plain sentence per reason and the
// descriptor the error card reads. Words are Vanta's; the card shows them as its headline and body.

export const RECOVERY_ACTIONS = ['retry_failed_step', 'edit_request', 'start_from_checkpoint'] as const

export type RecoveryAction = (typeof RECOVERY_ACTIONS)[number]

export interface RunCheckpoint {
  instruction: string
  partialText?: string
}

export interface RunRecovery {
  actions: RecoveryAction[]
  checkpoint?: RunCheckpoint
}

export interface StopDescription {
  code: string
  headline: string
  message: string
}

const KEPT = 'What it finished is kept above.'

const BY_REASON: Record<string, Omit<StopDescription, 'code'>> = {
  blocked: { headline: 'Vanta is blocked', message: 'A step cannot go on until you decide what to do.' },
  context_length: { headline: 'The conversation is too long', message: "The model's context limit was reached." },
  max_iterations: {
    headline: 'Vanta reached its step limit',
    message: 'This request needed more steps than one run allows.'
  },
  repeated_failure: {
    headline: 'Vanta stopped: the same step kept failing',
    message: 'It repeated the same step without making progress, so it stopped instead of looping.'
  },
  tool_budget: {
    headline: 'Vanta reached its tool-call limit',
    message: 'It used every tool call allowed in one run.'
  }
}

const BY_FAILURE: Record<string, Omit<StopDescription, 'code'>> = {
  model: {
    headline: 'The model did not finish',
    message: 'The model or its provider failed (network, rate limit or timeout).'
  },
  model_mismatch: {
    headline: 'The model does not match this chat',
    message: 'Pick the model this chat used, or start from the checkpoint with the current one.'
  },
  setup: { headline: 'Vanta setup is incomplete', message: 'A required setting is missing. Finish setup, then try again.' },
  tool: { headline: 'A tool failed', message: 'A tool this task needed failed, so the run stopped.' },
  user_denied: {
    headline: 'A needed action was not approved',
    message: 'The run stopped because an action it needed was declined.'
  }
}

const UNKNOWN = { headline: 'The run stopped before it finished', message: 'Vanta did not report why.' }

/** Reasons that end a run without a result and are not a user stop or the provider reconnect card. */
const NOT_FAILURES = new Set(['done', 'interrupted', 'soft_stopped', 'provider_auth'])

export function isFailureStop(reason: string | undefined): boolean {
  return reason !== undefined && !NOT_FAILURES.has(reason)
}

/** One sentence pair per reason. A generic `failed` reason is told apart by the receipt's failure kind. */
export function describeStop(reason: string | undefined, failureKind: string | undefined, hasPartial: boolean): StopDescription {
  const byReason = reason ? BY_REASON[reason] : undefined
  const byKind = failureKind ? BY_FAILURE[failureKind] : undefined
  const found = byReason ?? byKind ?? UNKNOWN
  const code = byReason ? reason! : byKind ? failureKind! : 'unknown'

  return { code, headline: found.headline, message: hasPartial ? `${found.message} ${KEPT}` : found.message }
}

/** The recovery the server saved for this run. Without a receipt (an older server) all three are offered over the last request. */
export function recoveryOf(receipt: RunReceipt | undefined, lastRequest: string): RunRecovery {
  if (!receipt) {
    return { actions: [...RECOVERY_ACTIONS], ...(lastRequest ? { checkpoint: { instruction: lastRequest } } : {}) }
  }

  const known = new Set<string>(RECOVERY_ACTIONS)

  return {
    actions: receipt.actions.filter((action): action is RecoveryAction => known.has(action)),
    ...(receipt.checkpoint ? { checkpoint: receipt.checkpoint } : {})
  }
}

/** The descriptor the card reads (`layer: runtime`, a code per reason) plus the recovery the buttons act on. */
export function failureSurface(chat: ChatResult, lastRequest: string): { partial: boolean; stop: StopDescription; surface: Record<string, unknown> } {
  const partial = Boolean(chat.receipt?.checkpoint?.partialText?.trim())
  const stop = describeStop(chat.stoppedReason, chat.receipt?.failureKind, partial)

  return {
    partial,
    stop,
    surface: {
      code: stop.code,
      headline: stop.headline,
      layer: 'runtime',
      message: stop.message,
      recovery: recoveryOf(chat.receipt, lastRequest),
      retryable: true
    }
  }
}
