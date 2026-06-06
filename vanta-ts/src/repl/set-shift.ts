export const DEFAULT_SETSHIFT_THRESHOLD = 3;

export type SetShiftState = { repeatingTool: string | null; consecutiveRuns: number };

/** Returns the most-frequently-called tool in `toolNames`, or null if empty. */
export function getPrimaryTool(toolNames: string[]): string | null {
  if (!toolNames.length) return null;
  const counts = new Map<string, number>();
  for (const n of toolNames) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best: string | null = null;
  let max = 0;
  for (const [n, c] of counts) {
    if (c > max) { max = c; best = n; }
  }
  return best;
}

/** Pure state transition — tracks consecutive turns dominated by the same tool. */
export function nextSetShiftState(prev: SetShiftState, toolNames: string[]): SetShiftState {
  const primary = getPrimaryTool(toolNames);
  if (!primary) return { repeatingTool: null, consecutiveRuns: 0 };
  if (primary === prev.repeatingTool) return { repeatingTool: primary, consecutiveRuns: prev.consecutiveRuns + 1 };
  return { repeatingTool: primary, consecutiveRuns: 1 };
}

/** Fire at the threshold and at each subsequent multiple. */
export function shouldAlertSetShift(
  state: SetShiftState,
  threshold = DEFAULT_SETSHIFT_THRESHOLD,
): boolean {
  return (
    threshold > 0 &&
    state.repeatingTool !== null &&
    state.consecutiveRuns > 0 &&
    state.consecutiveRuns % threshold === 0
  );
}

export function buildSetShiftText(tool: string, consecutiveRuns: number): string {
  return (
    `🔄 Stuck loop: \`${tool}\` called ${consecutiveRuns} consecutive turns.\n` +
    `Same approach, no breakthrough. Want to try a different angle?`
  );
}
