import { join } from "node:path";
import type { Summarizer } from "../context.js";
import { buildAgentHookDeps } from "../hooks/agent-hook-deps.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import { globalHookBus } from "../plugins/hooks.js";
import type { CompletionResult,LLMProvider } from "../providers/interface.js";
import { buildStopSummary } from "../repl/stop-cmd.js";
import { buildContextInspection } from "../tools/inspect-context.js";
import type { ToolContext } from "../tools/types.js";
import type { ImageAttachment,Message } from "../types.js";
import { detectAdaptiveRedirect,type AdaptiveSupportPlan } from "./adaptive-support.js";
import type { AgentDeps,AgentOutcome } from "./agent-types.js";
import { buildContinueNudge,reportsBlocker,shouldAutoContinue } from "./auto-continue.js";
import { recordRealPromptCount } from "./context-pipeline.js";
import type { DispatchOutcome } from "./dispatch-tool.js";
import { checkpointToolTranscript,persistEffectTransition } from "./effect-persistence.js";
import { applyMessageDisplay } from "./message-display.js";
import { settleStructuredBatch } from "./settle-batch.js";
import { maybeStructuredOutput,structuredOutcome } from "./structured-output.js";
import {
buildToolBudgetSummary,
shouldEnterToolClosure,
shouldHaltForToolBudget
} from "./tool-budget.js";
import { requiredToolNudge } from "./tool-use-contract.js";
import { completeTurnIteration,prepareTurnRuntime,usesCorrectionLeash,type TurnRuntime } from "./turn-runtime.js";
import type { TurnState } from "./turn-state.js";
import { MAX_CONSECUTIVE_FAILURES,MAX_IDENTICAL_CALLS,recordUsage,turnCompletionState } from "./turn-state.js";
import { processToolCalls } from "./turn-tool-batch.js";

export type TurnOpts = {
  messages: Message[];
  ctx: ToolContext;
  deps: AgentDeps;
  userText: string;
  images?: ImageAttachment[];
  signal?: AbortSignal;
};

type NoToolCallsArgs = { result: CompletionResult; messages: Message[]; deps: AgentDeps; iter: number; state: TurnState; userText: string; schemas: import("../providers/interface.js").ToolSchema[] };

async function handleNoToolCalls(args: NoToolCallsArgs): Promise<AgentOutcome | null> {
  const { result, messages, deps, iter, state, userText, schemas } = args;
  const usage = () => (state.sawUsage ? { ...state.turnUsage } : undefined);
  const ti = () => state.toolIterations;
  const ts = () => (state.tokensSaved > 0 ? state.tokensSaved : undefined);
  if (result.text.trim()) {
    if (reportsBlocker(result.text)) {
      return terminalOutcome({ messages, deps, state, iter, reason: "blocked", text: result.text });
    }
    const contractNudge = state.toolContractNudges === 0
      ? requiredToolNudge(userText, schemas.map((schema) => schema.name), state.toolNames)
      : null;
    if (contractNudge) {
      state.toolContractNudges++;
      messages.push({ role: "assistant", content: result.text });
      messages.push({ role: "user", content: contractNudge });
      return null;
    }
    messages.push({ role: "assistant", content: result.text });
    const shown = await displayText(deps, result.text);
    if (await shouldAutoContinue({ result, messages, autoContinues: state.autoContinues, toolNames: state.toolNames, deps, openTodoCount: state.openTodoCount })) {
      state.autoContinues++;
      if (shown) deps.onText?.(shown); // surface the interim text, then push through
      messages.push({ role: "user", content: buildContinueNudge(state.openTodoCount) });
      return null;
    }
    return {
      finalText: shown,
      iterations: iter,
      stoppedReason: "done",
      toolIterations: ti(),
      usage: usage(),
      tokensSaved: ts(),
      completionState: turnCompletionState(state, "done"),
    };
  }
  messages.push({ role: "assistant", content: "" });
  messages.push({ role: "user", content: "You returned nothing. State your result or call a tool." });
  return null;
}

type ToolCallIterArgs = {
  result: CompletionResult;
  messages: Message[];
  deps: AgentDeps;
  ctx: ToolContext;
  state: TurnState;
  prefetched: Map<string, Promise<DispatchOutcome>>;
  iter: number;
  support: AdaptiveSupportPlan;
  hardToolBudget: number;
};

async function terminalOutcome(args: {
  messages: Message[];
  deps: AgentDeps;
  state: TurnState;
  iter: number;
  reason: AgentOutcome["stoppedReason"];
  text: string;
}): Promise<AgentOutcome> {
  const { messages, deps, state, iter, reason, text } = args;
  messages.push({ role: "assistant", content: text });
  const shown = await displayText(deps, text);
  return {
    finalText: shown,
    iterations: iter,
    stoppedReason: reason,
    toolIterations: state.toolIterations,
    completionState: turnCompletionState(state, reason),
    usage: state.sawUsage ? { ...state.turnUsage } : undefined,
    tokensSaved: state.tokensSaved > 0 ? state.tokensSaved : undefined,
  };
}

