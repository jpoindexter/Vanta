import {
  researchGateAfterTurn,
  inhibitAfterTurn,
  setShiftAfterTurn,
  stallAfterTurn,
  scopeDeltaAfterTurn,
  wmManipAfterTurn,
  traceAnomalyAfterTurn,
  type ResearchGateState,
  type InhibitState,
  type SetShiftState,
  type StallState,
  type ScopeDeltaState,
  type WmManipState,
} from "../session.js";
import { ndGatesAfterTurn } from "../session/nd-gates.js";
import { markProactiveActivity } from "../proactive/store.js";
import { emptyEfState } from "../nd/engine.js";
import type { EfState } from "../nd/types.js";
import type { Message } from "../types.js";
import type { KernelClient } from "../kernel/client.js";

// The bundled post-turn EF/operator gates an interactive turn runs, threaded as
// one state object so both hosts (readline runChat + TUI use-agent-send) share
// the same gate set + order and can't drift. The individual *AfterTurn gates
// (and their unit tests) live in session.ts / repl/*; this is just the
// orchestrator, kept out of the already-large session.ts.

export type GateState = {
  research: ResearchGateState;
  inhibit: InhibitState;
  setShift: SetShiftState;
  stall: StallState;
  scopeDelta: ScopeDeltaState;
  wmManip: WmManipState;
  /** ND executive-function engine state (the user-configurable gate set). */
  nd: EfState;
};

export function freshGateState(): GateState {
  return {
    research: { consecutiveTurns: 0 },
    inhibit: { consecutiveCalls: 0 },
    setShift: { repeatingTool: null, consecutiveRuns: 0 },
    stall: { stalledTurns: 0 },
    scopeDelta: { totalAnnotations: 0 },
    wmManip: { manipTurns: 0 },
    nd: emptyEfState(),
  };
}

/** Run every post-turn gate in order, threading + returning the new bundle. Each gate is best-effort. */
export async function runPostTurnGates(
  g: GateState,
  o: {
    messages: Message[]; safety: KernelClient; dataDir: string; onNote: (text: string) => void;
    env?: NodeJS.ProcessEnv; turnIndex?: number; startedMs?: number; now?: number;
  },
): Promise<GateState> {
  const { messages, safety, dataDir, onNote } = o;
  const env = o.env ?? process.env;
  const now = o.now ?? Date.now();
  // A completed interactive turn = the user is present; stamp activity so the
  // proactive heartbeat treats them as "not away" (best-effort, never blocks).
  void markProactiveActivity(dataDir, new Date(now));
  traceAnomalyAfterTurn(messages, onNote, env);
  return {
    research: await researchGateAfterTurn(g.research, messages, { safety, onNote, env }),
    inhibit: await inhibitAfterTurn(g.inhibit, messages, { safety, onNote, env }),
    setShift: await setShiftAfterTurn(g.setShift, messages, onNote, env),
    stall: await stallAfterTurn(g.stall, messages, { safety, dataDir, onNote, env }),
    scopeDelta: await scopeDeltaAfterTurn(g.scopeDelta, messages, onNote, env),
    wmManip: await wmManipAfterTurn(g.wmManip, messages, onNote, env),
    nd: await ndGatesAfterTurn(g.nd, {
      messages, safety, onNote, env, now,
      turnIndex: o.turnIndex ?? messages.filter((m) => m.role === "user").length,
      startedMs: o.startedMs ?? now,
    }),
  };
}
