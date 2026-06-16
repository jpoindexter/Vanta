import type { LLMProvider, CompletionResult } from "../providers/interface.js";
import type { ToolCall } from "../types.js";
import type { ToolContext } from "../tools/types.js";
import type { Message, ImageAttachment } from "../types.js";
import { sanitizeMessages } from "../context.js";
import type { Summarizer } from "../context.js";
import { isErrorResult, buildErrorDetectText, DEFAULT_ERRORDETECT_THRESHOLD } from "../repl/error-detect.js";
import { persistCompaction, beginTurnContext, prepareCallMessages } from "./context-pipeline.js";
import { consumeStream } from "./stream-dispatch.js";
import { applyMessageDisplay } from "./message-display.js";
import { globalHookBus } from "../plugins/hooks.js";
import { dispatchTool } from "./dispatch-tool.js";
import type { DispatchOutcome } from "./dispatch-tool.js";
import { scopeToolSchemas, toolScopeContext } from "./tool-scope.js";
import { maybeStructuredOutput, schemasWithStructuredOutput, structuredOutcome } from "./structured-output.js";
import { buildStructuredOutputInstruction } from "../tools/structured-output.js";
import { runAdvisor } from "./advisor.js";
import { compactOversizedResult } from "../compress/reactive.js";
import type { AgentDeps, AgentOutcome } from "./agent-types.js";

const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_IDENTICAL_CALLS = 3;

