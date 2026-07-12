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
import { getCompletionWithContextRetry } from "./provider-call.js";
import { maybeStructuredOutput, schemasWithStructuredOutput, structuredOutcome } from "./structured-output.js";
import { buildStructuredOutputInstruction } from "../tools/structured-output.js";
import { runAdvisor } from "./advisor.js";
import { compactOversizedResult } from "../compress/reactive.js";
import type { AgentDeps, AgentOutcome } from "./agent-types.js";
import { buildStopSummary } from "../repl/stop-cmd.js";
import { CONTINUE_NUDGE, shouldAutoContinue } from "./auto-continue.js";
import { MAX_CONSECUTIVE_FAILURES, MAX_IDENTICAL_CALLS, makeInitialState, recordUsage, recordToolOutcome } from "./turn-state.js";
import type { TurnState } from "./turn-state.js";
import { join } from "node:path";
import { buildContextInspection } from "../tools/inspect-context.js";
import { requiredToolNudge } from "./tool-use-contract.js";
import { interruptedDisposition, interruptedToolResult } from "./effect-disposition.js";
import { checkpointToolTranscript, persistEffectTransition } from "./effect-persistence.js";

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

type ProcessToolCallsArgs = { calls: ToolCall[]; deps: AgentDeps; ctx: ToolContext; state: TurnState; messages: Message[]; prefetched?: Map<string, Promise<DispatchOutcome>> };

async function processToolCalls(args: ProcessToolCallsArgs): Promise<string | null> {
  const { calls, deps, ctx, state, messages, prefetched } = args;
  const batch: Array<{ name: string; ok: boolean; output: string }> = [];
  let stuckTool: string | null = null;
  for (const call of calls) {
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
    const t = DEFAULT_ERRORDETECT_THRESHOLD;
    if (deps.advisorProvider && state.consecutiveErrorResults >= t && state.consecutiveErrorResults % t === 0) {
      void runAdvisor(messages, deps.advisorProvider, state.consecutiveErrorResults)
        .then((text) => { deps.onText?.(`\n🔍 Advisor (${state.consecutiveErrorResults} consecutive failures):\n${text}`); })
        .catch(() => { /* best-effort */ });
    }
    if (stuck) {
      stuckTool = stuck;
      break;
    }
  }
  await fireHooks(join(ctx.root, ".vanta"), "PostToolBatch", { tools: batch }, { cwd: ctx.root, ...buildAgentHookDeps(deps) });
  return stuckTool;
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
    if (await shouldAutoContinue({ result, messages, autoContinues: state.autoContinues, toolNames: state.toolNames, deps })) {
      state.autoContinues++;
      if (shown) deps.onText?.(shown); // surface the interim text, then push through
      messages.push({ role: "user", content: CONTINUE_NUDGE });
      return null;
    }
    return { finalText: shown, iterations: iter, stoppedReason: "done", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
  }
  messages.push({ role: "assistant", content: "" });
  messages.push({ role: "user", content: "You returned nothing. State your result or call a tool." });
  return null;
}

type ToolCallIterArgs = { result: CompletionResult; messages: Message[]; deps: AgentDeps; ctx: ToolContext; state: TurnState; prefetched: Map<string, Promise<DispatchOutcome>>; iter: number };

