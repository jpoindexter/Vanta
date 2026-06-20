import { resolveSpinnerVerbs, spinnerVerbAt } from "../term/spinner-verbs.js";
import { spinnerPresentation } from "./spinner-stalled.js";

// Pure busy-indicator state: a growing-asterisk frame + a slowly-rotating verb,
// both derived from a monotonic tick. The tick advances ~every 150ms while a
// turn runs (use-busy-tick); the verb changes every VERB_EVERY frames so it
// reads as a label, not a flicker.
//
// The verb comes from resolveSpinnerVerbs(env) (user-configurable via
// VANTA_SPINNER_VERBS) instead of a hard-coded list, and the frame/suffix come
// from spinnerPresentation: past the stall threshold the frame switches to a
// distinct stalled glyph and a "(still working… Ns)" suffix appears, so a slow
// turn reads as stuck instead of an identical spin. Default (unset env + under
// threshold) is the prior behaviour: the built-in verbs + normal frame, "".

const VERB_EVERY = 8;

/** Tick→ms factor (mirrors use-busy-tick's TICK_MS) for the stall computation. */
const TICK_MS = 150;

/**
 * Busy-indicator state for one tick: the spinner frame glyph, the active verb,
 * and an optional "(still working… Ns)" suffix once the turn passes the stall
 * threshold. `frame` is the stalled glyph past the threshold, the normal
 * growing-asterisk frame under it.
 */
export function busyLabel(tick: number): { frame: string; verb: string; suffix: string } {
  const verbs = resolveSpinnerVerbs(process.env);
  const verb = spinnerVerbAt(verbs, Math.floor(tick / VERB_EVERY));
  const { glyph, suffix } = spinnerPresentation(tick * TICK_MS, tick);
  return { frame: glyph, verb, suffix };
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
