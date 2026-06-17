import { describe, it, expect } from "vitest";
import { runAgent } from "../agent.js";
import { createKernelClient } from "../safety-client.js";
import { ToolRegistry } from "./registry.js";
import { buildStructuredOutputTool } from "./structured-output.js";
import type { CompletionResult, LLMProvider, ToolSchema } from "../providers/interface.js";
import type { Message } from "../types.js";

const SCHEMA = {
  type: "object",
  required: ["name", "score"],
  properties: {
    name: { type: "string" },
    score: { type: "number" },
  },
};

class FakeProvider implements LLMProvider {
  calls: Array<{ messages: Message[]; tools: ToolSchema[] }> = [];

  constructor(private readonly result: CompletionResult) {}

  async complete(messages: Message[], tools: ToolSchema[]): Promise<CompletionResult> {
    this.calls.push({ messages, tools });
    return this.result;
  }

  modelId(): string {
    return "fake";
  }

  contextWindow(): number {
    return 100_000;
  }
}

function deps(provider: LLMProvider) {
  return {
    provider,
    safety: createKernelClient("http://127.0.0.1:7788"),
    registry: new ToolRegistry(),
    root: process.cwd(),
    requestApproval: async () => false,
    outputSchema: SCHEMA,
  } as Parameters<typeof runAgent>[2];
}

describe("StructuredOutput synthetic tool", () => {
  it("builds a tool named StructuredOutput from a JSON schema", async () => {
    const tool = buildStructuredOutputTool(SCHEMA);
    const result = await tool.execute({ name: "Ada", score: 1 }, {
      root: process.cwd(),
      safety: {} as Parameters<typeof tool.execute>[1]["safety"],
      requestApproval: async () => false,
    });

    expect(tool.schema.name).toBe("StructuredOutput");
    expect(tool.schema.parameters).toEqual(SCHEMA);
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.output)).toEqual({ name: "Ada", score: 1 });
  });

  it("injects the tool and returns validated structured args", async () => {
    const provider = new FakeProvider({
      text: "",
      toolCalls: [{ id: "out", name: "StructuredOutput", arguments: { name: "Ada", score: 1 } }],
      finishReason: "tool_calls",
    });

    const outcome = await runAgent("system", "summarize", deps(provider));

    expect(provider.calls[0]?.tools.map((t) => t.name)).toContain("StructuredOutput");
    expect(provider.calls[0]?.messages[0]?.content).toContain("call StructuredOutput");
    expect(outcome.structuredResult).toEqual({ name: "Ada", score: 1 });
    expect(outcome.finalText).toBe('{\n  "name": "Ada",\n  "score": 1\n}');
  });

  it("returns schema errors when StructuredOutput args are invalid", async () => {
    const provider = new FakeProvider({
      text: "",
      toolCalls: [{ id: "out", name: "StructuredOutput", arguments: { name: "Ada" } }],
      finishReason: "tool_calls",
    });

    const outcome = await runAgent("system", "summarize", deps(provider));

    expect(outcome.stoppedReason).toBe("done");
    expect(outcome.finalText).toContain("StructuredOutput schema validation failed");
    expect(outcome.finalText).toContain("score");
  });
});
