// Hook timing classification. PURE — no I/O. Decides whether a hook's run was
// slow enough to surface a one-line timing indicator, and formats that line.
// Observational only: it never changes a hook's behavior, exit code, or result.

/** Elapsed-ms threshold above which a hook's run is surfaced. */
export const DEFAULT_HOOK_TIMING_MS = 500;

/**
 * Resolve the timing threshold (ms) from the environment, falling back to
 * DEFAULT_HOOK_TIMING_MS. A missing, non-numeric, or negative value uses the
 * default; 0 surfaces every hook (no silent floor).
 */
export function resolveHookTimingMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = parseInt(env.VANTA_HOOK_TIMING_MS ?? "", 10);
  return isNaN(raw) || raw < 0 ? DEFAULT_HOOK_TIMING_MS : raw;
}

/**
 * True when an elapsed time should surface a timing indicator: strictly greater
 * than the threshold. At or under the threshold is silent. `thresholdMs`
 * defaults to the env-resolved value (default 500).
 */
export function shouldShowTiming(elapsedMs: number, thresholdMs: number = resolveHookTimingMs()): boolean {
  return elapsedMs > thresholdMs;
}

/** The one-line timing indicator: hook name + elapsed ms, rounded. */
export function buildHookTimingNote(hookName: string, elapsedMs: number): string {
  return `⧗ hook ${hookName} took ${Math.round(elapsedMs)}ms`;
}
