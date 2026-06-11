import { reviewTurn, shouldReview } from "../review/background-review.js";
import { shouldUpdateSessionMemory, updateSessionMemory } from "../memory/session-memory.js";
import { shouldNudge, buildNudgeText, DEFAULT_NUDGE_EVERY } from "../repl/nudge.js";
import {
  nextGateState,
  shouldFireGate,
  buildGateText,
  extractLastTurnToolNames,
  DEFAULT_RESEARCH_GATE_TURNS,
  type ResearchGateState,
} from "../repl/research-gate.js";
export type { ResearchGateState } from "../repl/research-gate.js";
import {
  nextInhibitState,
  shouldAlertInhibit,
  buildInhibitText,
  DEFAULT_INHIBIT_THRESHOLD,
  type InhibitState,
} from "../repl/inhibit.js";
export type { InhibitState } from "../repl/inhibit.js";
import {
  nextSetShiftState,
  shouldAlertSetShift,
  buildSetShiftText,
  DEFAULT_SETSHIFT_THRESHOLD,
  type SetShiftState,
} from "../repl/set-shift.js";
export type { SetShiftState } from "../repl/set-shift.js";
import {
  nextStallState,
  shouldAlertStall,
  buildStallText,
  DEFAULT_STALL_THRESHOLD,
  type StallState,
} from "../repl/stall.js";
export type { StallState } from "../repl/stall.js";
import { readNextItems } from "../repl/next.js";
import { topNextItems } from "../repl/choice-reduce.js";
import {
  countTopicsInLastTurn,
  shouldAnnotateScopeDelta,
  nextScopeDeltaState,
  buildScopeDeltaText,
  DEFAULT_SCOPE_DELTA_THRESHOLD,
  type ScopeDeltaState,
} from "../repl/scope-delta.js";
export type { ScopeDeltaState } from "../repl/scope-delta.js";
import {
  detectWmMode,
  nextWmManipState,
  shouldAlertWmManip,
  buildWmManipText,
  DEFAULT_MANIP_THRESHOLD,
  type WmManipState,
} from "../repl/wm-manip.js";
export type { WmManipState } from "../repl/wm-manip.js";
import type { SafetyClient } from "../safety-client.js";
import type { LLMProvider } from "../providers/interface.js";
import type { Message } from "../types.js";

// Post-turn gates — best-effort, non-blocking checks the hosts run after each
// turn (review, session-memory, nudge, EF detectors, anti-slop). Extracted from
// session.ts (size budget); re-exported there, so the public surface is unchanged.

/**
 * Post-turn self-improvement nudge. When the turn warrants review (busy turn or
 * the periodic interval — see {@link shouldReview}), spawn the background-review
 * fork to capture a skill. Best-effort and quiet unless something was learned.
 */
