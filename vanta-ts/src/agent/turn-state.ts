import type { CompletionResult } from "../providers/interface.js";
import type { ToolCall } from "../types.js";
import type { DispatchOutcome } from "./dispatch-tool.js";
import type { AgentDeps } from "./agent-types.js";
import { isErrorResult, buildErrorDetectText, DEFAULT_ERRORDETECT_THRESHOLD } from "../repl/error-detect.js";
import type { WorkItemState } from "../work-items/contract.js";
import type { StoppedReason } from "./agent-types.js";

// TURN-STATE — the per-turn bookkeeping `runTurn` mutates: usage totals, the
// consecutive-failure/error counters that drive the error-detect note, and the
// identical-call counter behind the repeated-failure stop. Pure state reducers
// (plus the error-detect side-effect, fired through injected deps) called BY
// the loop; they hold no control flow of their own.

export const MAX_CONSECUTIVE_FAILURES = 3;
export const MAX_IDENTICAL_CALLS = 3;

function callSignature(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args)}`;
}

export type TurnState = {
  consecutiveFailures: number;
  consecutiveErrorResults: number;
  toolIterations: number;
  turnUsage: { inputTokens: number; outputTokens: number };
  sawUsage: boolean;
  callCounts: Map<string, number>;
  tokensSaved: number;
  /** VANTA-STOP-CMD: names of tools completed this turn, for the soft-stop summary. */
  toolNames: string[];
  /** Canonical terminal state for every dispatched WorkItem in this turn. */
  workItemStates: WorkItemState[];
  /** VANTA-AUTOCONTINUE: how many times this turn auto-continued past a premature stop. */
  autoContinues: number;
  /** Bounded retries that enforce an explicit specialized-tool contract. */
  toolContractNudges: number;
  /** Bounded private harness redirects applied after observable loop drift. */
  adaptiveRedirects: number;
  /** Current private redirect, injected per call but not persisted in history. */
  adaptiveRedirect: string;
  /** Latest successful todo write's unfinished item count; null until observed. */
  openTodoCount: number | null;
  /** The acquisition phase has closed; spend the remaining fixed budget finishing. */
  toolBudgetClosure: boolean;
};

export function makeInitialState(): TurnState {
  return { consecutiveFailures: 0, consecutiveErrorResults: 0, toolIterations: 0, turnUsage: { inputTokens: 0, outputTokens: 0 }, sawUsage: false, callCounts: new Map(), tokensSaved: 0, toolNames: [], workItemStates: [], autoContinues: 0, toolContractNudges: 0, adaptiveRedirects: 0, adaptiveRedirect: "", openTodoCount: null, toolBudgetClosure: false };
}

export function turnCompletionState(state: TurnState, stoppedReason: StoppedReason): WorkItemState {
  if (state.workItemStates.includes("unverified")) return "unverified";
  if (stoppedReason !== "done") return "stopped";
  if (state.workItemStates.length > 0 && state.workItemStates.every((item) => item === "verified")) return "verified";
  const priority: WorkItemState[] = ["needs human", "waiting", "failed", "stopped", "running", "queued", "draft"];
  return priority.find((item) => state.workItemStates.includes(item)) ?? "unverified";
}

export function recordUsage(state: TurnState, result: CompletionResult): void {
  if (!result.usage) return;
  state.turnUsage.inputTokens += result.usage.inputTokens;
  state.turnUsage.outputTokens += result.usage.outputTokens;
  state.sawUsage = true;
}

export function recordToolOutcome(state: TurnState, call: ToolCall, outcome: DispatchOutcome, deps: AgentDeps): string | null {
  state.workItemStates.push(outcome.workItemState);
  if (outcome.executed) {
    state.consecutiveFailures = outcome.empty ? state.consecutiveFailures + 1 : 0;
    if (isErrorResult(outcome.ok, outcome.output)) {
      state.consecutiveErrorResults++;
      const t = DEFAULT_ERRORDETECT_THRESHOLD;
      if (state.consecutiveErrorResults >= t && state.consecutiveErrorResults % t === 0) {
        try { deps.onText?.(buildErrorDetectText(state.consecutiveErrorResults)); deps.onIterationCheck?.(state.consecutiveErrorResults); } catch { /* best-effort */ }
      }
    } else {
      state.consecutiveErrorResults = 0;
    }
  }
  if (outcome.ok && call.name === "todo" && call.arguments.action === "write" && Array.isArray(call.arguments.items)) {
    state.openTodoCount = call.arguments.items.filter((item) => {
      if (!item || typeof item !== "object") return true;
      return (item as { status?: unknown }).status !== "done";
    }).length;
  }
  const sig = callSignature(call.name, call.arguments);
  const count = (state.callCounts.get(sig) ?? 0) + 1;
  state.callCounts.set(sig, count);
  return count >= MAX_IDENTICAL_CALLS ? call.name : null;
}
