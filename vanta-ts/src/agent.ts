import type { LLMProvider, CompletionResult } from "./providers/interface.js";
import type { ToolCall } from "./types.js";
import type { ToolContext } from "./tools/types.js";
import type { Message, ImageAttachment } from "./types.js";
import { sanitizeMessages } from "./context.js";
import type { Summarizer } from "./context.js";
import { isErrorResult, buildErrorDetectText, DEFAULT_ERRORDETECT_THRESHOLD } from "./repl/error-detect.js";
import { persistCompaction, beginTurnContext, prepareCallMessages } from "./agent/context-pipeline.js";
import { consumeStream } from "./agent/stream-dispatch.js";
import { applyMessageDisplay } from "./agent/message-display.js";
import { globalHookBus } from "./plugins/hooks.js";
import { dispatchTool } from "./agent/dispatch-tool.js";
import type { DispatchOutcome } from "./agent/dispatch-tool.js";
import { scopeToolSchemas, toolScopeContext } from "./agent/tool-scope.js";

export type { AgentDeps, StreamEvent, AgentOutcome, StoppedReason, Conversation } from "./agent/agent-types.js";
import type { AgentDeps, AgentOutcome } from "./agent/agent-types.js";

const MAX_CONSECUTIVE_FAILURES = 3;
// Stop if the model calls the exact same tool with the exact same args this many
// times in a turn — it's stuck in a rut, not making progress.
const MAX_IDENTICAL_CALLS = 3;

