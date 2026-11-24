import {
  nextGateState, shouldFireGate, buildGateText, extractLastTurnToolNames,
  DEFAULT_RESEARCH_GATE_TURNS, type ResearchGateState,
} from "../repl/research-gate.js";
export type { ResearchGateState } from "../repl/research-gate.js";
import {
  nextSetShiftState, shouldAlertSetShift, buildSetShiftText,
  DEFAULT_SETSHIFT_THRESHOLD, type SetShiftState,
} from "../repl/set-shift.js";
export type { SetShiftState } from "../repl/set-shift.js";
import {
  nextStallState, shouldAlertStall, buildStallText,
  DEFAULT_STALL_THRESHOLD, type StallState,
} from "../repl/stall.js";
export type { StallState } from "../repl/stall.js";
import { readNextItems } from "../repl/next.js";
import { topNextItems } from "../repl/choice-reduce.js";
import type { KernelClient } from "../kernel/client.js";
import type { Message } from "../types.js";

export async function researchGateAfterTurn(
  state: ResearchGateState,
  messages: Message[],
  deps: { safety: KernelClient; onNote: (text: string) => void; env?: NodeJS.ProcessEnv },
): Promise<ResearchGateState> {
  const { safety, onNote, env = process.env } = deps;
  try {
    const raw = parseInt(env.VANTA_RESEARCH_GATE_TURNS ?? "", 10);
    const threshold = isNaN(raw) || raw < 0 ? DEFAULT_RESEARCH_GATE_TURNS : raw;
    if (threshold === 0) return state;
    const toolNames = extractLastTurnToolNames(messages);
    const newState = nextGateState(state, toolNames);
    if (shouldFireGate(newState, threshold)) {
      const goals = await safety.getGoals().catch(() => []);
      const activeGoal = goals.find((g) => g.status === "active") ?? null;
      onNote(buildGateText(newState.consecutiveTurns, activeGoal));
    }
    return newState;
  } catch {
    return state;
  }
}

export async function setShiftAfterTurn(
  state: SetShiftState,
  messages: Message[],
  onNote: (text: string) => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SetShiftState> {
  try {
    const raw = parseInt(env.VANTA_SETSHIFT_THRESHOLD ?? "", 10);
    const threshold = isNaN(raw) || raw < 0 ? DEFAULT_SETSHIFT_THRESHOLD : raw;
    if (threshold === 0) return state;
    const toolNames = extractLastTurnToolNames(messages);
    const newState = nextSetShiftState(state, toolNames);
    if (shouldAlertSetShift(newState, threshold)) {
      onNote(buildSetShiftText(newState.repeatingTool!, newState.consecutiveRuns));
    }
    return newState;
  } catch {
    return state;
  }
}

export async function stallAfterTurn(
  state: StallState,
  messages: Message[],
  deps: { safety: KernelClient; dataDir: string; onNote: (text: string) => void; env?: NodeJS.ProcessEnv },
): Promise<StallState> {
  const { safety, dataDir, onNote, env = process.env } = deps;
  try {
    const raw = parseInt(env.VANTA_STALL_THRESHOLD ?? "", 10);
    const threshold = isNaN(raw) || raw < 0 ? DEFAULT_STALL_THRESHOLD : raw;
    if (threshold === 0) return state;
    const newState = nextStallState(state, extractLastTurnToolNames(messages));
    if (shouldAlertStall(newState, threshold)) {
      const goals = await safety.getGoals().catch(() => []);
      const activeGoal = goals.find((g) => g.status === "active") ?? null;
      if (!activeGoal) return newState;
      const top = topNextItems(await readNextItems(dataDir))[0];
      onNote(buildStallText(activeGoal, newState.stalledTurns, top));
    }
    return newState;
  } catch {
    return state;
  }
}
