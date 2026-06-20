// In-progress hook indicator. PURE — no I/O. Surfaces a one-line "still running"
// note WHILE a hook is executing (before it finishes), so a slow hook isn't
// invisible, then resolves that line on completion. Observational only: it never
// changes a hook's behavior, exit code, or result.
//
// Distinct from hook-timing.ts: that note is POST-completion (a hook took Nms);
// this is the IN-PROGRESS message (a hook is running NOW), resolved when done.

/** Elapsed-ms threshold a hook must exceed BEFORE its progress line is shown. */
export const DEFAULT_HOOK_PROGRESS_MS = 300;

/**
 * Resolve the in-progress threshold (ms) from the environment, falling back to
 * DEFAULT_HOOK_PROGRESS_MS. A missing, non-numeric, or negative value uses the
 * default; 0 surfaces every hook's progress (no silent floor).
 */
export function resolveHookProgressMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = parseInt(env.VANTA_HOOK_PROGRESS_MS ?? "", 10);
  return isNaN(raw) || raw < 0 ? DEFAULT_HOOK_PROGRESS_MS : raw;
}

/**
 * True when a still-running hook should surface its progress line: strictly
 * greater than the threshold. At or under the threshold stays silent, so an
 * instant hook never spams a progress line. `thresholdMs` defaults to the
 * env-resolved value (default 300).
 */
export function shouldShowProgress(
  elapsedSoFarMs: number,
  thresholdMs: number = resolveHookProgressMs(),
): boolean {
  return elapsedSoFarMs > thresholdMs;
}

/** The in-progress one-liner: which event + hook type is running right now. */
export function buildHookProgressNote(event: string, type: string): string {
  return `⧗ running ${event} hook (${type})…`;
}

/** The resolved line once the in-progress hook completes: event + type + elapsed. */
export function buildHookProgressDone(event: string, type: string, elapsedMs: number): string {
  return `✔ ${event} hook (${type}) done in ${Math.round(elapsedMs)}ms`;
}
