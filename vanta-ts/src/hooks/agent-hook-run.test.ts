import { describe, expect, it } from "vitest";
import { runAgentHook } from "./agent-hook-run.js";
import { ToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "../agent.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";

describe("runAgentHook", () => {
  it("runs a worker query and converts a JSON verdict into a block", async () => {
    const result = await runAgentHook(
      { type: "agent", prompt: "Check the event", maxIterations: 1 },
      '{"event":"PreToolUse"}',
      depsWithProvider(fakeProvider('{"decision":"block","reason":"worker veto"}')),
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("worker veto");
  });
});

function fakeProvider(text: string): LLMProvider {
  const result: CompletionResult = { text, toolCalls: [], finishReason: "stop" };
  return { complete: async () => result, modelId: () => "fake-agent-hook", contextWindow: () => 8_000 };
}

function depsWithProvider(provider: LLMProvider): AgentDeps {
  return {
    provider,
    safety: {} as AgentDeps["safety"],
    registry: new ToolRegistry(),
    root: process.cwd(),
    requestApproval: async () => false,
  };
}