async function handleToolCallsPresent(args: ToolCallIterArgs): Promise<AgentOutcome | null> {
  const { result, messages, deps, ctx, state, prefetched, iter } = args;
  const usage = () => (state.sawUsage ? { ...state.turnUsage } : undefined);
  const ti = () => state.toolIterations;
  const ts = () => (state.tokensSaved > 0 ? state.tokensSaved : undefined);
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
  const stuckTool = await processToolCalls({ calls: result.toolCalls, deps, ctx, state, messages, prefetched });
  if (stuckTool)
    return { finalText: `Stopped: called ${stuckTool} with identical arguments ${MAX_IDENTICAL_CALLS} times without progress.`, iterations: iter, stoppedReason: "repeated_failure", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
    return { finalText: `Stopped: ${MAX_CONSECUTIVE_FAILURES} consecutive tool calls produced no useful output.`, iterations: iter, stoppedReason: "repeated_failure", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
  // VANTA-STOP-CMD: the in-flight tool batch finished — honour a pending soft-stop
  // here (clean post-tool boundary), before the next provider call begins.
  if (deps.shouldSoftStop?.()) {
    const summary = buildStopSummary(state.toolNames);
    return { finalText: await displayText(deps, summary), iterations: iter, stoppedReason: "soft_stopped", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
  }
  return null;
}

export async function runTurn(opts: TurnOpts): Promise<AgentOutcome> {
  const { messages, ctx, deps, userText, images, signal } = opts;
  const effectiveSignal = signal ?? deps.signal;
  const maxIter = deps.maxIterations ?? 50;
  messages.push(images?.length ? { role: "user", content: userText, images } : { role: "user", content: userText });
  const state = makeInitialState();
  const usage = () => (state.sawUsage ? { ...state.turnUsage } : undefined);
  const ti = () => state.toolIterations;
  const ts = () => (state.tokensSaved > 0 ? state.tokensSaved : undefined);
  // OP-CHECKPOINT-ROLLBACK: mark a new turn so file snapshots group per turn.
  globalFileCheckpointStore.beginTurn();
  const turnCtx = beginTurnContext(messages, deps);
  for (let iter = 1; iter <= maxIter; iter++) {
    if (effectiveSignal?.aborted)
      return { finalText: "Interrupted.", iterations: iter - 1, stoppedReason: "interrupted", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
    // Scope schemas once per iteration so countTokens and getCompletion use the same set.
    const scoped = scopeToolSchemas(deps.registry.schemas(), toolScopeContext(messages, deps.activeGoalText), { env: process.env });
    const schemas = schemasWithStructuredOutput(scoped, deps.outputSchema);
    const depsWithTools = { ...deps, currentTools: schemas };
    const trimmed = await prepareCallMessages(messages, depsWithTools, iter, turnCtx);
    const prefetched = new Map<string, Promise<DispatchOutcome>>();
    const completion = await getCompletionWithContextRetry({
      deps,
      depsWithTools,
      messages: trimmed,
      turnCtx,
      signal: effectiveSignal,
      providerCall: { ctx, prefetched, schemas },
    });
    if (!completion.ok)
      return { finalText: completion.error, iterations: iter, stoppedReason: "repeated_failure", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
    const result = completion.result;
    recordUsage(state, result);
    if (result.usage) recordRealPromptCount(messages, result.usage.inputTokens, deps.provider.contextWindow());
    if (result.toolCalls.length === 0) {
      const outcome = await handleNoToolCalls({ result, messages, deps, iter, state, userText, schemas });
      if (outcome) return outcome;
      continue;
    }
    const liveCtx: ToolContext = {
      ...ctx,
      inspectContext: () => buildContextInspection(messages, schemas, deps.provider.contextWindow()),
    };
    const earlyExit = await handleToolCallsPresent({ result, messages, deps, ctx: liveCtx, state, prefetched, iter });
    if (earlyExit) return earlyExit;
  }
  return { finalText: `Reached the ${maxIter}-iteration limit before completing.`, iterations: maxIter, stoppedReason: "max_iterations", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
}

async function displayText(deps: AgentDeps, text: string): Promise<string> {
  await fireHooks(join(deps.root, ".vanta"), "MessageDisplay", { text, role: "assistant" }, { cwd: deps.root, ...buildAgentHookDeps(deps) });
  return (await applyMessageDisplay(deps.hooks ?? globalHookBus, text)).text;
}

// Keep Summarizer in scope for agent.ts which re-exports via session
export type { Summarizer, LLMProvider };
