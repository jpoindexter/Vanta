import type { LLMProvider } from "./providers/interface.js";
import type { SafetyClient } from "./safety-client.js";
import type { ToolRegistry } from "./tools/registry.js";
import type { ToolContext } from "./tools/types.js";
import type { Message, ToolCall } from "./types.js";
import { trimMessages, compressMessages } from "./context.js";
import type { Summarizer } from "./context.js";

export type AgentDeps = {
  provider: LLMProvider;
  safety: SafetyClient;
  registry: ToolRegistry;
  root: string;
  requestApproval: (action: string, reason: string) => Promise<boolean>;
  onText?: (text: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, ok: boolean, output: string) => void;
  maxIterations?: number;
  summarize?: Summarizer;
};

export type StoppedReason = "done" | "max_iterations" | "repeated_failure";

export type AgentOutcome = {
  finalText: string;
  iterations: number;
  stoppedReason: StoppedReason;
};

const MAX_CONSECUTIVE_FAILURES = 3;

/** A stateful multi-turn conversation that retains history across `send` calls. */
export type Conversation = {
  /** The live transcript (system first). Read-only in spirit; the loop mutates it. */
  messages: Message[];
  /** Send a user turn; runs the agent loop and returns the outcome, keeping history. */
  send: (userText: string) => Promise<AgentOutcome>;
};

/**
 * Open a conversation that persists message history across turns — the basis for
 * the interactive REPL. `runAgent` is the one-shot form of this.
 */
export function createConversation(
  systemPrompt: string,
  deps: AgentDeps,
): Conversation {
  const messages: Message[] = [{ role: "system", content: systemPrompt }];
  const ctx: ToolContext = {
    root: deps.root,
    safety: deps.safety,
    requestApproval: deps.requestApproval,
  };
  return {
    messages,
    send: (userText: string) => runTurn(messages, ctx, deps, userText),
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

  for (let iter = 1; iter <= maxIter; iter++) {
    const trimmed = deps.summarize
      ? await compressMessages(messages, deps.provider.contextWindow(), deps.summarize)
      : trimMessages(messages, deps.provider.contextWindow());
    const result = await deps.provider.complete(trimmed, deps.registry.schemas());

    if (result.toolCalls.length === 0) {
      if (result.text.trim()) {
        messages.push({ role: "assistant", content: result.text });
        return { finalText: result.text, iterations: iter, stoppedReason: "done" };
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

    for (const call of result.toolCalls) {
      const outcome = await dispatchTool(call, deps, ctx);
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
    }

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      return {
        finalText: `Stopped: ${MAX_CONSECUTIVE_FAILURES} consecutive tool calls produced no useful output.`,
        iterations: iter,
        stoppedReason: "repeated_failure",
      };
    }
  }

  return {
    finalText: `Reached the ${maxIter}-iteration limit before completing.`,
    iterations: maxIter,
    stoppedReason: "max_iterations",
  };
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
    const approved = await deps.requestApproval(action, verdict.reason);
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
