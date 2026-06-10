import type { LLMProvider, CompletionResult } from "./providers/interface.js";
import type { SafetyClient } from "./safety-client.js";
import type { ToolRegistry } from "./tools/registry.js";
import type { ToolContext } from "./tools/types.js";
import type { Message, ToolCall, ImageAttachment } from "./types.js";
import type { DiffLine } from "./util/diff.js";
import { sanitizeMessages } from "./context.js";
import type { Summarizer } from "./context.js";
import { isErrorResult, buildErrorDetectText, DEFAULT_ERRORDETECT_THRESHOLD } from "./repl/error-detect.js";
import { applySafetyGate, executeWithRetry, compressOutput } from "./agent/dispatch-helpers.js";
import { offloadResult } from "./compress/result-offload.js";
import { persistCompaction, beginTurnContext, prepareCallMessages } from "./agent/context-pipeline.js";
import { join } from "node:path";

export type AgentDeps = {
  provider: LLMProvider;
  safety: SafetyClient;
  registry: ToolRegistry;
  root: string;
  /** Ask the human to approve a gated action. `toolName` lets the host key an
   * allowlist ("always allow this tool"); omitted by tool-internal callers. */
  requestApproval: (action: string, reason: string, toolName?: string) => Promise<boolean>;
  onText?: (text: string) => void;
  /** Extended thinking / reasoning text returned by the provider (e.g. Anthropic
   * extended thinking). Called once per turn when the provider returns thinking. */
  onThinking?: (text: string) => void;
  /** UX-STREAM: typed event emitter — a superset of the individual callbacks above.
   * Surfaces emit both the typed event AND the legacy callback so existing surfaces
   * continue to work; new surfaces can subscribe only to onEvent. */
  onEvent?: (event: StreamEvent) => void;
  /** Live token deltas as the model streams. When set (and the provider supports
   * streaming), the loop streams instead of waiting for the full completion. */
  onTextDelta?: (delta: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, ok: boolean, output: string, diff?: DiffLine[]) => void;
  maxIterations?: number;
  summarize?: Summarizer;
  /** When set, a goal-reminder note is re-injected after context compression. */
  activeGoalText?: string;
  /** Called when consecutive tool failures hit the threshold; fire a note or interrupt. */
  onIterationCheck?: (consecutiveFailures: number) => void;
  /** CC-AUTO-COMPACT: called when a compression round runs, with the dropped count and summary. */
  onAutoCompact?: (dropped: number, summary: string) => void;
  /** Abort the run between iterations (Ctrl+C, gateway shutdown, caller cancel). */
  signal?: AbortSignal;
  /**
   * CC-PLAN-MODE-REAL: when this returns true, only read-only tools are allowed.
   * Write/shell tools return a "blocked: plan mode" result without executing.
   * Set by the interactive host when /planmode is on and the plan is not yet approved.
   */
  planGate?: () => boolean;
};

export type StoppedReason = "done" | "max_iterations" | "repeated_failure" | "interrupted";

/**
 * UX-STREAM: Typed stream-event vocabulary — names what happened so each
 * surface (TUI / REPL / webhook / voice) can render or suppress per its
 * capability without pattern-matching raw strings.
 */
export type StreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "text_complete"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; ok: boolean; output: string }
  | { type: "note"; text: string }
  | { type: "turn_end"; finalText: string; usage?: { inputTokens: number; outputTokens: number } };

export type AgentOutcome = {
  finalText: string;
  iterations: number;
  stoppedReason: StoppedReason;
  /** Total tool calls executed this turn — drives the post-turn self-improvement nudge. */
  toolIterations: number;
  /** Real token usage summed across the turn's provider calls, when reported. */
  usage?: { inputTokens: number; outputTokens: number };
  /** Tokens saved by native compression this turn. */
  tokensSaved?: number;
};

const MAX_CONSECUTIVE_FAILURES = 3;
// Stop if the model calls the exact same tool with the exact same args this many
// times in a turn — it's stuck in a rut, not making progress.
const MAX_IDENTICAL_CALLS = 3;

