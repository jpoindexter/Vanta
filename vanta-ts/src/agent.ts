import type { LLMProvider } from "./providers/interface.js";
import type { Message, ImageAttachment } from "./types.js";
import type { ToolContext } from "./tools/types.js";
import { sanitizeMessages } from "./context.js";
import type { Summarizer } from "./context.js";
import { persistCompaction } from "./agent/context-pipeline.js";
import { buildStructuredOutputInstruction } from "./tools/structured-output.js";
import { runTurn } from "./agent/turn-loop.js";

export type { AgentDeps, StreamEvent, AgentOutcome, StoppedReason, Conversation } from "./agent/agent-types.js";
import type { AgentDeps, AgentOutcome } from "./agent/agent-types.js";

/**
 * Open a conversation that persists message history across turns — the basis for
 * the interactive REPL. `runAgent` is the one-shot form of this.
 */
export function createConversation(
  systemPrompt: string,
  deps: AgentDeps,
  opts?: { history?: Message[] },
) {
  const prompt = deps.outputSchema ? `${systemPrompt}${buildStructuredOutputInstruction(deps.outputSchema)}` : systemPrompt;
  const messages: Message[] = [{ role: "system", content: prompt }];
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
      await persistCompaction(messages, deps);
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

/** One-shot: a fresh conversation with a single user turn. */
export async function runAgent(
  systemPrompt: string,
  instruction: string,
  deps: AgentDeps,
  images?: ImageAttachment[],
): Promise<AgentOutcome> {
  return createConversation(systemPrompt, deps).send(instruction, images);
}

// sanitizeMessages re-exported for tests that import it from agent.ts
export { sanitizeMessages };
