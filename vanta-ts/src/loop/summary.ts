import { listDefs, loadState } from "./store.js";

// Flat read-only summary of a loop — def fields + mutable state merged into one
// shape the TUI can render without knowing about the two-file layout.

export type LoopSummary = {
  id: string;
  goal: string;
  status: "active" | "paused" | "done" | "killed";
  iterations: number;
  lastScore: number | null;
  bestScore: number | null;
  inProgress: boolean;
  openEscalations: number;
};

function sortRank(s: LoopSummary): number {
  if (s.inProgress || s.status === "active") return 0;
  if (s.status === "paused") return 1;
  return 2;
}

/** Compose each loop def with its mutable state into a flat summary for the TUI.
 *  Active/in-progress loops sort first, then paused, then done/killed. */
export async function listLoopSummaries(dataDir: string): Promise<LoopSummary[]> {
  const defs = await listDefs(dataDir);
  const summaries = await Promise.all(
    defs.map(async (def) => {
      const state = await loadState(dataDir, def.id);
      const openEscalations = state.escalations.filter((e) => e.status === "open").length;
      const summary: LoopSummary = {
        id: def.id,
        goal: def.goal,
        status: def.status,
        iterations: state.iterations,
        lastScore: state.lastScore,
        bestScore: state.bestScore,
        inProgress: state.inProgress,
        openEscalations,
      };
      return summary;
    }),
  );
  return summaries.slice().sort((a, b) => sortRank(a) - sortRank(b));
}
