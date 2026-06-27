import type { Message } from "../types.js";
import { compressMessages } from "../context.js";
import type { ContextDeps, TurnContext } from "./context-pipeline.js";

// COMPRESS-ON-ERROR: detect a provider's context-window rejection, then force a
// compaction pass after one so the turn can retry instead of failing the run.

const CONTEXT_LENGTH_PATTERNS = [
  /context (length|window|limit)/i,
  /maximum context/i,
  /prompt is too long/i,
  /too many tokens/i,
  /input tokens? exceed/i,
  /request too large/i,
];

function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause === undefined ? "" : ` ${errorText(err.cause)}`;
  return `${err.name} ${err.message}${cause}`;
}

export function isContextLengthError(err: unknown): boolean {
  const text = errorText(err);
  return CONTEXT_LENGTH_PATTERNS.some((pattern) => pattern.test(text));
}

export async function compressAfterContextError(
  messages: Message[],
  deps: ContextDeps,
  tc: TurnContext,
): Promise<Message[]> {
  if (!tc.trackedSummarize) return messages;
  return compressMessages(messages, deps.provider.contextWindow(), tc.trackedSummarize, {
    activeGoalText: deps.activeGoalText,
    sessionMemory: deps.sessionMemory,
    thresholdPct: 1,
  });
}
