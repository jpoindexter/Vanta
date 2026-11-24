import type { Message, ToolCall } from "../types.js";

// The transcript invariant every provider enforces: an assistant message that
// emits `tool_use` blocks must be followed IMMEDIATELY by the results for those
// calls, in call order, and no result may stand without its call before it.
//
// Violating it does not fail one turn — it bricks the session, because the bad
// history replays on every later request ("tool_use ids were found without
// tool_result blocks immediately after"). `context/sanitize.ts` repairs this at
// the provider boundary; this module is the tripwire that stops us shipping new
// ways to break it. Membership is NOT enough: a result that exists but sits after
// the next assistant turn still 400s.

/** The first adjacency violation in `messages`, or null when the shape is legal. */
export function toolPairingViolation(messages: Message[]): string | null {
  return missingOrMisorderedResult(messages) ?? orphanResult(messages);
}

function missingOrMisorderedResult(messages: Message[]): string | null {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.role !== "assistant" || !m.toolCalls?.length) continue;
    for (let k = 0; k < m.toolCalls.length; k++) {
      const call = m.toolCalls[k]!;
      const next = messages[i + 1 + k];
      if (!next || next.role !== "tool") return `call ${call.id} (${call.name}) has no result immediately after`;
      if (next.toolCallId !== call.id) return `call ${call.id} (${call.name}) answered out of order`;
    }
  }
  return null;
}

function orphanResult(messages: Message[]): string | null {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.role !== "tool") continue;
    const prev = messages[i - 1];
    const paired = prev
      && ((prev.role === "assistant" && prev.toolCalls?.some((c) => c.id === m.toolCallId)) || prev.role === "tool");
    if (!paired) return `orphan result ${m.toolCallId}`;
  }
  return null;
}

/** Calls in `calls` that no message in `messages` answers. Pure. */
export function unansweredCalls(calls: ToolCall[], messages: Message[]): ToolCall[] {
  const answered = new Set<string>();
  for (const m of messages) if (m.role === "tool") answered.add(m.toolCallId);
  return calls.filter((call) => !answered.has(call.id));
}

/**
 * Throw on a malformed transcript. Development and test only — in production the
 * boundary scrub repairs the shape rather than killing the user's turn. A warning
 * would be useless here: a silent invariant is exactly how this shipped.
 */
export function assertToolPairing(messages: Message[], where: string): void {
  if (process.env.NODE_ENV === "production") return;
  const violation = toolPairingViolation(messages);
  if (violation) throw new Error(`tool pairing invariant broken at ${where}: ${violation}`);
}