function callSignature(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args)}`;
}

/**
 * Open a conversation that persists message history across turns — the basis for
 * the interactive REPL. `runAgent` is the one-shot form of this.
 */
export function createConversation(
  systemPrompt: string,
  deps: AgentDeps,
  opts?: { history?: Message[] },
) {
  // Fresh system prompt (goals/time may have changed) + any prior non-system
  // turns, so a resumed session keeps its transcript but re-grounds its rules.
  const messages: Message[] = [{ role: "system", content: systemPrompt }];
  if (opts?.history?.length) {
    messages.push(...opts.history.filter((m) => m.role !== "system"));
  }
  const ctx: ToolContext = {
    root: deps.root,
    safety: deps.safety,
    requestApproval: deps.requestApproval,
  };
  return {
    messages,
    send: async (userText: string, images?: ImageAttachment[], signal?: AbortSignal): Promise<AgentOutcome> => {
      await persistCompaction(messages, deps); // shrink the stored convo before the new turn
      return runTurn({ messages, ctx, deps, userText, images, signal });
    },
    setProvider: (provider: LLMProvider, summarize?: Summarizer) => {
      deps.provider = provider;
      if (summarize) deps.summarize = summarize;
    },
    setSessionMemory: (text: string) => {
      deps.sessionMemory = text;
    },
  };
}

/** One-shot: a fresh conversation with a single user turn. Behaviour unchanged. */
export async function runAgent(
  systemPrompt: string,
  instruction: string,
  deps: AgentDeps,
): Promise<AgentOutcome> {
  return createConversation(systemPrompt, deps).send(instruction);
}

type TurnOpts = {
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

type ProcessToolCallsArgs = {
  calls: ToolCall[];
  deps: AgentDeps;
  ctx: ToolContext;
  state: TurnState;
  messages: Message[];
  prefetched?: Map<string, Promise<DispatchOutcome>>;
};

/** Update per-call counters/alerts after a tool executes. Returns stuck tool name or null. */
function recordToolOutcome(
  state: TurnState,
  call: ToolCall,
  outcome: DispatchOutcome,
  deps: AgentDeps,
): string | null {
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

async function processToolCalls(args: ProcessToolCallsArgs): Promise<string | null> {
  const { calls, deps, ctx, state, messages, prefetched } = args;
  for (const call of calls) {
    // A concurrency-safe tool may already be running (started mid-stream) — await
    // that in-flight result instead of dispatching it a second time.
    const inFlight = prefetched?.get(call.id);
    const outcome = inFlight ? await inFlight : await dispatchTool(call, deps, ctx);
    state.toolIterations++;
    if (outcome.tokensSaved) state.tokensSaved += outcome.tokensSaved;
    messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: outcome.output });
    await deps.safety.logEvent(`${call.name}: ${outcome.output.slice(0, 120)}`);
    const stuck = recordToolOutcome(state, call, outcome, deps);
    if (stuck) return stuck;
  }
  return null;
}

type NoToolCallsArgs = {
  result: CompletionResult;
  messages: Message[];
  deps: AgentDeps;
  iter: number;
  state: TurnState;
};

/** Handle a completion that returned no tool calls. Returns an outcome or null to continue. */
async function handleNoToolCalls(args: NoToolCallsArgs): Promise<AgentOutcome | null> {
  const { result, messages, deps, iter, state } = args;
  const usage = () => (state.sawUsage ? { ...state.turnUsage } : undefined);
  const ti = () => state.toolIterations;
  const ts = () => (state.tokensSaved > 0 ? state.tokensSaved : undefined);

  if (result.text.trim()) {
    messages.push({ role: "assistant", content: result.text }); // raw → model + tools
    return { finalText: await displayText(deps, result.text), iterations: iter, stoppedReason: "done", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
  }
  messages.push({ role: "assistant", content: "" });
  messages.push({ role: "user", content: "You returned nothing. State your result or call a tool." });
  return null; // continue iterating
}

type ToolCallIterArgs = {
  result: CompletionResult;
  messages: Message[];
  deps: AgentDeps;
  ctx: ToolContext;
  state: TurnState;
  prefetched: Map<string, Promise<DispatchOutcome>>;
  iter: number;
};

/** Handle an iteration where tool calls are present. Returns an early-exit outcome or null to continue. */
async function handleToolCallsPresent(args: ToolCallIterArgs): Promise<AgentOutcome | null> {
  const { result, messages, deps, ctx, state, prefetched, iter } = args;
  const usage = () => (state.sawUsage ? { ...state.turnUsage } : undefined);
  const ti = () => state.toolIterations;
  const ts = () => (state.tokensSaved > 0 ? state.tokensSaved : undefined);

  if (result.thinking) { deps.onThinking?.(result.thinking); deps.onEvent?.({ type: "thinking", text: result.thinking }); }
  const shownText = result.text.trim() ? await displayText(deps, result.text) : "";
  if (shownText) { deps.onText?.(shownText); deps.onEvent?.({ type: "text_complete", text: shownText }); }
  messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls }); // raw → model + tools

  const stuckTool = await processToolCalls({ calls: result.toolCalls, deps, ctx, state, messages, prefetched });
  if (stuckTool)
    return { finalText: `Stopped: called ${stuckTool} with identical arguments ${MAX_IDENTICAL_CALLS} times without progress.`, iterations: iter, stoppedReason: "repeated_failure", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
    return { finalText: `Stopped: ${MAX_CONSECUTIVE_FAILURES} consecutive tool calls produced no useful output.`, iterations: iter, stoppedReason: "repeated_failure", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
  return null;
}

async function runTurn(opts: TurnOpts): Promise<AgentOutcome> {
  const { messages, ctx, deps, userText, images, signal } = opts;
  const effectiveSignal = signal ?? deps.signal;
  const maxIter = deps.maxIterations ?? 50;
  messages.push(images?.length ? { role: "user", content: userText, images } : { role: "user", content: userText });
  const state = makeInitialState();
  const usage = () => (state.sawUsage ? { ...state.turnUsage } : undefined);
  const ti = () => state.toolIterations;
  const ts = () => (state.tokensSaved > 0 ? state.tokensSaved : undefined);

  // Per-turn context-window state (idle gap, tracked summarizer, threshold).
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

/** Run assistant text through the message_display hooks for the screen. The raw
 * text stays in the transcript; this only changes what is shown. */
async function displayText(deps: AgentDeps, text: string): Promise<string> {
  return (await applyMessageDisplay(deps.hooks ?? globalHookBus, text)).text;
}

/**
 * Get one model completion. Streams (emitting onTextDelta per token) when both
 * the provider supports it and a delta consumer is wired; otherwise the plain
 * non-streaming call. While streaming, a concurrency-safe tool block is started
 * the moment it completes (stashed in `pf.prefetched` by call id) so it overlaps
 * the model generating later blocks. Either way returns the assembled
 * CompletionResult so the loop's tool-dispatch path is identical.
 */
async function getCompletion(
  deps: AgentDeps,
  messages: Message[],
  signal?: AbortSignal,
  pf?: { ctx: ToolContext; prefetched: Map<string, Promise<DispatchOutcome>> },
): Promise<CompletionResult> {
  const schemas = scopeToolSchemas(deps.registry.schemas(), toolScopeContext(messages, deps.activeGoalText), { env: process.env });
  const cfg = signal ? { signal } : undefined;
  if (deps.provider.stream && deps.onTextDelta) {
    const onSafeToolCall = pf
      ? (call: ToolCall) => {
          if (!pf.prefetched.has(call.id)) pf.prefetched.set(call.id, dispatchTool(call, deps, pf.ctx));
        }
      : undefined;
    const result = await consumeStream({
      stream: deps.provider.stream(messages, schemas, cfg),
      onTextDelta: deps.onTextDelta,
      signal,
      onSafeToolCall,
    });
    if (result) return result;
  }
  return deps.provider.complete(messages, schemas, cfg);
}
