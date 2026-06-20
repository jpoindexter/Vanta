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
    expect(result.code).toBe(2);
    expect(result.stderr).toBe("worker veto");
  });

  it("can call tools before returning a structured verdict", async () => {
    const calls: string[] = [];
    const deps = depsWithProvider(toolUsingProvider());
    deps.registry.register({
      schema: { name: "probe_hook_context", description: "Probe hook context", parameters: { type: "object", properties: {} } },
      describeForSafety: () => "probe hook context",
      execute: async () => {
        calls.push("probe_hook_context");
        return { ok: true, output: "probe ok" };
      },
    });
    const result = await runAgentHook(
      { type: "agent", prompt: "Use tools, then decide.", maxIterations: 3 },
      '{"event":"PreToolUse","tool":"shell_cmd"}',
      deps,
    );
    expect(calls).toEqual(["probe_hook_context"]);
    expect(result).toMatchObject({ code: 2, stderr: "tool saw risk" });
  });
});

function fakeProvider(text: string): LLMProvider {
  const result: CompletionResult = { text, toolCalls: [], finishReason: "stop" };
  return { complete: async () => result, modelId: () => "fake-agent-hook", contextWindow: () => 8_000 };
}

function depsWithProvider(provider: LLMProvider): AgentDeps {
  return {
    provider,
    safety: { assess: async () => ({ risk: "allow", needsHuman: false, reason: "" }), logEvent: async () => {} } as unknown as AgentDeps["safety"],
    registry: new ToolRegistry(),
    root: process.cwd(),
    requestApproval: async () => false,
  };
}

function toolUsingProvider(): LLMProvider {
  let count = 0;
  return {
    modelId: () => "fake-agent-hook",
    contextWindow: () => 8_000,
    complete: async () => {
      count++;
      if (count === 1) {
        return {
          text: "",
          toolCalls: [{ id: "probe-1", name: "probe_hook_context", arguments: {} }],
          finishReason: "tool_calls",
        };
      }
      return {
        text: "",
        toolCalls: [{ id: "structured-1", name: "StructuredOutput", arguments: { decision: "block", reason: "tool saw risk" } }],
        finishReason: "tool_calls",
      };
    },
  };
}
