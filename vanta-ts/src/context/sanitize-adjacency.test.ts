import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sanitizeMessages } from "./sanitize.js";
import type { Message } from "../types.js";

// Regression for the 400 that bricks a session:
//   "tool_use ids were found without tool_result blocks immediately after".
// The fixture is a synthetic, content-free reproduction of the observed shape:
// a second assistant turn was pushed while a call from the previous batch was
// still outstanding, so that call's result landed AFTER it. A membership check
// passes on this — the result does exist — which is why the old scrub let it
// through every turn. No operator transcript content is retained here.

const wedged = JSON.parse(
  readFileSync(new URL("./__fixtures__/wedged-transcript.json", import.meta.url), "utf8"),
) as Message[];

/** The provider rule: each tool_use is answered, in order, by the messages that
 *  immediately follow it — and no result stands without its call before it. */
function adjacencyViolation(messages: Message[]): string | null {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.role !== "assistant" || !m.toolCalls?.length) continue;
    for (let k = 0; k < m.toolCalls.length; k++) {
      const next = messages[i + 1 + k];
      const call = m.toolCalls[k]!;
      if (!next || next.role !== "tool") return `call ${call.id} has no result immediately after`;
      if (next.toolCallId !== call.id) return `call ${call.id} answered out of order`;
    }
  }
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

describe("sanitizeMessages — tool_use/tool_result adjacency", () => {
  it("the captured transcript really is malformed (guards the fixture)", () => {
    // The second call of the batch is followed by the NEXT assistant turn, not
    // by its own result — exactly what the provider reports in the 400.
    expect(adjacencyViolation(wedged)).toBe("call batch-1-b has no result immediately after");
  });

  it("repairs the wedged transcript instead of replaying the 400 forever", () => {
    expect(adjacencyViolation(sanitizeMessages(wedged))).toBeNull();
  });

  it("keeps every real result, reseated beside its own call", () => {
    const out = sanitizeMessages(wedged);
    const call = out.findIndex((m) => m.role === "assistant" && m.toolCalls?.some((c) => c.id === "batch-1-b"));
    expect(out[call + 2]).toMatchObject({ role: "tool", toolCallId: "batch-1-b" });
  });

  it("drops a result whose call was never made", () => {
    const orphan: Message[] = [
      { role: "user", content: "go" },
      { role: "tool", toolCallId: "never_called", name: "shell_cmd", content: "stale" },
    ];
    expect(sanitizeMessages(orphan).some((m) => m.role === "tool")).toBe(false);
  });

  it("stubs a call that never got a result, adjacently", () => {
    const dangling: Message[] = [
      { role: "user", content: "go" },
      { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "shell_cmd", arguments: {} }] },
    ];
    const out = sanitizeMessages(dangling);
    expect(out[2]).toMatchObject({ role: "tool", toolCallId: "c1" });
    expect(adjacencyViolation(out)).toBeNull();
  });

  it("leaves an already-correct transcript unchanged in shape", () => {
    const good: Message[] = [
      { role: "user", content: "go" },
      { role: "assistant", content: "", toolCalls: [{ id: "a", name: "t", arguments: {} }, { id: "b", name: "t", arguments: {} }] },
      { role: "tool", toolCallId: "a", name: "t", content: "ra" },
      { role: "tool", toolCallId: "b", name: "t", content: "rb" },
    ];
    expect(sanitizeMessages(good).map((m) => m.role)).toEqual(["user", "assistant", "tool", "tool"]);
    expect(adjacencyViolation(sanitizeMessages(good))).toBeNull();
  });
});
