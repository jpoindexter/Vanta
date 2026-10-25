import { z } from 'zod'

import { failureSurface, isFailureStop } from './run-stop'

// This is a display projection, not a receipt export. Strip all other fields,
// including events, traces, and unknown checkpoint keys. Oversized or malformed
// recovery metadata must not become runnable controls; the reply still renders.
const savedFailureSchema = z.object({
  actions: z.array(z.string().max(64)).max(16).default([]),
  checkpoint: z
    .object({
      instruction: z.string().max(1024 * 1024),
      partialText: z
        .string()
        .max(1024 * 1024)
        .optional()
    })
    .optional(),
  failureKind: z
    .enum(['setup', 'provider_auth', 'tool', 'model', 'model_mismatch', 'user_denied', 'interrupted', 'unknown'])
    .optional(),
  status: z.literal('failed'),
  stoppedReason: z
    .enum(['done', 'blocked', 'max_iterations', 'repeated_failure', 'interrupted', 'soft_stopped', 'tool_budget'])
    .optional()
})

/** An additive failure marker on the same assistant row, never a later system notice. */
export function savedRunFailure(receipt: unknown) {
  const parsed = savedFailureSchema.safeParse(receipt)

  if (!parsed.success || parsed.data.failureKind === 'provider_auth') {
    return {}
  }

  if (parsed.data.stoppedReason && !isFailureStop(parsed.data.stoppedReason)) {
    return {}
  }

  const { surface, stop } = failureSurface(
    {
      finalText: '',
      receipt: parsed.data,
      stoppedReason: parsed.data.stoppedReason
    },
    ''
  )

  return {
    display_kind: 'failed_run',
    display_metadata: { error: stop.code, error_surface: surface }
  }
}
