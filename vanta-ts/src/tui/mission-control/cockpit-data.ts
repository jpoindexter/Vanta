import { listDefs, loadState } from "../../loop/store.js";
import { openEscalations } from "../../loop/state.js";
import type { Goal } from "../../types.js";
import type { LoopStatus } from "../../loop/types.js";
import type { KernelClient } from "../../kernel/client.js";

// Read-only data behind the v2 mission-control surface. Pulls live goals from
// the kernel and live loop state from disk — never fabricated. Each source is
// best-effort: a failure degrades that panel to empty rather than breaking the
// overlay.

export type LoopSummary = {
  id: string;
  goal: string;
  status: LoopStatus;
  iterations: number;
  openEscalations: number;
  inProgress: boolean;
};

export type CockpitData = {
  goals: Goal[];
  loops: LoopSummary[];
};

export const EMPTY_COCKPIT: CockpitData = { goals: [], loops: [] };

async function gatherGoals(client: KernelClient): Promise<Goal[]> {
  try {
    return await client.getGoals();
  } catch {
    return [];
  }
}

async function gatherLoops(dataDir: string): Promise<LoopSummary[]> {
  let defs;
  try {
    defs = await listDefs(dataDir);
  } catch {
    return [];
  }
  const summaries: LoopSummary[] = [];
  for (const def of defs) {
    try {
      const state = await loadState(dataDir, def.id);
      summaries.push({
        id: def.id,
        goal: def.goal,
        status: def.status,
        iterations: state.iterations,
        openEscalations: openEscalations(state).length,
        inProgress: state.inProgress,
      });
    } catch {
      // skip a loop whose state can't be read; keep the rest
    }
  }
  return summaries;
}

/** Gather goals + loop summaries for the cockpit. Never throws. */
export async function gatherCockpitData(deps: { client: KernelClient; dataDir: string }): Promise<CockpitData> {
  const [goals, loops] = await Promise.all([gatherGoals(deps.client), gatherLoops(deps.dataDir)]);
  return { goals, loops };
}