export async function reviewAfterTurn(opts: {
  provider: LLMProvider;
  safety: SafetyClient;
  root: string;
  transcript: Message[];
  toolIterations: number;
  turnIndex: number;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  if (!shouldReview(opts.toolIterations, opts.turnIndex, opts.env ?? process.env)) return;
  const { wrote } = await reviewTurn({
    provider: opts.provider,
    safety: opts.safety,
    root: opts.root,
    transcript: opts.transcript,
  });
  if (wrote.length) console.log(`  💾 self-improvement: learned ${wrote.join(", ")}`);
}

/**
 * Post-turn, distil the running transcript into .vanta/session-memory.md when
 * the turn warrants it (busy turn or the periodic interval — see
 * {@link shouldUpdateSessionMemory}). Returns the new scratchpad content so the
 * host can refresh the live compaction injection, or null when no update ran.
 * Best-effort and silent.
 */
export async function sessionMemoryAfterTurn(opts: {
  provider: LLMProvider;
  dataDir: string;
  transcript: Message[];
  toolIterations: number;
  turnIndex: number;
  env?: NodeJS.ProcessEnv;
}): Promise<string | null> {
  const env = opts.env ?? process.env;
  if (!shouldUpdateSessionMemory(opts.turnIndex, opts.toolIterations, env)) return null;
  const { updated, content } = await updateSessionMemory({
    provider: opts.provider,
    dataDir: opts.dataDir,
    transcript: opts.transcript,
    env,
  });
  return updated ? content ?? null : null;
}

/**
 * After-turn gentle nudge. When the turn index hits a multiple of
 * VANTA_NUDGE_EVERY (default 5), reads active goals and calls onNote with a
 * short reminder. No-op when disabled (every=0) or no active goals. Best-effort.
 */
export async function nudgeAfterTurn(
  turnIndex: number,
  safety: SafetyClient,
  onNote: (text: string) => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  try {
    const raw = parseInt(env.VANTA_NUDGE_EVERY ?? "", 10);
    const every = isNaN(raw) || raw < 0 ? DEFAULT_NUDGE_EVERY : raw;
    if (!shouldNudge(turnIndex, every)) return;
    const goals = await safety.getGoals().catch(() => []);
    const note = buildNudgeText(goals);
    if (note) onNote(note);
  } catch {
    // best-effort — never break the session
  }
}

/**
 * After-turn research-spiral gate. Tracks consecutive non-output turns; at
 * VANTA_RESEARCH_GATE_TURNS (default 8), fires a gentle note asking whether to
 * switch from exploration to execution. Returns the updated state for the caller
 * to persist. Best-effort — never throws.
 */
export async function researchGateAfterTurn(
  state: ResearchGateState,
  messages: Message[],
  deps: { safety: SafetyClient; onNote: (text: string) => void; env?: NodeJS.ProcessEnv },
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

export async function inhibitAfterTurn(
  state: InhibitState,
  messages: Message[],
  deps: { safety: SafetyClient; onNote: (text: string) => void; env?: NodeJS.ProcessEnv },
): Promise<InhibitState> {
  const { safety, onNote, env = process.env } = deps;
  try {
    const raw = parseInt(env.VANTA_INHIBIT_THRESHOLD ?? "", 10);
    const threshold = isNaN(raw) || raw < 0 ? DEFAULT_INHIBIT_THRESHOLD : raw;
    if (threshold === 0) return state;
    const toolNames = extractLastTurnToolNames(messages);
    const newState = nextInhibitState(state, toolNames);
    if (shouldAlertInhibit(newState, threshold)) {
      const goals = await safety.getGoals().catch(() => []);
      const activeGoal = goals.find((g) => g.status === "active") ?? null;
      onNote(buildInhibitText(newState.consecutiveCalls, activeGoal));
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
  deps: { safety: SafetyClient; dataDir: string; onNote: (text: string) => void; env?: NodeJS.ProcessEnv },
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
      if (!activeGoal) return newState; // stall only nags when a goal is actually open
      const top = topNextItems(await readNextItems(dataDir))[0];
      onNote(buildStallText(activeGoal, newState.stalledTurns, top));
    }
    return newState;
  } catch {
    return state;
  }
}

/**
 * After-turn scope delta annotation. Counts distinct topics/files/tools touched
 * in the last turn; over VANTA_SCOPE_DELTA_THRESHOLD (default 3) emits a dim
 * ambient note and bumps the session accumulator. Non-alarming. Best-effort.
 */
export async function scopeDeltaAfterTurn(
  state: ScopeDeltaState,
  messages: Message[],
  onNote: (text: string) => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ScopeDeltaState> {
  try {
    const raw = parseInt(env.VANTA_SCOPE_DELTA_THRESHOLD ?? "", 10);
    const threshold = isNaN(raw) || raw < 0 ? DEFAULT_SCOPE_DELTA_THRESHOLD : raw;
    if (threshold === 0) return state;
    const count = countTopicsInLastTurn(messages);
    const newState = nextScopeDeltaState(state, count, threshold);
    if (shouldAnnotateScopeDelta(count, threshold)) {
      onNote(buildScopeDeltaText(count, newState.totalAnnotations));
    }
    return newState;
  } catch {
    return state;
  }
}

/** Post-turn working-memory manipulation detector — alerts when the agent has
 * transformed working memory for N turns without concrete output. */
export async function wmManipAfterTurn(
  state: WmManipState,
  messages: Message[],
  onNote: (text: string) => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WmManipState> {
  try {
    const raw = parseInt(env.VANTA_WM_MANIP_THRESHOLD ?? "", 10);
    const threshold = isNaN(raw) || raw < 0 ? DEFAULT_MANIP_THRESHOLD : raw;
    if (threshold === 0) return state;
    const mode = detectWmMode(messages);
    const newState = nextWmManipState(state, mode);
    if (shouldAlertWmManip(newState, threshold)) {
      onNote(buildWmManipText(newState.manipTurns));
    }
    return newState;
  } catch {
    return state;
  }
}

/**
 * After a turn, check the final response text for AI-ish drift. Best-effort —
 * opt-out via VANTA_ANTI_SLOP=0. Emits a note when slop is found.
 */
export async function antiSlopAfterText(
  text: string,
  onNote: (note: string) => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (env.VANTA_ANTI_SLOP === "0" || !text.trim()) return;
  try {
    const { detectSlop, formatSlopNote } = await import("../repl/anti-slop.js");
    const note = formatSlopNote(detectSlop(text));
    if (note) onNote(note);
  } catch { /* best-effort */ }
}
