import type { AgentOutcome } from "./agent-types.js";
import type { Message } from "../types.js";
import { unansweredCalls } from "./tool-pairing.js";
import { interruptedDisposition, interruptedToolResult } from "./effect-disposition.js";

export const EFFECT_REVIEW_TEXT = "An action may have partially completed. Review its result before continuing; Vanta will not retry it automatically.";

/** Unknown effects are evidence, not a model completion claim or permission to retry. */
export function effectReviewOutcome(outcome: AgentOutcome, needsReview = outcome.needsEffectReview): AgentOutcome {
  if (!needsReview) return outcome;
  return { ...outcome, stoppedReason: "blocked", completionState: "needs human", needsEffectReview: true };
}

/** Keep the in-memory transcript usable even if the post-effect journal cannot be written. */
export function appendEffectReviewFailure(messages: Message[]): void {
  const batch = messages.findLast(message => message.role === "assistant" && message.toolCalls?.length);
  const calls = batch?.role === "assistant" ? batch.toolCalls ?? [] : [];
  for (const call of unansweredCalls(calls, messages)) {
    messages.push(interruptedToolResult(call, interruptedDisposition(call, call.effectState === "started")));
  }
  messages.push({ role: "assistant", content: EFFECT_REVIEW_TEXT });
}
