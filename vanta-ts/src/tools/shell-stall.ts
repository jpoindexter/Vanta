// Background shell stall watchdog.
// A long-running bg command that asks for interactive input (y/n, password, …)
// can hang forever silently. These pure fns detect that tail and decide whether
// to fire a one-time notification. No I/O, no timers, no state held — `nowMs` and
// the live output buffer are injected so the watchdog at the spawn site (or a test)
// drives them.

const DEFAULT_IDLE_MS = 45_000;

// Needles matched against the trimmed, lowercased LAST non-empty line of the tail.
// `[Y/n]` and `[y/N]` both lowercase to `[y/n]`, so one needle covers both.
const PROMPT_NEEDLES = [
  "(y/n)",
  "[y/n]",
  "yes/no",
  "(yes/no)",
  "continue?",
  "overwrite?",
  "are you sure",
  "press any key",
  "press enter",
  "password:",
  "passphrase:",
  "proceed (y/n)",
] as const;

function lastNonEmptyLine(tail: string): string {
  const lines = tail.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = (lines[i] ?? "").trim();
    if (line.length > 0) return line;
  }
  return "";
}

/**
 * True when the END of `tail` looks like it's waiting on interactive input.
 * Matches (case-insensitive) against the last non-empty line only — ordinary
 * prose ending in a period won't match. A line ending in `?` that also mentions
 * y/n counts (e.g. "Apply this change? (y/n)").
 */
export function detectInteractivePrompt(tail: string): boolean {
  const line = lastNonEmptyLine(tail).toLowerCase();
  if (line.length === 0) return false;
  if (PROMPT_NEEDLES.some((needle) => line.includes(needle))) return true;
  // A question that also offers a y/n choice — e.g. "Replace existing? y / n".
  return line.endsWith("?") && /\by\s*\/\s*n\b/.test(line);
}

export type StallState = { lastLen: number; lastChangeMs: number; notified: boolean };

/**
 * Decide whether a stalled-and-waiting bg task should fire a one-time notification.
 * - output grew (curLen > prev.lastLen) → reset the idle clock + notified flag, no notify
 * - idle ≥ idleMs AND the tail looks interactive AND not yet notified → notify once
 * - otherwise → no notify, state carried forward
 * Pure: `nowMs` is injected.
 */
export function checkStall(
  prev: StallState,
  curLen: number,
  tail: string,
  nowMs: number,
  idleMs = DEFAULT_IDLE_MS,
): { state: StallState; notify: boolean } {
  if (curLen > prev.lastLen) {
    return { state: { lastLen: curLen, lastChangeMs: nowMs, notified: false }, notify: false };
  }
  const idleFor = nowMs - prev.lastChangeMs;
  const shouldNotify = idleFor >= idleMs && !prev.notified && detectInteractivePrompt(tail);
  if (shouldNotify) {
    return { state: { ...prev, notified: true }, notify: true };
  }
  return { state: prev, notify: false };
}
