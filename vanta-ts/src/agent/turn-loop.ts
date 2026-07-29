import type { LLMProvider, CompletionResult } from "../providers/interface.js";
import type { ToolCall } from "../types.js";
import type { ToolContext } from "../tools/types.js";
import type { Message, ImageAttachment } from "../types.js";
import type { Summarizer } from "../context.js";
import { DEFAULT_ERRORDETECT_THRESHOLD } from "../repl/error-detect.js";
import { beginTurnContext, prepareCallMessages, recordRealPromptCount } from "./context-pipeline.js";
import { applyMessageDisplay } from "./message-display.js";
import { globalHookBus } from "../plugins/hooks.js";
import { globalFileCheckpointStore } from "../sessions/file-checkpoint.js";
import { dispatchTool } from "./dispatch-tool.js";
import type { DispatchOutcome } from "./dispatch-tool.js";
import { buildAgentHookDeps } from "../hooks/agent-hook-deps.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import { scopeToolSchemas, toolScopeContext } from "./tool-scope.js";
import { completeAndRecordUsage } from "./provider-usage.js";
import { maybeStructuredOutput, schemasWithStructuredOutput, structuredOutcome } from "./structured-output.js";
import { buildStructuredOutputInstruction } from "../tools/structured-output.js";
import { runAdvisor } from "./advisor.js";
import { compactOversizedResult } from "../compress/reactive.js";
import type { AgentDeps, AgentOutcome } from "./agent-types.js";
import { buildStopSummary } from "../repl/stop-cmd.js";
import { buildContinueNudge, shouldAutoContinue } from "./auto-continue.js";
import { MAX_CONSECUTIVE_FAILURES, MAX_IDENTICAL_CALLS, makeInitialState, recordUsage, recordToolOutcome } from "./turn-state.js";
import type { TurnState } from "./turn-state.js";
import { join } from "node:path";
import { buildContextInspection } from "../tools/inspect-context.js";
import { requiredToolNudge } from "./tool-use-contract.js";
import { interruptedDisposition, interruptedToolResult } from "./effect-disposition.js";
import { checkpointToolTranscript, persistEffectTransition } from "./effect-persistence.js";
import { detectAdaptiveRedirect, detectAdaptiveSupport, injectAdaptiveSupport, type AdaptiveSupportPlan } from "./adaptive-support.js";
import {
  buildToolBudgetSummary,
  buildToolClosureDirective,
  effectiveToolBudget,
  isToolAllowedDuringClosure,
  resolveToolBudget,
  resolveToolClosureReserve,
  scopeToolsForClosure,
  shouldEnterToolClosure,
  shouldHaltForToolBudget,
} from "./tool-budget.js";
import { resolvePermissionMode } from "../modes/permission-mode.js";
import { beginTtftTurn } from "../performance/ttft-trace.js";

export type TurnOpts = {
  messages: Message[];
  ctx: ToolContext;
  deps: AgentDeps;
  userText: string;
  images?: ImageAttachment[];
  signal?: AbortSignal;
};

/**
 * Log a tool result to the kernel event log as status + size ONLY — never the
 * raw output. Tool output can carry secrets (read_file of .env, gmail of a key
 * email); the full result already lives in the session transcript, so the
 * world-readable, audit-sealed event log only needs a marker. Best-effort: a
 * log failure must never abort a turn.
 */
async function logToolOutcome(deps: AgentDeps, name: string, ok: boolean, chars: number): Promise<void> {
  try {
    await deps.safety.logEvent(`${name}: ${ok ? "ok" : "err"} (${chars} chars)`);
  } catch {
    /* best-effort */
  }
}

type ProcessToolCallsArgs = {
  calls: ToolCall[];
  deps: AgentDeps;
  ctx: ToolContext;
  state: TurnState;
  messages: Message[];
  hardToolBudget: number;
  toolBudgetClosure: boolean;
  prefetched?: Map<string, Promise<DispatchOutcome>>;
};

function maybeRunAdvisor(messages: Message[], deps: AgentDeps, state: TurnState): void {
  const threshold = DEFAULT_ERRORDETECT_THRESHOLD;
  if (!deps.advisorProvider || state.consecutiveErrorResults < threshold || state.consecutiveErrorResults % threshold !== 0) return;
  void runAdvisor(messages, deps.advisorProvider, state.consecutiveErrorResults)
    .then((text) => { deps.onText?.(`\n🔍 Advisor (${state.consecutiveErrorResults} consecutive failures):\n${text}`); })
    .catch(() => { /* best-effort */ });
}

