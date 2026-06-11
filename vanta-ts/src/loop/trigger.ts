import { isDue } from "../schedule/cron.js";
import type { LoopDef, LoopState } from "./types.js";

// Decides whether a loop should wake on a given gateway tick. Pure: reads def +
// state, never writes. The gateway owns the side effects — it persists the
// advanced tick counter for heartbeat loops that did NOT fire, and the runner
// resets `ticksSinceRun` to 0 when an iteration actually runs.
//
// - manual: never auto-wakes (only `vanta loop run <id>`).
// - event:  declared now, fired by the WAKE-CONTEXT card later; treated as
//           manual until then so an event loop never silently spins.
// - cron:   wall-clock, via the same evaluator the scheduler uses.
// - heartbeat: every Nth tick, counting `ticksSinceRun`.

export function isLoopDue(def: LoopDef, state: LoopState, now: Date): boolean {
  if (def.status !== "active") return false;
  switch (def.trigger.kind) {
    case "manual":
    case "event":
      return false;
    case "cron":
      return isDue(def.trigger.expr, now);
    case "heartbeat":
      return state.ticksSinceRun + 1 >= def.trigger.everyTicks;
  }
}

/** A heartbeat loop that did not fire this tick advances its counter; everything
 *  else is unchanged. Returns a new state (pure) for the gateway to persist. */
export function advanceTick(def: LoopDef, state: LoopState): LoopState {
  if (def.trigger.kind !== "heartbeat") return state;
  return { ...state, ticksSinceRun: state.ticksSinceRun + 1 };
}
