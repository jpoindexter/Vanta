import { readLearning, learningStats, type LearningStats } from "../learning/ledger.js";
import type { SlashHandler } from "./types.js";

// VANTA-SELF-LEARNING-LOOP — `/learning`: make the closed loop LEGIBLE to the
// operator. Reads the cycle ledger (.vanta/learning/ledger.jsonl) and reports what
// Vanta has minted/refined/adopted/gated-out this project — the reuse/improvement
// metric the loop exists to produce.

/** Render the learning stats as a compact block. Pure. */
export function formatLearning(stats: LearningStats, recent: string[]): string {
  if (stats.cycles === 0) {
    return "  🌱 self-learning: no cycles yet — Vanta proposes a skill after a substantive task, then eval-gates it before adopting.";
  }
  const rate = stats.adoptionRate === null ? "—" : `${Math.round(stats.adoptionRate * 100)}%`;
  const lines = [
    "",
    "  🌱 Self-learning loop",
    "",
    `  cycles    ${stats.cycles}  (${stats.distinctSkills} distinct skill${stats.distinctSkills === 1 ? "" : "s"})`,
    `  minted    ${stats.minted}   refined ${stats.refined}   ← improvement signal`,
    `  adopted   ${stats.adopted}   gated out ${stats.rejected}   (adoption rate ${rate})`,
  ];
  if (recent.length) {
    lines.push("", "  recent:");
    for (const r of recent) lines.push(`    ${r}`);
  }
  lines.push("");
  return lines.join("\n");
}

export const learning: SlashHandler = async (_arg, ctx) => {
  const events = await readLearning(ctx.dataDir);
  const recent = events
    .slice(-5)
    .reverse()
    .map((e) => `${e.adopted ? "✓" : "✗"} ${e.skill} (${e.kind}) — ${e.reason}`);
  return { output: formatLearning(learningStats(events), recent) };
};
