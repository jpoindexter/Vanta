import type { Goal } from "../types.js";

/** How many turns between gentle goal reminders (0 = disabled). */
export const DEFAULT_NUDGE_EVERY = 5;

/**
 * Returns true when a nudge should fire for this turn index.
 * Pure — safe to test without I/O.
 */
export function shouldNudge(turnIndex: number, every: number): boolean {
  if (every <= 0 || turnIndex <= 0) return false;
  return turnIndex % every === 0;
}

/**
 * Build the nudge note text from the active goal list, or null if no active
 * goals exist. Anchors to the first active goal to stay focused.
 */
export function buildNudgeText(goals: Goal[]): string | null {
  const active = goals.filter((g) => g.status === "active");
  if (active.length === 0) return null;
  const g = active[0]!;
  const label = g.text.length > 60 ? `${g.text.slice(0, 57)}…` : g.text;
  return `💡 Still on: "${label}" — /next for a micro-step`;
}
