import type { Goal } from "../types.js";

export const DEFAULT_STALL_THRESHOLD = 4;

// STALL-UNBLOCK — notices an active goal that isn't progressing and proposes the
// single smallest unblocking action, unprompted. "Progress" = a durable artifact
// (a file write or a commit); reasoning/reads alone don't count. Distinct from
// EF-INHIBIT (which flags drift regardless of goal): stall only fires WITH an
// active goal and names a concrete unblocker (the top buildable backlog card).

/** Tools that mark real forward progress on a goal — a written change or a commit. */
const PROGRESS_TOOLS = new Set(["write_file", "git_commit"]);

export type StallState = { stalledTurns: number };

/** Pure transition: reset on a progress tool, else increment by one turn. */
export function nextStallState(prev: StallState, toolNames: string[]): StallState {
  if (toolNames.some((n) => PROGRESS_TOOLS.has(n))) return { stalledTurns: 0 };
  return { stalledTurns: prev.stalledTurns + 1 };
}

/** Fire at the threshold and at each subsequent multiple. */
export function shouldAlertStall(state: StallState, threshold = DEFAULT_STALL_THRESHOLD): boolean {
  return threshold > 0 && state.stalledTurns > 0 && state.stalledTurns % threshold === 0;
}

/** A minimal backlog card shape — just what the unblocker line needs. */
export type StallCard = { id: string; title: string; size?: string };

/** One-line unblocker. Names the stalled goal, the duration, and a concrete next
 *  move — the top buildable card when known, else the /next affordance. Pure. */
export function buildStallText(activeGoal: Goal | null, stalledTurns: number, topCard?: StallCard): string {
  const goalLine = activeGoal ? `"${activeGoal.text}"` : "your active goal";
  const move = topCard
    ? `build ${topCard.id} — ${topCard.title}${topCard.size ? ` (${topCard.size})` : ""}`
    : `run /next for one concrete step`;
  return `⚠ ${goalLine} hasn't progressed in ${stalledTurns} turns. Smallest unblocker: ${move}. Or name what's blocking you.`;
}
