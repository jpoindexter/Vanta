import type { Message } from "../types.js";
import { reconcileDanglingToolResults } from "../agent/effect-disposition.js";

// Message sanitization helpers. Extracted from context.ts (size gate).

// Lone (unpaired) UTF-16 surrogate code units — high surrogate not followed by a
// low one, or a low not preceded by a high. These slip in from truncated tool
// output and make the model API reject the whole request with an opaque 400.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function stripSurrogates(text: string): string {
  return text.replace(LONE_SURROGATE, "");
}

type ToolMessage = Extract<Message, { role: "tool" }>;

/**
 * Re-seat every tool result immediately after the assistant message that called
 * it, in call order. Membership is not enough: the providers require the results
 * to be ADJACENT to their `tool_use` blocks, and a batch of parallel calls can
 * finish out of order or have an assistant message pushed between a call and its
 * result (advisor text, streamed prose). That transcript passes a set-based
 * check and still 400s — "tool_use ids were found without tool_result blocks
 * immediately after" — bricking the session, since the bad history replays on
 * every later turn.
 *
 * A result whose call id appears nowhere is dropped; a call with no result is
 * left for {@link reconcileDanglingToolResults} to stub.
 */
function orderToolResults(messages: Message[]): Message[] {
  const pending = new Map<string, ToolMessage>();
  for (const m of messages) {
    if (m.role === "tool" && !pending.has(m.toolCallId)) pending.set(m.toolCallId, m);
  }
  const out: Message[] = [];
  for (const m of messages) {
    if (m.role === "tool") continue; // re-emitted below, beside its own call
    out.push(m);
    if (m.role !== "assistant") continue;
    for (const call of m.toolCalls ?? []) {
      const result = pending.get(call.id);
      if (!result) continue;
      pending.delete(call.id);
      out.push(result);
    }
  }
  return out;
}

/**
 * Final pre-flight scrub right before an API call. Four cheap defenses against
 * silent 400s that are painful to diagnose:
 *  1. Re-seat each `tool` result immediately after its own assistant call, in
 *     call order (providers demand adjacency, not just presence).
 *  2. Drop any `tool` message whose `toolCallId` has no matching assistant
 *     `tool_calls` id anywhere in the set (orphaned by trim/compression).
 *  3. Synthesize a stub result for any assistant tool call that never got one
 *     (a turn aborted mid-dispatch — kernel death, network drop, interrupt —
 *     otherwise bricks the session: every later call 400s on the dangling id).
 *  4. Strip lone Unicode surrogates from all message content.
 * Pure — returns a new array; the live transcript is untouched.
 */
export function sanitizeMessages(messages: Message[]): Message[] {
  const callIds = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant") for (const tc of m.toolCalls ?? []) callIds.add(tc.id);
  }
  // Drop orphans BEFORE ordering so a stale result cannot claim a slot, then
  // stub anything still unanswered — reconcile places its stub adjacently.
  const kept = messages.filter((m) => m.role !== "tool" || callIds.has(m.toolCallId));
  const reconciled = reconcileDanglingToolResults(orderToolResults(kept)).messages;
  return reconciled.map((m) => ({ ...m, content: stripSurrogates(m.content) }));
}
