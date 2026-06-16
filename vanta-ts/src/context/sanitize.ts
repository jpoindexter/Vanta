import type { Message } from "../types.js";

// Message sanitization helpers. Extracted from context.ts (size gate).

// Lone (unpaired) UTF-16 surrogate code units — high surrogate not followed by a
// low one, or a low not preceded by a high. These slip in from truncated tool
// output and make the model API reject the whole request with an opaque 400.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function stripSurrogates(text: string): string {
  return text.replace(LONE_SURROGATE, "");
}

/** Stub results for an assistant message's tool calls that never got one (aborted turn). */
function stubsForDanglingCalls(m: Extract<Message, { role: "assistant" }>, resultIds: Set<string>): Message[] {
  return (m.toolCalls ?? [])
    .filter((tc) => !resultIds.has(tc.id))
    .map((tc) => ({
      role: "tool" as const,
      toolCallId: tc.id,
      name: tc.name,
      content: "[no result — the turn was interrupted before this tool finished]",
    }));
}

/**
 * Final pre-flight scrub right before an API call. Three cheap defenses against
 * silent 400s that are painful to diagnose:
 *  1. Drop any `tool` message whose `toolCallId` has no matching assistant
 *     `tool_calls` id anywhere in the set (orphaned by trim/compression).
 *  2. Synthesize a stub result for any assistant tool call that never got one
 *     (a turn aborted mid-dispatch — kernel death, network drop, interrupt —
 *     otherwise bricks the session: every later call 400s on the dangling id).
 *  3. Strip lone Unicode surrogates from all message content.
 * Pure — returns a new array; the live transcript is untouched.
 */
export function sanitizeMessages(messages: Message[]): Message[] {
  const callIds = new Set<string>();
  const resultIds = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant") for (const tc of m.toolCalls ?? []) callIds.add(tc.id);
    if (m.role === "tool") resultIds.add(m.toolCallId);
  }

  const out: Message[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      if (!callIds.has(m.toolCallId)) continue; // orphaned result → drop
      out.push({ ...m, content: stripSurrogates(m.content) });
      continue;
    }
    out.push({ ...m, content: stripSurrogates(m.content) });
    if (m.role === "assistant") out.push(...stubsForDanglingCalls(m, resultIds));
  }
  return out;
}
