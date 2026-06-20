// Shell command timing. PURE — no I/O. Formats an elapsed wall-clock duration
// as a compact human string, decides whether a run was slow enough to surface a
// trailing timing note, and builds that note. Observational only: it never
// changes a command's result, exit code, or output for fast commands.

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/** Elapsed-ms threshold above which a command's run gets a timing note. */
export const DEFAULT_SHELL_TIMING_MS = 500;

/**
 * Format an elapsed duration (ms) as a compact human string:
 *  - under 1s → whole milliseconds ("240ms")
 *  - under 1m → seconds to one decimal ("1.3s")
 *  - 1m and over → minutes + whole seconds ("2m 5s")
 * Negatives clamp to "0ms".
 */
export function formatElapsed(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  if (safe < MS_PER_SECOND) return `${Math.round(safe)}ms`;
  const totalSeconds = safe / MS_PER_SECOND;
  if (totalSeconds < SECONDS_PER_MINUTE) return `${trimDecimal(totalSeconds)}s`;
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = Math.round(totalSeconds % SECONDS_PER_MINUTE);
  // A rounded remainder of 60 rolls into the next minute, keeping "2m 0s" clean.
  return seconds === SECONDS_PER_MINUTE ? `${minutes + 1}m 0s` : `${minutes}m ${seconds}s`;
}

/** One decimal, but drop a trailing ".0" so "1.0s" reads "1s". */
function trimDecimal(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

/**
 * Resolve the timing threshold (ms) from the environment, falling back to
 * DEFAULT_SHELL_TIMING_MS. A missing, non-numeric, or negative value uses the
 * default; 0 annotates every command (no silent floor).
 */
export function resolveShellTimingMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = parseInt(env.VANTA_SHELL_TIMING_MS ?? "", 10);
  return isNaN(raw) || raw < 0 ? DEFAULT_SHELL_TIMING_MS : raw;
}

/**
 * True when an elapsed time should surface a timing note: strictly greater than
 * the threshold. At or under the threshold is silent (a fast command = no note).
 * `thresholdMs` defaults to the env-resolved value (default 500; 0 = always).
 */
export function shouldShowTiming(elapsedMs: number, thresholdMs: number = resolveShellTimingMs()): boolean {
  return elapsedMs > thresholdMs;
}

/** The trailing "(took <elapsed>)" line appended after a slow command's output. */
export function buildTimingNote(elapsedMs: number): string {
  return `(took ${formatElapsed(elapsedMs)})`;
}