async function processToolCalls(args: ProcessToolCallsArgs): Promise<{ stuckTool: string | null; budgetExhausted: boolean }> {
  const { calls, deps, ctx, state, messages, hardToolBudget, toolBudgetClosure, prefetched } = args;
  const batch: Array<{ name: string; ok: boolean; output: string }> = [];
  let stuckTool: string | null = null;
  let budgetExhausted = false;
  for (let index = 0; index < calls.length; index++) {
    const call = calls[index]!;
    if (hardToolBudget > 0 && state.toolIterations >= hardToolBudget) {
      budgetExhausted = true;
      for (const skipped of calls.slice(index)) {
        const output = "Not executed: the turn reached its hard tool-call safety limit.";
        messages.push({ role: "tool", toolCallId: skipped.id, name: skipped.name, content: output, effectDisposition: "none" });
        await persistEffectTransition(ctx.root, deps.sessionId, skipped, "settled", "none");
      }
      await checkpointToolTranscript(deps.sessionId, messages);
      break;
    }
    if (toolBudgetClosure && !isToolAllowedDuringClosure(call.name)) {
      const output = "Not executed: broad search and browser acquisition are closed for this turn. Finish from the evidence already collected.";
      const outcome: DispatchOutcome = { executed: false, empty: false, ok: false, output, effectDisposition: "none" };
      batch.push({ name: call.name, ok: false, output });
      state.toolNames.push(call.name);
      state.toolIterations++;
      messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: output, effectDisposition: "none" });
      await persistEffectTransition(ctx.root, deps.sessionId, call, "settled", "none");
      await checkpointToolTranscript(deps.sessionId, messages);
      await logToolOutcome(deps, call.name, false, output.length);
      const stuck = recordToolOutcome(state, call, outcome, deps);
      if (stuck) {
        stuckTool = stuck;
        break;
      }
      continue;
    }
    const inFlight = prefetched?.get(call.id);
    let executionStarted = false;
    const trackedCtx: ToolContext = {
      ...ctx,
      onToolExecutionStart: async () => {
        executionStarted = true;
        call.effectState = "started";
        await persistEffectTransition(ctx.root, deps.sessionId, call, "started");
        await checkpointToolTranscript(deps.sessionId, messages);
      },
    };
    let outcome: DispatchOutcome;
    try {
      outcome = inFlight ? await inFlight : await dispatchTool(call, deps, trackedCtx);
    } catch (error) {
      const disposition = interruptedDisposition(call, executionStarted);
      const synthetic = interruptedToolResult(call, disposition);
      outcome = { executed: executionStarted, empty: false, ok: false, output: `${synthetic.content}\nError: ${error instanceof Error ? error.message : String(error)}`, effectDisposition: disposition };
    }
    batch.push({ name: call.name, ok: outcome.ok, output: outcome.output });
    state.toolNames.push(call.name);
    state.toolIterations++;
    if (outcome.tokensSaved) state.tokensSaved += outcome.tokensSaved;
    const reactive = compactOversizedResult(outcome.output, { contextWindow: deps.provider.contextWindow() });
    if (reactive.tokensSaved) state.tokensSaved += reactive.tokensSaved;
    messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: reactive.output, effectDisposition: outcome.effectDisposition });
    await persistEffectTransition(ctx.root, deps.sessionId, call, "settled", outcome.effectDisposition);
    await checkpointToolTranscript(deps.sessionId, messages);
    await logToolOutcome(deps, call.name, outcome.ok, reactive.output.length);
    const stuck = recordToolOutcome(state, call, outcome, deps);
    maybeRunAdvisor(messages, deps, state);
    if (stuck) {
      stuckTool = stuck;
      break;
    }
  }
  await fireHooks(join(ctx.root, ".vanta"), "PostToolBatch", { tools: batch }, { cwd: ctx.root, ...buildAgentHookDeps(deps) });
  return { stuckTool, budgetExhausted };
}

type NoToolCallsArgs = { result: CompletionResult; messages: Message[]; deps: AgentDeps; iter: number; state: TurnState; userText: string; schemas: import("../providers/interface.js").ToolSchema[] };