function callSignature(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args)}`;
}

export type TurnOpts = {
  messages: Message[];
  ctx: ToolContext;
  deps: AgentDeps;
  userText: string;
  images?: ImageAttachment[];
  signal?: AbortSignal;
};

type TurnState = {
  consecutiveFailures: number;
  consecutiveErrorResults: number;
  toolIterations: number;
  turnUsage: { inputTokens: number; outputTokens: number };
  sawUsage: boolean;
  callCounts: Map<string, number>;
  tokensSaved: number;
};

function makeInitialState(): TurnState {
  return { consecutiveFailures: 0, consecutiveErrorResults: 0, toolIterations: 0, turnUsage: { inputTokens: 0, outputTokens: 0 }, sawUsage: false, callCounts: new Map(), tokensSaved: 0 };
}

function recordToolOutcome(state: TurnState, call: ToolCall, outcome: DispatchOutcome, deps: AgentDeps): string | null {
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
  const sig = callSignature(call.name, call.arguments);
  const count = (state.callCounts.get(sig) ?? 0) + 1;
  state.callCounts.set(sig, count);
  return count >= MAX_IDENTICAL_CALLS ? call.name : null;
}

type ProcessToolCallsArgs = { calls: ToolCall[]; deps: AgentDeps; ctx: ToolContext; state: TurnState; messages: Message[]; prefetched?: Map<string, Promise<DispatchOutcome>> };

async function processToolCalls(args: ProcessToolCallsArgs): Promise<string | null> {
  const { calls, deps, ctx, state, messages, prefetched } = args;
  for (const call of calls) {
    const inFlight = prefetched?.get(call.id);
    const outcome = inFlight ? await inFlight : await dispatchTool(call, deps, ctx);
    state.toolIterations++;
    if (outcome.tokensSaved) state.tokensSaved += outcome.tokensSaved;
    const reactive = compactOversizedResult(outcome.output, { contextWindow: deps.provider.contextWindow() });
    if (reactive.tokensSaved) state.tokensSaved += reactive.tokensSaved;
    messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: reactive.output });
    await deps.safety.logEvent(`${call.name}: ${reactive.output.slice(0, 120)}`);
    const stuck = recordToolOutcome(state, call, outcome, deps);
    const t = DEFAULT_ERRORDETECT_THRESHOLD;
    if (deps.advisorProvider && state.consecutiveErrorResults >= t && state.consecutiveErrorResults % t === 0) {
      void runAdvisor(messages, deps.advisorProvider, state.consecutiveErrorResults)
        .then((text) => { deps.onText?.(`\n🔍 Advisor (${state.consecutiveErrorResults} consecutive failures):\n${text}`); })
        .catch(() => { /* best-effort */ });
    }
    if (stuck) return stuck;
  }
  return null;
}

type NoToolCallsArgs = { result: CompletionResult; messages: Message[]; deps: AgentDeps; iter: number; state: TurnState };

async function handleNoToolCalls(args: NoToolCallsArgs): Promise<AgentOutcome | null> {
  const { result, messages, deps, iter, state } = args;
  const usage = () => (state.sawUsage ? { ...state.turnUsage } : undefined);
  const ti = () => state.toolIterations;
  const ts = () => (state.tokensSaved > 0 ? state.tokensSaved : undefined);
  if (result.text.trim()) {
    messages.push({ role: "assistant", content: result.text });
    return { finalText: await displayText(deps, result.text), iterations: iter, stoppedReason: "done", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
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
  const structured = maybeStructuredOutput(result.toolCalls, deps.outputSchema);
  if (structured.handled) {
    messages.push({ role: "tool", toolCallId: result.toolCalls.find((c) => c.name === "StructuredOutput")?.id ?? "structured-output", name: "StructuredOutput", content: structured.output });
    return structuredOutcome(structured, iter, usage());
  }
  const stuckTool = await processToolCalls({ calls: result.toolCalls, deps, ctx, state, messages, prefetched });
  if (stuckTool)
    return { finalText: `Stopped: called ${stuckTool} with identical arguments ${MAX_IDENTICAL_CALLS} times without progress.`, iterations: iter, stoppedReason: "repeated_failure", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
    return { finalText: `Stopped: ${MAX_CONSECUTIVE_FAILURES} consecutive tool calls produced no useful output.`, iterations: iter, stoppedReason: "repeated_failure", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
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
  const turnCtx = beginTurnContext(messages, deps);
  for (let iter = 1; iter <= maxIter; iter++) {
    if (effectiveSignal?.aborted)
      return { finalText: "Interrupted.", iterations: iter - 1, stoppedReason: "interrupted", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
    const trimmed = await prepareCallMessages(messages, deps, iter, turnCtx);
    const prefetched = new Map<string, Promise<DispatchOutcome>>();
    const result = await getCompletion(deps, sanitizeMessages(trimmed), effectiveSignal, { ctx, prefetched });
    if (result.usage) { state.turnUsage.inputTokens += result.usage.inputTokens; state.turnUsage.outputTokens += result.usage.outputTokens; state.sawUsage = true; }
    if (result.toolCalls.length === 0) {
      const outcome = await handleNoToolCalls({ result, messages, deps, iter, state });
      if (outcome) return outcome;
      continue;
    }
    const earlyExit = await handleToolCallsPresent({ result, messages, deps, ctx, state, prefetched, iter });
    if (earlyExit) return earlyExit;
  }
  return { finalText: `Reached the ${maxIter}-iteration limit before completing.`, iterations: maxIter, stoppedReason: "max_iterations", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
}

async function displayText(deps: AgentDeps, text: string): Promise<string> {
  return (await applyMessageDisplay(deps.hooks ?? globalHookBus, text)).text;
}

async function getCompletion(
  deps: AgentDeps,
  messages: Message[],
  signal?: AbortSignal,
  pf?: { ctx: ToolContext; prefetched: Map<string, Promise<DispatchOutcome>> },
): Promise<CompletionResult> {
  const scoped = scopeToolSchemas(deps.registry.schemas(), toolScopeContext(messages, deps.activeGoalText), { env: process.env });
  const schemas = schemasWithStructuredOutput(scoped, deps.outputSchema);
  const cfg = { ...(signal ? { signal } : {}), effortLevel: deps.getEffortLevel?.() };
  if (deps.provider.stream && deps.onTextDelta) {
    const onSafeToolCall = pf
      ? (call: ToolCall) => {
          if (!pf.prefetched.has(call.id)) pf.prefetched.set(call.id, dispatchTool(call, deps, pf.ctx));
        }
      : undefined;
    const result = await consumeStream({ stream: deps.provider.stream(messages, schemas, cfg), onTextDelta: deps.onTextDelta, signal, onSafeToolCall });
    if (result) return result;
  }
  return deps.provider.complete(messages, schemas, cfg);
}

// Keep Summarizer in scope for agent.ts which re-exports via session
export type { Summarizer, LLMProvider };
