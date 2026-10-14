/** What the server saved for a run that failed or stopped early: the actions it offers and the request to resume from. */
export const RUN_RECOVERY_ACTIONS = ['retry_failed_step', 'edit_request', 'start_from_checkpoint'] as const

export type RunRecoveryAction = (typeof RUN_RECOVERY_ACTIONS)[number]

export interface RunRecovery {
  actions: RunRecoveryAction[]
  checkpoint?: { instruction: string; partialText?: string }
}

/** The recovery block of a wire error descriptor, or undefined when absent or garbled. */
export function parseRunRecovery(value: unknown): RunRecovery | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const raw = value as { actions?: unknown; checkpoint?: unknown }
  const known = new Set<string>(RUN_RECOVERY_ACTIONS)

  const actions = Array.isArray(raw.actions)
    ? raw.actions.filter((action): action is RunRecoveryAction => typeof action === 'string' && known.has(action))
    : []

  const checkpoint = raw.checkpoint as { instruction?: unknown; partialText?: unknown } | undefined

  const instruction = typeof checkpoint?.instruction === 'string' ? checkpoint.instruction : ''

  return {
    actions,
    ...(instruction
      ? {
          checkpoint: {
            instruction,
            ...(typeof checkpoint?.partialText === 'string' && checkpoint.partialText
              ? { partialText: checkpoint.partialText }
              : {})
          }
        }
      : {})
  }
}


/**
 * The message "Start from checkpoint" puts in the composer: the original request, plus what the run had
 * produced so it is not repeated. Ported from the previous renderer's checkpointPrompt.
 */
export function checkpointPrompt(recovery: RunRecovery): string {
  const instruction = recovery.checkpoint?.instruction ?? 'Continue from the saved checkpoint.'
  const partial = recovery.checkpoint?.partialText?.trim()

  return partial
    ? `Continue from this checkpoint and avoid repeating completed work. Original request: ${instruction}\n\nSaved partial output:\n${partial}`
    : `Continue from this checkpoint. Original request: ${instruction}`
}
