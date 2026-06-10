// Compaction reminder — a transient context-fullness reminder.
// When the running context nears its window, nudge the model to consider
// compaction. Returned as a string the caller injects as a transient message
// (same seam as the goal-reminder note) — NEVER baked into the system prompt.

/** Default fraction of the window at which the reminder starts firing. */
const DEFAULT_FRAC = 0.7;

/** Cap the displayed percentage so a pre-compression estimate can't read >100%. */
const MAX_DISPLAY_PCT = 99;

/** Resolve the fire threshold, honoring VANTA_COMPACTION_REMIND_FRAC. Pure. */
function resolveFrac(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.VANTA_COMPACTION_REMIND_FRAC);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_FRAC;
}

/**
 * A short reminder when context is at/above the threshold, else null.
 * Pure. window <= 0 → null. The percentage is clamped for display so a
 * pre-compression token estimate never shows an absurd >100% figure.
 */
export function compactionReminder(
  estTokens: number,
  contextWindow: number,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (contextWindow <= 0) return null;
  const ratio = estTokens / contextWindow;
  if (ratio < resolveFrac(env)) return null;
  const pct = Math.min(MAX_DISPLAY_PCT, Math.round(ratio * 100));
  return `[context ~${pct}% full — consider /compress to free space before it overflows]`;
}