/**
 * CC-PLAN-MODE-REAL: whitelist of tools that are permitted while plan mode is
 * active and the plan has not yet been approved. Default-deny: anything NOT on
 * this list is blocked, so adding a new write tool doesn't silently bypass the gate.
 */
const PLAN_MODE_ALLOWED_TOOLS = new Set([
  "read_file",
  "edit_file",      // read-path is safe; write-path is blocked by this gate upstream
  "grep_files",
  "glob_files",
  "recall",
  "web_search",
  "web_fetch",
  "lsp_diagnostics",
  "lsp_definition",
  "git_status",
  "git_diff",
  "inspect_state",
  "clarify",
  "screenshot",
  "look_at_screen",
  "look_at_camera",
  "describe_image",
  "compare_vision",
  "watch_video",
  "tool_search",
  "graph_query",
  "bg_list",
  "bg_status",
  "ref_search",
  "ref_list",
  "retrieve_original",
  "todo",           // reading/planning the task list is safe
]);

function callSignature(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args)}`;
}

/** A stateful multi-turn conversation that retains history across `send` calls. */
export type Conversation = {
  /** The live transcript (system first). Read-only in spirit; the loop mutates it. */
  messages: Message[];
  /** Send a user turn (optionally with attached images); runs the loop, keeps history. */
  send: (userText: string, images?: ImageAttachment[], signal?: AbortSignal) => Promise<AgentOutcome>;
  /**
   * Hot-swap the model mid-conversation (the /model picker). Reassigns the
   * provider the loop reads each turn; pass a matching summarizer so context
   * compression stays on the new model. History is preserved. Switch only
   * between turns — never mid-flight.
   */
  setProvider: (provider: LLMProvider, summarize?: Summarizer) => void;
};

/**
 * Open a conversation that persists message history across turns — the basis for
 * the interactive REPL. `runAgent` is the one-shot form of this.
 */
export function createConversation(
  systemPrompt: string,
  deps: AgentDeps,
  opts?: { history?: Message[] },
): Conversation {
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
    send: async (userText: string, images?: ImageAttachment[], signal?: AbortSignal) => {
      await persistCompaction(messages, deps); // shrink the stored convo before the new turn
      return runTurn({ messages, ctx, deps, userText, images, signal });
    },
    setProvider: (provider, summarize) => {
      deps.provider = provider;
      if (summarize) deps.summarize = summarize;
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

async function processToolCalls(
  calls: ToolCall[],
  deps: AgentDeps,
  ctx: ToolContext,
  state: TurnState,
  messages: Message[],
): Promise<string | null> {
  for (const call of calls) {
    const outcome = await dispatchTool(call, deps, ctx);
    state.toolIterations++;
    if (outcome.tokensSaved) state.tokensSaved += outcome.tokensSaved;
    messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: outcome.output });
    await deps.safety.logEvent(`${call.name}: ${outcome.output.slice(0, 120)}`);
    if (outcome.executed) {
      state.consecutiveFailures = outcome.empty ? state.consecutiveFailures + 1 : 0;
      if (isErrorResult(outcome.ok, outcome.output)) {
        state.consecutiveErrorResults++;
        const t = DEFAULT_ERRORDETECT_THRESHOLD;
        if (state.consecutiveErrorResults >= t && state.consecutiveErrorResults % t === 0) {
          try { deps.onText?.(buildErrorDetectText(state.consecutiveErrorResults)); deps.onIterationCheck?.(state.consecutiveErrorResults); } catch { /* best-effort */ }
        }
      } else { state.consecutiveErrorResults = 0; }
    }
    const sig = callSignature(call.name, call.arguments);
    const count = (state.callCounts.get(sig) ?? 0) + 1;
    state.callCounts.set(sig, count);
    if (count >= MAX_IDENTICAL_CALLS) return call.name;
  }
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
    const result = await getCompletion(deps, sanitizeMessages(trimmed), effectiveSignal);
    if (result.usage) { state.turnUsage.inputTokens += result.usage.inputTokens; state.turnUsage.outputTokens += result.usage.outputTokens; state.sawUsage = true; }

    if (result.toolCalls.length === 0) {
      if (result.text.trim()) {
        messages.push({ role: "assistant", content: result.text });
        return { finalText: result.text, iterations: iter, stoppedReason: "done", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
      }
      messages.push({ role: "assistant", content: "" });
      messages.push({ role: "user", content: "You returned nothing. State your result or call a tool." });
      continue;
    }

    if (result.thinking) { deps.onThinking?.(result.thinking); deps.onEvent?.({ type: "thinking", text: result.thinking }); }
    if (result.text.trim()) { deps.onText?.(result.text); deps.onEvent?.({ type: "text_complete", text: result.text }); }
    messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });

    const stuckTool = await processToolCalls(result.toolCalls, deps, ctx, state, messages);
    if (stuckTool)
      return { finalText: `Stopped: called ${stuckTool} with identical arguments ${MAX_IDENTICAL_CALLS} times without progress.`, iterations: iter, stoppedReason: "repeated_failure", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
    if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
      return { finalText: `Stopped: ${MAX_CONSECUTIVE_FAILURES} consecutive tool calls produced no useful output.`, iterations: iter, stoppedReason: "repeated_failure", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
  }

  return { finalText: `Reached the ${maxIter}-iteration limit before completing.`, iterations: maxIter, stoppedReason: "max_iterations", toolIterations: ti(), usage: usage(), tokensSaved: ts() };
}

/**
 * Get one model completion. Streams (emitting onTextDelta per token) when both
 * the provider supports it and a delta consumer is wired; otherwise the plain
 * non-streaming call. Either way returns the assembled CompletionResult so the
 * loop's tool-dispatch path is identical.
 */
async function getCompletion(deps: AgentDeps, messages: Message[], signal?: AbortSignal): Promise<CompletionResult> {
  const schemas = deps.registry.schemas();
  const cfg = signal ? { signal } : undefined;
  if (deps.provider.stream && deps.onTextDelta) {
    let result: CompletionResult | null = null;
    for await (const chunk of deps.provider.stream(messages, schemas, cfg)) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (chunk.type === "text") deps.onTextDelta(chunk.delta);
      else result = chunk.result;
    }
    if (result) return result;
  }
  return deps.provider.complete(messages, schemas, cfg);
}

type DispatchOutcome = { executed: boolean; empty: boolean; output: string; ok: boolean; tokensSaved?: number };

async function dispatchTool(
  call: ToolCall,
  deps: AgentDeps,
  ctx: ToolContext,
): Promise<DispatchOutcome> {
  deps.onToolCall?.(call.name, call.arguments);
  deps.onEvent?.({ type: "tool_start", name: call.name, args: call.arguments });

  const tool = deps.registry.get(call.name);

  // CC-PLAN-MODE-REAL: enforce read-only restriction when plan mode is active.
  if (deps.planGate?.() && !PLAN_MODE_ALLOWED_TOOLS.has(call.name)) {
    const output = `blocked: plan mode is active — read-only tools only. Present your plan and run /planmode approve to proceed.`;
    deps.onToolResult?.(call.name, false, output);
    deps.onEvent?.({ type: "tool_end", name: call.name, ok: false, output });
    return { executed: false, empty: false, ok: false, output };
  }

  const gateResult = await applySafetyGate(call, deps, ctx);
  if (!gateResult.approved) {
    return { executed: false, empty: false, ok: false, output: gateResult.reason ?? "approval denied" };
  }

  const res = await executeWithRetry(call, deps, ctx, tool);
  deps.onToolResult?.(call.name, res.ok, res.output, res.diff);
  deps.onEvent?.({ type: "tool_end", name: call.name, ok: res.ok, output: res.output });

  const compressed = await compressOutput(call.name, res.output, ctx.root);
  // CC-TOOL-RESULT-DISK: size-based backstop AFTER lossy compression — catches any
  // tool (incl. non-allow-listed reads/shell) whose output is still oversized,
  // stashing it whole (CCR store) and replacing it with a preview + retrieval id.
  const offloaded = await offloadResult(compressed.output, { toolName: call.name, dataDir: join(ctx.root, ".vanta") });
  return { executed: true, empty: offloaded.output.trim().length === 0, ok: res.ok, output: offloaded.output, tokensSaved: compressed.tokensSaved };
}
