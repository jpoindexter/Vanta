import type { LLMProvider } from "./providers/interface.js";
import type { Message, ImageAttachment } from "./types.js";
import type { ToolContext } from "./tools/types.js";
import { sanitizeMessages } from "./context.js";
import type { Summarizer } from "./context.js";
import { persistCompaction } from "./agent/context-pipeline.js";
import { buildStructuredOutputInstruction } from "./tools/structured-output.js";
import { runTurn } from "./agent/turn-loop.js";
import { join } from "node:path";
import { recordNeedsHumanOutcome } from "./operator/needs-human.js";
import { recordDocReferences } from "./context/router-health.js";
import { recordWorkOutcome } from "./maintenance/budget.js";

export type { AgentDeps, StreamEvent, AgentOutcome, StoppedReason, Conversation } from "./agent/agent-types.js";
import type { AgentDeps, AgentOutcome } from "./agent/agent-types.js";

async function recordTurnMaintenance(deps: AgentDeps, userText: string, outcome: AgentOutcome, startedAt: number): Promise<void> {
  if (!deps.sessionId && !deps.usageAgent) return;
  const dataDir = join(deps.root, ".vanta");
  const source = `session:${deps.sessionId ?? deps.usageAgent ?? "agent"}`;
  const thresholdRaw = Number(process.env.VANTA_MAINTENANCE_WARN_PCT ?? 60);
  const budget = await recordWorkOutcome(dataDir, {
    instruction: userText,
    sessionId: deps.sessionId ?? deps.usageAgent ?? "agent",
    elapsedMs: Date.now() - startedAt,
    usage: outcome.usage,
    toolIterations: outcome.toolIterations,
    stoppedReason: outcome.stoppedReason,
  }, { threshold: Number.isFinite(thresholdRaw) ? thresholdRaw / 100 : 0.6 }).catch(() => null);
  if (budget?.alerted) deps.onEvent?.({ type: "note", text: "Maintenance work is dominating delivery. Review the needs-human queue." });
  await recordDocReferences(dataDir, `${userText}\n${outcome.finalText}`, source).catch(() => []);
  await recordNeedsHumanOutcome(dataDir, { instruction: userText, outcome, source }).catch(() => null);
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
  const prompt = deps.outputSchema ? `${systemPrompt}${buildStructuredOutputInstruction(deps.outputSchema)}` : systemPrompt;
  const messages: Message[] = [{ role: "system", content: prompt }];
  if (opts?.history?.length) {
    messages.push(...opts.history.filter((m) => m.role !== "system"));
  }
  const ctx: ToolContext = {
    root: deps.root,
    sessionId: deps.sessionId,
    safety: deps.safety,
    requestApproval: deps.requestApproval,
  };
  return {
    messages,
    send: async (userText: string, images?: ImageAttachment[], signal?: AbortSignal): Promise<AgentOutcome> => {
      const startedAt = Date.now();
      await persistCompaction(messages, deps);
      const outcome = await runTurn({ messages, ctx, deps, userText, images, signal });
      await recordTurnMaintenance(deps, userText, outcome, startedAt);
      return outcome;
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
