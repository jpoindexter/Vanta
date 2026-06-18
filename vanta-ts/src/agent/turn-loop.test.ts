import { describe, expect, it, vi } from "vitest";
import { runTurn } from "./turn-loop.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "./agent-types.js";
import type { LLMProvider, CompletionResult, ToolSchema } from "../providers/interface.js";
import type { Message } from "../types.js";

function history(): Message[] {
  return [
    { role: "system", content: "sys" },
    ...Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `older message ${i} ${"x".repeat(120)}`,
    })),
  ];
}

function deps(provider: LLMProvider, summarize = vi.fn(async () => "compressed after error")): AgentDeps {
  return {
    provider,
    safety: {} as AgentDeps["safety"],
    registry: new InMemoryToolRegistry(),
    root: "/tmp",
    requestApproval: async () => true,
    summarize,
  };
}

describe("context-length retry", () => {
  it("compacts and retries one context-length provider failure", async () => {
    const seen: Message[][] = [];
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 5_000,
      complete: vi.fn(async (messages: Message[], _tools: ToolSchema[]): Promise<CompletionResult> => {
        seen.push(messages);
        if (seen.length === 1) throw new Error("maximum context length exceeded");
        return { text: "recovered", toolCalls: [], finishReason: "stop" };
      }),
    };
    const summarize = vi.fn(async () => "compressed after error");

    const out = await runTurn({
      messages: history(),
      ctx: { root: "/tmp", safety: {} as AgentDeps["safety"], requestApproval: async () => true },
      deps: deps(provider, summarize),
      userText: "continue",
    });

    expect(out.finalText).toBe("recovered");
    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(summarize).toHaveBeenCalledOnce();
    expect(seen[1]?.some((m) => m.content.includes("compressed after error"))).toBe(true);
  });

  it("returns a clean error when the compacted retry still exceeds context", async () => {
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 5_000,
      complete: vi.fn(async () => {
        throw new Error("context window exceeded");
      }),
    };

    const out = await runTurn({
      messages: history(),
      ctx: { root: "/tmp", safety: {} as AgentDeps["safety"], requestApproval: async () => true },
      deps: deps(provider),
      userText: "continue",
    });

    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(out.stoppedReason).toBe("repeated_failure");
    expect(out.finalText).toContain("one compaction retry");
  });
});
