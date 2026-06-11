import { describe, it, expect } from "vitest";
import { createConversation } from "./agent.js";
import { HookBus } from "./plugins/hooks.js";
import { registerStripThinking } from "./agent/message-display.js";
import type { LLMProvider, CompletionResult } from "./providers/interface.js";
import type { SafetyClient } from "./safety-client.js";
import type { ToolRegistry } from "./tools/registry.js";

// The MessageDisplay hook transforms what the user SEES (finalText) while the raw
// assistant text stays in the transcript — so the model and downstream tools see
// it whole. A fresh HookBus is passed per test (deps.hooks), so the global bus is
// never touched.

const fakeSafety = { logEvent: async () => {} } as unknown as SafetyClient;
const emptyRegistry = { schemas: () => [], get: () => undefined } as unknown as ToolRegistry;

function textProvider(text: string): LLMProvider {
  return {
    modelId: () => "fake",
    contextWindow: () => 100_000,
    complete: async (): Promise<CompletionResult> => ({ text, toolCalls: [], finishReason: "stop" }),
  };
}

function lastAssistant(messages: { role: string; content?: string }[]): string | undefined {
  const m = [...messages].reverse().find((x) => x.role === "assistant");
  return m?.content;
}

describe("MessageDisplay hook in the agent loop", () => {
  it("strips <thinking> from the displayed finalText while the transcript keeps it raw", async () => {
    const bus = new HookBus();
    registerStripThinking(bus);
    const raw = "<thinking>let me reason about it</thinking>The answer is 42.";
    const convo = createConversation("sys", {
      provider: textProvider(raw),
      safety: fakeSafety,
      registry: emptyRegistry,
      root: "/x",
      requestApproval: async () => false,
      hooks: bus,
    });

    const outcome = await convo.send("q");

    expect(outcome.finalText).toBe("The answer is 42."); // displayed: clean
    expect(lastAssistant(convo.messages)).toBe(raw); // transcript: raw, reaches the model + tools
  });

  it("suppresses the displayed message but keeps the raw transcript", async () => {
    const bus = new HookBus();
    bus.on("message_display", () => ({ action: "suppress" }));
    const convo = createConversation("sys", {
      provider: textProvider("internal note"),
      safety: fakeSafety,
      registry: emptyRegistry,
      root: "/x",
      requestApproval: async () => false,
      hooks: bus,
    });

    const outcome = await convo.send("q");

    expect(outcome.finalText).toBe("");
    expect(lastAssistant(convo.messages)).toBe("internal note");
  });

  it("does not transform when no display hook is registered", async () => {
    const convo = createConversation("sys", {
      provider: textProvider("<thinking>x</thinking>hi"),
      safety: fakeSafety,
      registry: emptyRegistry,
      root: "/x",
      requestApproval: async () => false,
      hooks: new HookBus(), // empty bus overrides the global one
    });

    const outcome = await convo.send("q");
    expect(outcome.finalText).toBe("<thinking>x</thinking>hi");
  });
});
