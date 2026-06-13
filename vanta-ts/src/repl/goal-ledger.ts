import type { Goal } from "../types.js";

/**
 * Render the goal ledger like the demo: active goals first (●), then done (✓),
 * each line "  {mark} {text}   {status}   #{id}" under a header. Pure — the
 * /goals handler feeds it the kernel's goals. Empty → a one-line nudge.
 */
export function formatGoalLedger(goals: Goal[]): string {
  if (goals.length === 0) return "  (no goals yet — set one with /goal <text>)";
  const rank = (s: Goal["status"]): number => (s === "active" ? 0 : 1);
  const rows = [...goals]
    .sort((a, b) => rank(a.status) - rank(b.status))
    .map((g) => `  ${g.status === "active" ? "●" : "✓"} ${g.text}   ${g.status}   #${g.id}`);
  return ["Goal ledger · .vanta/goals.tsv", ...rows].join("\n");
}
