import type { Goal } from "../types.js";

export const DEFAULT_INHIBIT_THRESHOLD = 3;

// Tools that produce durable output — resets the drift counter.
const OUTPUT_TOOL_NAMES = new Set(["write_file", "shell_cmd", "roadmap_move"]);

export type InhibitState = { consecutiveCalls: number };

/** Pure state transition. Resets on any output tool; increments (per turn) otherwise. */
export function nextInhibitState(prev: InhibitState, toolNames: string[]): InhibitState {
  if (!toolNames.length || toolNames.some((n) => OUTPUT_TOOL_NAMES.has(n))) {
    return { consecutiveCalls: 0 };
  }
  return { consecutiveCalls: prev.consecutiveCalls + 1 };
}

/** Fire at the threshold and at each subsequent multiple. */
export function shouldAlertInhibit(state: InhibitState, threshold = DEFAULT_INHIBIT_THRESHOLD): boolean {
  return threshold > 0 && state.consecutiveCalls > 0 && state.consecutiveCalls % threshold === 0;
}

export function buildInhibitText(consecutiveCalls: number, activeGoal: Goal | null): string {
  const goalLine = activeGoal ? `\nActive goal: "${activeGoal.text}"` : "";
  return (
    `⚠ ${consecutiveCalls} turns without concrete output — possible goal drift.${goalLine}\n` +
    `Still on track? (confirm to continue, or redirect if needed)`
  );
}
