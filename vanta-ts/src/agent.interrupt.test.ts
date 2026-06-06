import { describe, it, expect } from "vitest";
import { createConversation } from "./agent.js";
import type { LLMProvider, CompletionResult } from "./providers/interface.js";
import type { SafetyClient } from "./safety-client.js";
import type { ToolRegistry } from "./tools/registry.js";

class CountingProvider implements LLMProvider {
  calls = 0;
  modelId() {
    return "fake";
  }
  contextWindow() {
    return 100_000;
  }
  async complete(): Promise<CompletionResult> {
    this.calls++;
    return { text: "done", toolCalls: [], finishReason: "stop" };
  }
}

const fakeSafety = { logEvent: async () => {} } as unknown as SafetyClient;
const emptyRegistry = { schemas: () => [], get: () => undefined } as unknown as ToolRegistry;

describe("agent interrupt (AbortSignal)", () => {
  it("returns 'interrupted' before the first model call when already aborted", async () => {
    const provider = new CountingProvider();
    const controller = new AbortController();
    controller.abort();

    const convo = createConversation("sys", {
      provider,
      safety: fakeSafety,
      registry: emptyRegistry,
      root: "/x",
      requestApproval: async () => false,
      signal: controller.signal,
    });
    const outcome = await convo.send("do a big task");

    expect(outcome.stoppedReason).toBe("interrupted");
    expect(outcome.finalText).toBe("Interrupted.");
    expect(provider.calls).toBe(0); // never hit the model
  });

  it("runs normally when the signal is not aborted", async () => {
    const provider = new CountingProvider();
    const convo = createConversation("sys", {
      provider,
      safety: fakeSafety,
      registry: emptyRegistry,
      root: "/x",
      requestApproval: async () => false,
      signal: new AbortController().signal,
    });
    const outcome = await convo.send("hi");
    expect(outcome.stoppedReason).toBe("done");
    expect(provider.calls).toBe(1);
  });
});
