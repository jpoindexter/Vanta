import { listDefs, loadState, saveState } from "../loop/store.js";
import { isLoopDue, advanceTick } from "../loop/trigger.js";
import type { LoopDef } from "../loop/types.js";

// Wakes any registered loops whose trigger fires on this gateway tick.
// Each due loop spawns a detached child (injected via deps.spawn) so a
// long iteration never blocks the 60 s tick. Non-due heartbeat loops
// advance their counter so they wake on the Nth tick as designed.

export type LoopsTickDeps = {
  dataDir: string;
  now: Date;
  /** Fire a loop iteration — caller wires the detached child. */
  spawn: (id: string) => void;
  log: (msg: string) => void;
};

/** Process one active loop def: spawn if due, advance tick counter if not. */
async function tickOne(def: LoopDef, deps: LoopsTickDeps): Promise<boolean> {
  const state = await loadState(deps.dataDir, def.id);

  if (isLoopDue(def, state, deps.now)) {
    deps.spawn(def.id);
    deps.log(`loop ${def.id}: due → spawned`);
    return true;
  }

  // Only heartbeat defs advance a tick counter; others return the same ref.
  const adv = advanceTick(def, state);
  if (adv !== state) {
    await saveState(deps.dataDir, adv);
  }
  return false;
}

/**
 * Walk all registered loop defs and fire any that are due at `deps.now`.
 * Returns the count of loops spawned this tick.
 */
export async function tickLoops(deps: LoopsTickDeps): Promise<number> {
  const defs = await listDefs(deps.dataDir);
  let fired = 0;
  for (const def of defs) {
    if (def.status !== "active") continue;
    const spawned = await tickOne(def, deps);
    if (spawned) fired++;
  }
  return fired;
}
