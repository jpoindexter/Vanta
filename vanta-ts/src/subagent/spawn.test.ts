import { describe, it, expect } from "vitest";
import { spawnSubagent } from "./spawn.js";
import { ToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "../agent.js";
import type { LLMProvider, CompletionResult } from "../providers/interface.js";
import type { SafetyClient } from "../safety-client.js";

// Returns immediately with finishReason "stop" and no tool calls so runAgent
// takes its "done" branch on the first iteration.
class FakeProvider implements LLMProvider {
  async complete(): Promise<CompletionResult> {
    return { text: "done", toolCalls: [], finishReason: "stop" };
  }
  modelId(): string {
    return "fake-model";
  }
  contextWindow(): number {
    return 8192;
  }
}

// Minimal stub: with no tool calls the loop never assesses or logs, so these
// are never reached — they exist only to satisfy the AgentDeps shape.
const safety = {
  async assess() {
    return { risk: "allow", needsHuman: false, reason: "" };
  },
  async logEvent() {},
} as unknown as SafetyClient;

function makeDeps(): AgentDeps {
  return {
    provider: new FakeProvider(),
    safety,
    registry: new ToolRegistry(),
    root: "/tmp/vanta-test-root",
    requestApproval: async () => true,
  };
}

describe("spawnSubagent", () => {
  it("returns the worker's outcome when it completes on the first iteration", async () => {
    const outcome = await spawnSubagent({
      goal: "summarize the README",
      instruction: "Do the scoped task.",
      deps: makeDeps(),
      now: new Date("2026-06-02T00:00:00.000Z"),
    });

    expect(outcome.finalText).toBe("done");
    expect(outcome.stoppedReason).toBe("done");
    expect(outcome.iterations).toBe(1);
  });

  it("forwards maxIterations to the worker", async () => {
    // A provider that always asks for a (nonexistent) tool never reaches "done",
    // so the worker exhausts its iteration budget — proving maxIterations flows through.
    class LoopingProvider implements LLMProvider {
      async complete(): Promise<CompletionResult> {
        return {
          text: "",
          toolCalls: [{ id: "1", name: "missing_tool", arguments: {} }],
          finishReason: "tool_calls",
        };
      }
      modelId(): string {
        return "fake-loop";
      }
      contextWindow(): number {
        return 8192;
      }
    }

    const deps: AgentDeps = { ...makeDeps(), provider: new LoopingProvider() };
    const outcome = await spawnSubagent({
      goal: "loop forever",
      instruction: "Keep calling.",
      deps,
      maxIterations: 2,
      now: new Date("2026-06-02T00:00:00.000Z"),
    });

    expect(outcome.iterations).toBe(2);
    expect(outcome.stoppedReason).toBe("max_iterations");
  });
});
