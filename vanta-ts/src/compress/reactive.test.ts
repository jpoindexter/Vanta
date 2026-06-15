import { describe, it, expect } from "vitest";
import { createConversation } from "../agent.js";
import { ToolRegistry } from "../tools/registry.js";
import type { Tool } from "../tools/types.js";
import type { LLMProvider, CompletionResult } from "../providers/interface.js";
import type { Message, Verdict } from "../types.js";
import type { SafetyClient } from "../safety-client.js";
import { analyzeToolResults, compactOversizedResult } from "./reactive.js";

class FakeProvider implements LLMProvider {
  private index = 0;

  constructor(private readonly turns: CompletionResult[]) {}

  async complete(): Promise<CompletionResult> {
    return this.turns[this.index++] ?? { text: "done", toolCalls: [], finishReason: "stop" };
  }

  modelId(): string {
    return "fake";
  }

  contextWindow(): number {
    return 100;
  }
}

function safety(): SafetyClient {
  return {
    assess: async (): Promise<Verdict> => ({ risk: "allow", needsHuman: false, reason: "test" }),
    logEvent: async () => undefined,
  } as unknown as SafetyClient;
}

describe("reactive compaction", () => {
  it("finds tool results consuming more than 40 percent of the context window", () => {
    const messages: Message[] = [
      { role: "system", content: "sys" },
      { role: "tool", toolCallId: "t1", name: "small", content: "short" },
      { role: "tool", toolCallId: "t2", name: "big", content: "x".repeat(200) },
    ];

    expect(analyzeToolResults(messages, 100)).toEqual([
      { index: 2, name: "big", tokens: 50, pct: 0.5 },
    ]);
  });

  it("truncates and annotates an oversized tool result", () => {
    const result = compactOversizedResult("abcdef".repeat(40), { contextWindow: 100 });

    expect(result.compacted).toBe(true);
    expect(result.output).toContain("Reactive compact");
    expect(result.output.length).toBeLessThan(240);
  });

  it("compacts oversized tool output before it enters the next model call", async () => {
    const registry = new ToolRegistry();
    const bigTool: Tool = {
      schema: { name: "big_tool", description: "big", parameters: { type: "object", properties: {} } },
      execute: async () => ({ ok: true, output: "x".repeat(240) }),
    };
    registry.register(bigTool);
    const convo = createConversation("sys", {
      provider: new FakeProvider([
        { text: "", toolCalls: [{ id: "t1", name: "big_tool", arguments: {} }], finishReason: "tool_calls" },
        { text: "done", toolCalls: [], finishReason: "stop" },
      ]),
      safety: safety(),
      registry,
      root: process.cwd(),
      requestApproval: async () => false,
    });

    await convo.send("run it");

    const toolMessage = convo.messages.find((m) => m.role === "tool");
    expect(toolMessage?.content).toContain("Reactive compact");
    expect(toolMessage?.content.length).toBeLessThan(240);
  });
});