async function handleNoToolCalls(args: NoToolCallsArgs): Promise<AgentOutcome | null> {
  const { result, messages, deps, iter, state, userText, schemas } = args;
  const usage = () => (state.sawUsage ? { ...state.turnUsage } : undefined);
  const ti = () => state.toolIterations;
  const ts = () => (state.tokensSaved > 0 ? state.tokensSaved : undefined);
  if (result.text.trim()) {
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
    return { finalText: shown, iterations: iter, stoppedReason: "done", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
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
    usage: state.sawUsage ? { ...state.turnUsage } : undefined,
    tokensSaved: state.tokensSaved > 0 ? state.tokensSaved : undefined,
  };
}

function usesCorrectionLeash(plan: AdaptiveSupportPlan, deps: AgentDeps): boolean {
  const mode = deps.permissionMode?.() ?? resolvePermissionMode(process.env);
  return plan.signals.includes("correction") && mode !== "auto" && mode !== "fullAccess";
}

async function handleToolCallsPresent(args: ToolCallIterArgs): Promise<AgentOutcome | null> {
  const { result, messages, deps, ctx, state, prefetched, iter, support, hardToolBudget } = args;
  const usage = () => (state.sawUsage ? { ...state.turnUsage } : undefined);
  if (result.thinking) { deps.onThinking?.(result.thinking); deps.onEvent?.({ type: "thinking", text: result.thinking }); }
  const shownText = result.text.trim() ? await displayText(deps, result.text) : "";
  if (shownText) { deps.onText?.(shownText); deps.onEvent?.({ type: "text_complete", text: shownText }); }
  messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });
  for (const call of result.toolCalls) {
    call.effectState = "pending";
    await persistEffectTransition(ctx.root, deps.sessionId, call, "pending");
  }
  await checkpointToolTranscript(deps.sessionId, messages);
  const structured = maybeStructuredOutput(result.toolCalls, deps.outputSchema);
  if (structured.handled) {
    messages.push({ role: "tool", toolCallId: result.toolCalls.find((c) => c.name === "StructuredOutput")?.id ?? "structured-output", name: "StructuredOutput", content: structured.output, effectDisposition: "none" });
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
  const { messages, ctx, deps, userText, images, signal } = opts;
  const ttft = beginTtftTurn(deps.usageAgent ?? "agent");
  const effectiveSignal = signal ?? deps.signal;
  const maxIter = deps.maxIterations ?? 50;
  const adaptiveSupport = detectAdaptiveSupport(userText, messages);
  // DRIFT-HARD-ENFORCE: per-turn tool-budget breaker. Manual/Accept edits tighten
  // during a correction; Auto/Full access keep the bounded general ceiling.
  const toolBudget = resolveToolBudget(process.env);
  const toolClosureReserve = resolveToolClosureReserve(process.env);
  const correcting = usesCorrectionLeash(adaptiveSupport, deps);
  const hardToolBudget = effectiveToolBudget(correcting, toolBudget);
  messages.push(images?.length ? { role: "user", content: userText, images } : { role: "user", content: userText });
  const state = makeInitialState();
  // OP-CHECKPOINT-ROLLBACK: mark a new turn so file snapshots group per turn.
  globalFileCheckpointStore.beginTurn(); const turnCtx = beginTurnContext(messages, deps);
  for (let iter = 1; iter <= maxIter; iter++) {
    if (effectiveSignal?.aborted) return terminalOutcome({ messages, deps, state, iter: iter - 1, reason: "interrupted", text: "Interrupted." });
    // Scope schemas once per iteration so countTokens and getCompletion use the same set.
    const scoped = scopeToolSchemas(deps.registry.schemas(), toolScopeContext(messages, deps.activeGoalText), { env: process.env });
    const phaseScoped = state.toolBudgetClosure ? scopeToolsForClosure(scoped) : scoped;
    const schemas = schemasWithStructuredOutput(phaseScoped, deps.outputSchema);
    const depsWithTools = { ...deps, currentTools: schemas };
    const prepared = await prepareCallMessages(messages, depsWithTools, iter, turnCtx);
    const redirectForCall = state.adaptiveRedirect;
    state.adaptiveRedirect = "";
    const closureDirective = state.toolBudgetClosure ? buildToolClosureDirective(state.openTodoCount) : "";
    const trimmed = injectAdaptiveSupport(prepared, [adaptiveSupport.directive, redirectForCall, closureDirective]);
    const prefetched = new Map<string, Promise<DispatchOutcome>>();
    const prefetchLimit = hardToolBudget > 0 ? Math.max(0, hardToolBudget - state.toolIterations) : undefined;
    const completion = await completeAndRecordUsage({
      deps,
      depsWithTools,
      messages: trimmed,
      turnCtx,
      signal: effectiveSignal,
      providerCall: { ctx, prefetched, schemas, ...(prefetchLimit === undefined ? {} : { prefetchLimit }), ttft },
    });
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
      inspectContext: () => buildContextInspection(messages, schemas, deps.provider.contextWindow()),
    };
    const earlyExit = await handleToolCallsPresent({ result, messages, deps, ctx: liveCtx, state, prefetched, iter, support: adaptiveSupport, hardToolBudget });
    if (earlyExit) return earlyExit;
    // At the predeclared threshold, close broad acquisition and spend only the
    // remaining fixed reserve on synthesis, verification, output, and plan
    // closure. This does not raise or reset the hard budget.
    if (!state.toolBudgetClosure && shouldEnterToolClosure(state.toolIterations, correcting, toolBudget, toolClosureReserve)) {
      state.toolBudgetClosure = true;
      continue;
    }
    if (shouldHaltForToolBudget(state.toolIterations, correcting, toolBudget)) {
      const summary = buildToolBudgetSummary(state.toolNames, correcting);
      return terminalOutcome({ messages, deps, state, iter, reason: "tool_budget", text: summary });
    }
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
export type { Summarizer, LLMProvider };
