import { ASTERISK_FRAMES, SPINNER_VERBS } from "../term/figures.js";

// Pure busy-indicator state: a growing-asterisk frame + a slowly-rotating verb,
// both derived from a monotonic tick. The tick advances ~every 150ms while a
// turn runs (use-busy-tick); the verb changes every VERB_EVERY frames so it
// reads as a label, not a flicker.

const VERB_EVERY = 8;

export function busyLabel(tick: number): { frame: string; verb: string } {
  const frame = ASTERISK_FRAMES[tick % ASTERISK_FRAMES.length]!;
  const verb = SPINNER_VERBS[Math.floor(tick / VERB_EVERY) % SPINNER_VERBS.length]!;
  return { frame, verb };
}

/** Context-window fill as a 0–100 integer (0 when the window is unknown). */
export function contextPct(estTokens: number, contextWindow: number): number {
  return contextWindow > 0 ? Math.min(100, Math.round((estTokens / contextWindow) * 100)) : 0;
}

/** A filled/empty block bar for the context gauge (e.g. "████░░░░"). */
export function contextBar(pct: number, width = 8): string {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/** Compact token count: 24000 → "24k", 1_200_000 → "1.2M". */
export function kfmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/** Elapsed wall-clock for the session timer: 9000 → "9s", 69000 → "1m09s". */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}
