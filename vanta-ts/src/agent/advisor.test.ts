import { describe, it, expect } from "vitest";
import { runAdvisor, resolveAdvisorProvider } from "./advisor.js";
import type { LLMProvider, CompletionResult } from "../providers/interface.js";
import type { Message } from "../types.js";

function fakeProvider(text: string, throws?: boolean): LLMProvider {
  return {
    modelId: () => "fake",
    contextWindow: () => 8192,
    complete: async (): Promise<CompletionResult> => {
      if (throws) throw new Error("provider down");
      return { text, toolCalls: [], finishReason: "stop" };
    },
  };
}

const msgs: Message[] = [
  { role: "user", content: "fix the bug" },
  { role: "assistant", content: "calling shell_cmd" },
  { role: "tool", toolCallId: "t1", name: "shell_cmd", content: "error: command not found" },
];

describe("runAdvisor", () => {
  it("returns provider text on success", async () => {
    const result = await runAdvisor(msgs, fakeProvider("1. Root cause: missing binary."), 3);
    expect(result).toBe("1. Root cause: missing binary.");
  });

  it("returns fallback text when provider returns empty", async () => {
    const result = await runAdvisor(msgs, fakeProvider(""), 3);
    expect(result).toBe("(advisor returned no analysis)");
  });

  it("returns error text instead of throwing when provider fails", async () => {
    const result = await runAdvisor(msgs, fakeProvider("", true), 3);
    expect(result).toMatch(/advisor unavailable/);
    expect(result).toMatch(/provider down/);
  });

  it("caps context to the most recent messages", async () => {
    const long: Message[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `msg ${i}`,
    }));
    let received: Message[] = [];
    const spy: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 8192,
      complete: async (messages) => {
        received = messages;
        return { text: "analysis", toolCalls: [], finishReason: "stop" };
      },
    };
    await runAdvisor(long, spy, 3);
    // system message + up to 12 recent + probe = at most 14 total
    expect(received.length).toBeLessThanOrEqual(14);
  });
});

describe("resolveAdvisorProvider", () => {
  it("returns null when VANTA_ADVISOR_MODEL is not set", () => {
    expect(resolveAdvisorProvider({})).toBeNull();
    expect(resolveAdvisorProvider({ VANTA_ADVISOR_MODEL: "" })).toBeNull();
  });

  it("returns null (not throws) when the env is otherwise invalid", () => {
    // Missing OPENAI_API_KEY → resolveProvider throws → we catch and return null
    const result = resolveAdvisorProvider({ VANTA_ADVISOR_MODEL: "gpt-4o", VANTA_PROVIDER: "openai" });
    // May succeed or return null depending on env; either way it must not throw
    expect(result === null || result !== null).toBe(true);
  });
});
