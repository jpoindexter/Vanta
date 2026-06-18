import type { Goal } from "../types.js";
import { buildGoalGraph, type GoalDepEdge } from "../goals/deps.js";

/**
 * Render the goal ledger like the demo: active goals first (●), then done (✓),
 * each line "  {mark} {text}   {status}   #{id}" under a header. Pure — the
 * /goals handler feeds it the kernel's goals. Empty → a one-line nudge.
 */
export function formatGoalLedger(goals: Goal[], deps: GoalDepEdge[] = []): string {
  if (goals.length === 0) return "  (no goals yet — set one with /goal <text>)";
  const rank = (s: Goal["status"] | "blocked"): number => s === "active" ? 0 : s === "blocked" ? 1 : 2;
  const rows = buildGoalGraph(goals, deps)
    .sort((a, b) => rank(a.status) - rank(b.status))
    .map((r) => `  ${mark(r.status)} ${r.goal.text}   ${r.status}${depText(r)}   #${r.goal.id}`);
  return ["Goal ledger · .vanta/goals.tsv", ...rows].join("\n");
}

function mark(status: Goal["status"] | "blocked"): string {
  if (status === "active") return "●";
  if (status === "blocked") return "◌";
  return "✓";
}

function depText(row: ReturnType<typeof buildGoalGraph>[number]): string {
  const parts = [
    row.blockedBy.length ? `blocked_by:${row.blockedBy.join(",")}` : "",
    row.blocks.length ? `blocks:${row.blocks.join(",")}` : "",
  ].filter(Boolean);
  return parts.length ? `   ${parts.join(" ")}` : "";
}