async function handleToolCallsPresent(args: ToolCallIterArgs): Promise<AgentOutcome | null> {
  const { result, messages, deps, ctx, state, prefetched, iter, support, hardToolBudget } = args;
  const usage = () => (state.sawUsage ? { ...state.turnUsage } : undefined);
  await displayToolCallText(result, deps);
  messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });
  for (const call of result.toolCalls) {
    call.effectState = "pending";
    await persistEffectTransition(ctx.root, deps.sessionId, call, "pending");
  }
  await checkpointToolTranscript(deps.sessionId, messages);
  const structured = maybeStructuredOutput(result.toolCalls, deps.outputSchema);
  if (structured.handled) {
    // Answer EVERY call in the batch, in call order. Emitting only the
    // StructuredOutput result left any sibling dangling, and the old
    // "structured-output" id fallback invented a result with no matching call.
    settleStructuredBatch(result.toolCalls, structured.output, messages);
    return structuredOutcome(structured, iter, usage());
  }
  const processed = await processToolCalls({
    calls: result.toolCalls,
    deps,
    ctx,
    state,
    messages,
    hardToolBudget,
    toolBudgetClosure: state.toolBudgetClosure,
    prefetched,
  });
  if (processed.budgetExhausted)
    return terminalOutcome({ messages, deps, state, iter, reason: "tool_budget", text: buildToolBudgetSummary(state.toolNames, usesCorrectionLeash(support, deps)) });
  const stuckTool = processed.stuckTool;
  if (stuckTool)
    return terminalOutcome({ messages, deps, state, iter, reason: "repeated_failure", text: `Stopped: called ${stuckTool} with identical arguments ${MAX_IDENTICAL_CALLS} times without progress.` });
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
    return terminalOutcome({ messages, deps, state, iter, reason: "repeated_failure", text: `Stopped: ${MAX_CONSECUTIVE_FAILURES} consecutive tool calls produced no useful output.` });
  const redirect = detectAdaptiveRedirect(support, state);
  if (redirect) {
    state.adaptiveRedirect = redirect;
    state.adaptiveRedirects++;
  }
  // VANTA-STOP-CMD: the in-flight tool batch finished — honour a pending soft-stop
  // here (clean post-tool boundary), before the next provider call begins.
  if (deps.shouldSoftStop?.()) {
    const summary = buildStopSummary(state.toolNames);
    return terminalOutcome({ messages, deps, state, iter, reason: "soft_stopped", text: summary });
  }
  return null;
}

export async function runTurn(opts: TurnOpts): Promise<AgentOutcome> {
  const runtime = prepareTurnRuntime(opts);
  const { messages, ctx, deps, userText } = opts;
  const { effectScopeId, effectiveSignal, maxIter, adaptiveSupport, hardToolBudget, state } = runtime;
  for (let iter = 1; iter <= maxIter; iter++) {
    if (effectiveSignal?.aborted) return terminalOutcome({ messages, deps, state, iter: iter - 1, reason: "interrupted", text: "Interrupted." });
    const { schemas, prefetched, completion } = await completeTurnIteration(runtime, iter);
    if (!completion.ok) return terminalOutcome({ messages, deps, state, iter, reason: "repeated_failure", text: completion.error });
    const result = completion.result;
    recordUsage(state, result);
    recordPromptUsage(result, messages, deps);
    if (result.toolCalls.length === 0) {
      const outcome = await handleNoToolCalls({ result, messages, deps, iter, state, userText, schemas });
      if (outcome) return outcome;
      continue;
    }
    const liveCtx: ToolContext = {
      ...ctx,
      effectScopeId,
      inspectContext: () => buildContextInspection(messages, schemas, deps.provider.contextWindow()),
    };
    const earlyExit = await handleToolCallsPresent({ result, messages, deps, ctx: liveCtx, state, prefetched, iter, support: adaptiveSupport, hardToolBudget });
    if (earlyExit) return earlyExit;
    const budgetExit = await advanceToolBudget(runtime, iter);
    if (budgetExit) return budgetExit;
  }
  return terminalOutcome({ messages, deps, state, iter: maxIter, reason: "max_iterations", text: `Reached the ${maxIter}-iteration limit before completing.` });
}

function recordPromptUsage(result: CompletionResult, messages: Message[], deps: AgentDeps): void {
  if (!result.usage) return;
  recordRealPromptCount(messages, result.usage.inputTokens, deps.provider.contextWindow());
}

async function displayText(deps: AgentDeps, text: string): Promise<string> {
  await fireHooks(join(deps.root, ".vanta"), "MessageDisplay", { text, role: "assistant" }, { cwd: deps.root, ...buildAgentHookDeps(deps) });
  return (await applyMessageDisplay(deps.hooks ?? globalHookBus, text)).text;
}

// Keep Summarizer in scope for agent.ts which re-exports via session
export type { LLMProvider,Summarizer };

async function advanceToolBudget(runtime: TurnRuntime, iter: number): Promise<AgentOutcome | null> {
  const { opts: { messages, deps }, state, correcting, toolBudget, toolClosureReserve } = runtime;
  // At the predeclared threshold, close broad acquisition and spend only the
  // remaining fixed reserve on synthesis, verification, output, and plan
  // closure. This does not raise or reset the hard budget.
  if (!state.toolBudgetClosure && shouldEnterToolClosure(state.toolIterations, correcting, toolBudget, toolClosureReserve)) {
    state.toolBudgetClosure = true;
    return null;
  }
  if (shouldHaltForToolBudget(state.toolIterations, correcting, toolBudget)) {
    const summary = buildToolBudgetSummary(state.toolNames, correcting);
    return terminalOutcome({ messages, deps, state, iter, reason: "tool_budget", text: summary });
  }
  return null;
}

async function displayToolCallText(result: CompletionResult, deps: AgentDeps): Promise<void> {
  if (result.thinking) { deps.onThinking?.(result.thinking); deps.onEvent?.({ type: "thinking", text: result.thinking }); }
  const shownText = result.text.trim() ? await displayText(deps, result.text) : "";
  if (shownText) { deps.onText?.(shownText); deps.onEvent?.({ type: "text_complete", text: shownText }); }
}
