// The LLM-fork learning passes (reviewAfterTurn, sessionMemoryAfterTurn,
// brainLearnAfterTurn) live in ./background-learning.js — re-exported here.
export * from "./background-learning.js";
// EF detector gates (research, inhibit, set-shift, stall) — re-exported here.
export * from "./ef-gates.js";

import { shouldNudge, buildNudgeText, DEFAULT_NUDGE_EVERY } from "../repl/nudge.js";
import {
  countTopicsInLastTurn, shouldAnnotateScopeDelta, nextScopeDeltaState,
  buildScopeDeltaText, DEFAULT_SCOPE_DELTA_THRESHOLD, type ScopeDeltaState,
} from "../repl/scope-delta.js";
export type { ScopeDeltaState } from "../repl/scope-delta.js";
import {
  detectWmMode, nextWmManipState, shouldAlertWmManip, buildWmManipText,
  DEFAULT_MANIP_THRESHOLD, type WmManipState,
} from "../repl/wm-manip.js";
export type { WmManipState } from "../repl/wm-manip.js";
import type { SafetyClient } from "../safety-client.js";
import type { Message } from "../types.js";
import { extractLastTurnCalls, detectAnomalies, formatAnomalyNote } from "../observe/trace.js";

// Post-turn ambient gates — best-effort, non-blocking. Extracted from session.ts
// (size budget); re-exported there, so the public surface is unchanged.

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

export function traceAnomalyAfterTurn(
  messages: Message[],
  onNote: (text: string) => void,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.VANTA_TRACE_ANOMALY === "0") return;
  try {
    const calls = extractLastTurnCalls(messages);
    const anomalies = detectAnomalies(calls);
    if (anomalies.length) onNote(formatAnomalyNote(anomalies));
  } catch { /* best-effort */ }
}

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
