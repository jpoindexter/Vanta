import { describe, expect, it, vi } from "vitest";
import { runTurn } from "./turn-loop.js";
import { toolPairingViolation, unansweredCalls } from "./tool-pairing.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "./agent-types.js";
import type { LLMProvider, CompletionResult } from "../providers/interface.js";
import type { Message, ToolCall } from "../types.js";
import type { Tool } from "../tools/types.js";

// Every assistant tool_use must be answered, in order, by the messages right
// after it. Breaking that does not fail one turn — it bricks the session, since
// the malformed history replays on every later request. These cover the paths
// that used to abandon calls mid-batch.

function deps(provider: LLMProvider, registry: InMemoryToolRegistry, extra: Partial<AgentDeps> = {}): AgentDeps {
  return {
    provider,
    safety: {} as AgentDeps["safety"],
    registry,
    root: "/tmp",
    requestApproval: async () => true,
    summarize: vi.fn(async () => "compressed"),
    ...extra,
  };
}

function echoTool(name: string): Tool {
  return {
    schema: { name, description: name, parameters: { type: "object", properties: { q: { type: "string" } } } },
    execute: async () => ({ ok: true, output: `${name} ran` }),
  } as unknown as Tool;
}

function call(id: string, name: string, args: Record<string, unknown> = {}): ToolCall {
  return { id, name, arguments: args };
}

function scriptedProvider(batches: CompletionResult[]): LLMProvider {
  let turn = 0;
  return {
    modelId: () => "fake",
    contextWindow: () => 100_000,
    complete: vi.fn(async (): Promise<CompletionResult> => batches[turn++] ?? { text: "done", toolCalls: [], finishReason: "stop" }),
  };
}

const ctx = { root: "/tmp", safety: {} as AgentDeps["safety"], requestApproval: async () => true };

describe("toolPairingViolation — the invariant itself", () => {
  it("accepts a well-formed batch", () => {
    const ok: Message[] = [
      { role: "assistant", content: "", toolCalls: [call("a", "t"), call("b", "t")] },
      { role: "tool", toolCallId: "a", name: "t", content: "ra" },
      { role: "tool", toolCallId: "b", name: "t", content: "rb" },
    ];
    expect(toolPairingViolation(ok)).toBeNull();
  });

  it("catches a call answered after the next assistant turn (the session-bricking shape)", () => {
    const bad: Message[] = [
      { role: "assistant", content: "", toolCalls: [call("a", "t"), call("b", "t")] },
      { role: "tool", toolCallId: "a", name: "t", content: "ra" },
      { role: "assistant", content: "", toolCalls: [call("c", "t")] },
      { role: "tool", toolCallId: "b", name: "t", content: "rb" },
    ];
    expect(toolPairingViolation(bad)).toBe("call b (t) has no result immediately after");
  });

  it("catches a result with no call", () => {
    expect(toolPairingViolation([{ role: "tool", toolCallId: "ghost", name: "t", content: "x" }])).toBe("orphan result ghost");
  });

  it("unansweredCalls reports only the calls with no result", () => {
    const messages: Message[] = [{ role: "tool", toolCallId: "a", name: "t", content: "ra" }];
    expect(unansweredCalls([call("a", "t"), call("b", "t")], messages).map((c) => c.id)).toEqual(["b"]);
  });
});

describe("runTurn — no call is ever left unanswered", () => {
  it("answers siblings when StructuredOutput ends the turn", async () => {
    // The model emits StructuredOutput ALONGSIDE another call. The old code
    // pushed only the StructuredOutput result and returned, orphaning `search`.
    const registry = new InMemoryToolRegistry();
    registry.register(echoTool("search"));
    const provider = scriptedProvider([
      { text: "", toolCalls: [call("s1", "search", { q: "x" }), call("o1", "StructuredOutput", { answer: "42" })], finishReason: "tool_use" },
    ]);
    const messages: Message[] = [{ role: "system", content: "sys" }];

    await runTurn({
      messages,
      ctx,
      deps: deps(provider, registry, { outputSchema: { type: "object", properties: { answer: { type: "string" } } } }),
      userText: "answer it",
    });

    expect(toolPairingViolation(messages)).toBeNull();
    const answered = messages.filter((m) => m.role === "tool").map((m) => m.toolCallId);
    expect(answered).toEqual(["s1", "o1"]); // in call order, both present
  });

  it("answers the rest of the batch when a repeated tool trips the stuck breaker", async () => {
    // MAX_IDENTICAL_CALLS is 3, so the third identical call breaks the loop —
    // the fourth used to keep its tool_use with no result.
    const registry = new InMemoryToolRegistry();
    registry.register(echoTool("search"));
    const same = { q: "same" };
    const provider = scriptedProvider([
      {
        text: "",
        toolCalls: [call("c1", "search", same), call("c2", "search", same), call("c3", "search", same), call("c4", "search", same)],
        finishReason: "tool_use",
      },
    ]);
    const messages: Message[] = [{ role: "system", content: "sys" }];

    await runTurn({ messages, ctx, deps: deps(provider, registry), userText: "go" });

    expect(toolPairingViolation(messages)).toBeNull();
    expect(messages.filter((m) => m.role === "tool").map((m) => m.toolCallId)).toEqual(["c1", "c2", "c3", "c4"]);
  });
});
