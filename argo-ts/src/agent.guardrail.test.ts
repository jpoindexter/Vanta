import { describe, it, expect } from "vitest";
import { createConversation } from "./agent.js";
import type { LLMProvider, CompletionResult } from "./providers/interface.js";
import type { SafetyClient } from "./safety-client.js";
import type { ToolRegistry } from "./tools/registry.js";
import type { Tool } from "./tools/types.js";

// A provider that keeps issuing the exact same tool call every iteration.
class SpinningProvider implements LLMProvider {
  calls = 0;
  modelId() {
    return "fake";
  }
  contextWindow() {
    return 100_000;
  }
  async complete(): Promise<CompletionResult> {
    this.calls++;
    return {
      text: "",
      finishReason: "tool_calls",
      toolCalls: [{ id: `c${this.calls}`, name: "spin", arguments: { x: 1 } }],
    };
  }
}

const spinTool: Tool = {
  schema: { name: "spin", description: "spins", parameters: { type: "object" } },
  describeForSafety: () => "spin",
  execute: async () => ({ ok: true, output: "still spinning" }), // non-empty → not the empty-failure guard
};

const fakeSafety = {
  assess: async () => ({ risk: "allow" as const, needsHuman: false, reason: "" }),
  logEvent: async () => {},
} as unknown as SafetyClient;

const registry = {
  schemas: () => [spinTool.schema],
  get: (n: string) => (n === "spin" ? spinTool : undefined),
} as unknown as ToolRegistry;

describe("agent loop guardrail", () => {
  it("stops after the same tool+args is called MAX_IDENTICAL_CALLS times", async () => {
    const provider = new SpinningProvider();
    const convo = createConversation("sys", {
      provider,
      safety: fakeSafety,
      registry,
      root: "/x",
      requestApproval: async () => false,
    });
    const outcome = await convo.send("keep going");

    expect(outcome.stoppedReason).toBe("repeated_failure");
    expect(outcome.finalText).toContain("spin");
    expect(outcome.finalText).toContain("identical");
    expect(provider.calls).toBe(3); // stopped on the 3rd identical call
  });
});
