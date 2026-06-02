import type { LLMProvider, CompletionResult } from "./providers/interface.js";
import type { SafetyClient } from "./safety-client.js";
import type { ToolRegistry } from "./tools/registry.js";
import type { ToolContext } from "./tools/types.js";
import type { Message, ToolCall } from "./types.js";
import { trimMessages, compressMessages, sanitizeMessages } from "./context.js";
import type { Summarizer } from "./context.js";

export type AgentDeps = {
  provider: LLMProvider;
  safety: SafetyClient;
  registry: ToolRegistry;
  root: string;
  /** Ask the human to approve a gated action. `toolName` lets the host key an
   * allowlist ("always allow this tool"); omitted by tool-internal callers. */
  requestApproval: (action: string, reason: string, toolName?: string) => Promise<boolean>;
  onText?: (text: string) => void;
  /** Live token deltas as the model streams. When set (and the provider supports
   * streaming), the loop streams instead of waiting for the full completion. */
  onTextDelta?: (delta: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, ok: boolean, output: string) => void;
  maxIterations?: number;
  summarize?: Summarizer;
  /** Abort the run between iterations (Ctrl+C, gateway shutdown, caller cancel). */
  signal?: AbortSignal;
};

export type StoppedReason = "done" | "max_iterations" | "repeated_failure" | "interrupted";

export type AgentOutcome = {
  finalText: string;
  iterations: number;
  stoppedReason: StoppedReason;
  /** Total tool calls executed this turn — drives the post-turn self-improvement nudge. */
  toolIterations: number;
};

const MAX_CONSECUTIVE_FAILURES = 3;
// Stop if the model calls the exact same tool with the exact same args this many
// times in a turn — it's stuck in a rut, not making progress (Hermes guardrail).
const MAX_IDENTICAL_CALLS = 3;

function callSignature(name: string, args: Record<string, unknown>): string {
  return `${name}:${JSON.stringify(args)}`;
}

/** A stateful multi-turn conversation that retains history across `send` calls. */
export type Conversation = {
  /** The live transcript (system first). Read-only in spirit; the loop mutates it. */
  messages: Message[];
  /** Send a user turn; runs the agent loop and returns the outcome, keeping history. */
  send: (userText: string) => Promise<AgentOutcome>;
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
    send: (userText: string) => runTurn(messages, ctx, deps, userText),
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

async function runTurn(
  messages: Message[],
  ctx: ToolContext,
  deps: AgentDeps,
  userText: string,
): Promise<AgentOutcome> {
  const maxIter = deps.maxIterations ?? 50;
  messages.push({ role: "user", content: userText });
  let consecutiveFailures = 0;
  let toolIterations = 0;
  const callCounts = new Map<string, number>();

  for (let iter = 1; iter <= maxIter; iter++) {
    if (deps.signal?.aborted) {
      return {
        finalText: "Interrupted.",
        iterations: iter - 1,
        stoppedReason: "interrupted",
        toolIterations,
      };
    }
    const trimmed = deps.summarize
      ? await compressMessages(messages, deps.provider.contextWindow(), deps.summarize)
      : trimMessages(messages, deps.provider.contextWindow());
    const safe = sanitizeMessages(trimmed); // final pre-flight scrub (orphans, surrogates)
    const result = await getCompletion(deps, safe);

    if (result.toolCalls.length === 0) {
      if (result.text.trim()) {
        messages.push({ role: "assistant", content: result.text });
        return { finalText: result.text, iterations: iter, stoppedReason: "done", toolIterations };
      }
      // Empty, no tools: nudge once and continue.
      messages.push({ role: "assistant", content: "" });
      messages.push({
        role: "user",
        content: "You returned nothing. State your result or call a tool.",
      });
      continue;
    }

    if (result.text.trim()) deps.onText?.(result.text);
    messages.push({
      role: "assistant",
      content: result.text,
      toolCalls: result.toolCalls,
    });

    let stuckTool: string | null = null;
    for (const call of result.toolCalls) {
      const outcome = await dispatchTool(call, deps, ctx);
      toolIterations++;
      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: outcome.output,
      });
      await deps.safety.logEvent(`${call.name}: ${outcome.output.slice(0, 120)}`);
      if (outcome.executed) {
        consecutiveFailures = outcome.empty ? consecutiveFailures + 1 : 0;
      }
      const sig = callSignature(call.name, call.arguments);
      const count = (callCounts.get(sig) ?? 0) + 1;
      callCounts.set(sig, count);
      if (count >= MAX_IDENTICAL_CALLS) stuckTool = call.name;
    }

    if (stuckTool) {
      return {
        finalText: `Stopped: called ${stuckTool} with identical arguments ${MAX_IDENTICAL_CALLS} times without progress.`,
        iterations: iter,
        stoppedReason: "repeated_failure",
        toolIterations,
      };
    }

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      return {
        finalText: `Stopped: ${MAX_CONSECUTIVE_FAILURES} consecutive tool calls produced no useful output.`,
        iterations: iter,
        stoppedReason: "repeated_failure",
        toolIterations,
      };
    }
  }

  return {
    finalText: `Reached the ${maxIter}-iteration limit before completing.`,
    iterations: maxIter,
    stoppedReason: "max_iterations",
    toolIterations,
  };
}

/**
 * Get one model completion. Streams (emitting onTextDelta per token) when both
 * the provider supports it and a delta consumer is wired; otherwise the plain
 * non-streaming call. Either way returns the assembled CompletionResult so the
 * loop's tool-dispatch path is identical.
 */
async function getCompletion(deps: AgentDeps, messages: Message[]): Promise<CompletionResult> {
  const schemas = deps.registry.schemas();
  if (deps.provider.stream && deps.onTextDelta) {
    let result: CompletionResult | null = null;
    for await (const chunk of deps.provider.stream(messages, schemas)) {
      if (chunk.type === "text") deps.onTextDelta(chunk.delta);
      else result = chunk.result;
    }
    if (result) return result;
  }
  return deps.provider.complete(messages, schemas);
}

type DispatchOutcome = { executed: boolean; empty: boolean; output: string };

async function dispatchTool(
  call: ToolCall,
  deps: AgentDeps,
  ctx: ToolContext,
): Promise<DispatchOutcome> {
  deps.onToolCall?.(call.name, call.arguments);
  const tool = deps.registry.get(call.name);
  if (!tool) {
    return { executed: false, empty: false, output: `unknown tool: ${call.name}` };
  }

  const action = tool.describeForSafety
    ? tool.describeForSafety(call.arguments)
    : `${call.name} ${JSON.stringify(call.arguments)}`;
  const verdict = await deps.safety.assess(action);

  if (verdict.risk === "block") {
    deps.onToolResult?.(call.name, false, `blocked: ${verdict.reason}`);
    return { executed: false, empty: false, output: `blocked by safety: ${verdict.reason}` };
  }

  if (verdict.risk === "ask") {
    const approved = await deps.requestApproval(action, verdict.reason, call.name);
    const id = await deps.safety.proposeApproval(action);
    if (!approved) {
      if (id) await deps.safety.deny(id);
      deps.onToolResult?.(call.name, false, "denied by user");
      return { executed: false, empty: false, output: `denied by user: ${verdict.reason}` };
    }
    if (id) await deps.safety.approve(id);
  }

  const res = await tool.execute(call.arguments, ctx);
  deps.onToolResult?.(call.name, res.ok, res.output);
  return { executed: true, empty: res.output.trim().length === 0, output: res.output };
}
