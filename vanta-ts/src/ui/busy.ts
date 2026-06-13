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
