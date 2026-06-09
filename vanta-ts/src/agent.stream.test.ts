import { describe, it, expect, vi } from "vitest";
import { createConversation } from "./agent.js";
import type { LLMProvider, CompletionResult, StreamChunk } from "./providers/interface.js";
import type { SafetyClient } from "./safety-client.js";
import type { ToolRegistry } from "./tools/registry.js";

class StreamingProvider implements LLMProvider {
  completeCalls = 0;
  modelId() {
    return "fake";
  }
  contextWindow() {
    return 100_000;
  }
  async complete(): Promise<CompletionResult> {
    this.completeCalls++;
    return { text: "Hello", toolCalls: [], finishReason: "stop" };
  }
  async *stream(): AsyncIterable<StreamChunk> {
    yield { type: "text", delta: "Hel" };
    yield { type: "text", delta: "lo" };
    yield { type: "done", result: { text: "Hello", toolCalls: [], finishReason: "stop" } };
  }
}

const fakeSafety = { logEvent: async () => {} } as unknown as SafetyClient;
const emptyRegistry = { schemas: () => [], get: () => undefined } as unknown as ToolRegistry;

describe("agent streaming", () => {
  it("emits text deltas in order and returns the assembled final text", async () => {
    const provider = new StreamingProvider();
    const deltas: string[] = [];
    const convo = createConversation("sys", {
      provider,
      safety: fakeSafety,
      registry: emptyRegistry,
      root: "/x",
      requestApproval: async () => false,
      onTextDelta: (d) => deltas.push(d),
    });
    const outcome = await convo.send("hi");

    expect(deltas).toEqual(["Hel", "lo"]);
    expect(outcome.finalText).toBe("Hello");
    expect(provider.completeCalls).toBe(0); // streamed, didn't fall back
  });

  it("falls back to complete() when no delta consumer is wired", async () => {
    const provider = new StreamingProvider();
    const spy = vi.spyOn(provider, "stream");
    const convo = createConversation("sys", {
      provider,
      safety: fakeSafety,
      registry: emptyRegistry,
      root: "/x",
      requestApproval: async () => false,
      // no onTextDelta
    });
    const outcome = await convo.send("hi");

    expect(outcome.finalText).toBe("Hello");
    expect(provider.completeCalls).toBe(1);
    expect(spy).not.toHaveBeenCalled();
  });
});
