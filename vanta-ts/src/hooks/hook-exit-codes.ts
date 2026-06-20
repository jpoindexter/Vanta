// Hook exit-code semantics. PURE — no I/O. The single place that decides what a
// command/shell hook's exit code MEANS:
//
//   exit 0       → success, silent (nothing surfaced)
//   exit 2       → BLOCK the action; the hook's stderr is fed back TO THE MODEL
//                  (so the agent sees why and can self-correct)
//   any other ≠0 → non-blocking; the hook's stderr is surfaced TO THE USER
//                  (informational; the action still proceeds)
//
// stderr is the canonical message channel for every non-zero exit. An empty
// stderr means there is simply no message to surface (the field is omitted),
// never an error.

/** The canonical exit code a hook returns to BLOCK an action. */
export const HOOK_BLOCK_EXIT_CODE = 2;

export type HookExitInterpretation = {
  /** True only for exit code 2 — the action must not proceed. */
  block: boolean;
  /** Hook stderr fed back to the model. Present only for a blocking (code 2) exit with a non-empty stderr. */
  toModel?: string;
  /** Hook stderr surfaced to the user. Present only for a non-blocking, non-zero exit with a non-empty stderr. */
  toUser?: string;
  /** True only for exit code 0 — nothing to surface. */
  silent: boolean;
};

/**
 * Interpret a command/shell hook's exit code into a routing decision.
 * Pure: deterministic in `(code, stdout, stderr)`, no side effects.
 *
 * stdout is accepted for signature symmetry with the hook-result shape but is
 * not part of the exit-code contract — only the code and stderr decide routing.
 */
export function interpretHookExit(code: number, _stdout: string, stderr: string): HookExitInterpretation {
  if (code === 0) return { block: false, silent: true };

  const message = stderr.trim();
  if (code === HOOK_BLOCK_EXIT_CODE) {
    return message
      ? { block: true, silent: false, toModel: message }
      : { block: true, silent: false };
  }

  // Any other non-zero code: non-blocking, surfaced to the user.
  return message
    ? { block: false, silent: false, toUser: message }
    : { block: false, silent: false };
}
