import type { AgentOutcome, Conversation } from "./agent-types.js";
import type { Message } from "../types.js";
import { unansweredCalls } from "./tool-pairing.js";
import { interruptedDisposition, interruptedToolResult } from "./effect-disposition.js";
import { workerResultComplete } from "../subagent/tool-result.js";

export const EFFECT_REVIEW_TEXT = "An action may have partially completed. Review its result before continuing; Vanta will not retry it automatically.";
const reviewConversations = new WeakSet<Conversation>();

/** Hosts must recognize the same typed evidence, including sessions saved outside Desktop. */
export function messagesNeedEffectReview(messages: readonly Message[] = []): boolean {
  return messages.some(message => message.role === "tool" ? message.effectDisposition === "unknown"
    : message.role === "assistant" && message.desktopRun?.needsEffectReview === true);
}

/** Seed once from typed persisted evidence, never from prose or a message cursor. */
export function seedConversationReview(conversation: Conversation): void {
  if (messagesNeedEffectReview(conversation.messages)) reviewConversations.add(conversation);
}

export function recordConversationReview(conversation: Conversation, outcome: AgentOutcome): void {
  if (!workerResultComplete(outcome)) reviewConversations.add(conversation);
}

/** A later manual answer/compaction cannot erase an unresolved effect. */
export function conversationNeedsReview(conversation: Conversation): boolean {
  return reviewConversations.has(conversation);
}

/** Unknown effects are evidence, not a model completion claim or permission to retry. */
export function effectReviewOutcome(outcome: AgentOutcome, needsReview = outcome.needsEffectReview, callIds?: Set<string>): AgentOutcome {
  if (!needsReview) return outcome;
  return { ...outcome, stoppedReason: "blocked", completionState: "needs human", needsEffectReview: true,
    ...(callIds?.size ? { effectReviewCallIds: [...callIds].sort() } : {}) };
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
