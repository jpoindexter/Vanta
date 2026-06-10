import { describe, it, expect } from "vitest";
import { buildSummarizer } from "./session.js";
import type { LLMProvider, CompletionResult, ToolSchema } from "./providers/interface.js";
import type { Message } from "./types.js";

/** Fake provider that records the messages handed to complete() so a test can
 * assert what prompt buildSummarizer constructed. */
function captureProvider(): { provider: LLMProvider; lastMessages: () => Message[] } {
  let captured: Message[] = [];
  const provider: LLMProvider = {
    complete: async (messages: Message[], _tools: ToolSchema[]): Promise<CompletionResult> => {
      captured = messages;
      return { text: "ok", toolCalls: [], finishReason: "stop" };
    },
    modelId: () => "fake",
    contextWindow: () => 128_000,
  };
  return { provider, lastMessages: () => captured };
}

const sysPrompt = (msgs: Message[]): string =>
  msgs.find((m) => m.role === "system")?.content ?? "";

describe("buildSummarizer", () => {
  const msgs: Message[] = [{ role: "user", content: "hi" }];

  it("includes the focus line in the summary prompt when instructions are given", async () => {
    const { provider, lastMessages } = captureProvider();
    await buildSummarizer(provider, "keep the database schema details")(msgs);
    expect(sysPrompt(lastMessages())).toContain("Focus especially on: keep the database schema details");
  });

  it("omits the focus line when no instructions are given (prior behavior)", async () => {
    const { provider, lastMessages } = captureProvider();
    await buildSummarizer(provider)(msgs);
    expect(sysPrompt(lastMessages())).not.toContain("Focus especially on");
  });

  it("treats blank/whitespace instructions as no instructions", async () => {
    const { provider, lastMessages } = captureProvider();
    await buildSummarizer(provider, "   ")(msgs);
    expect(sysPrompt(lastMessages())).not.toContain("Focus especially on");
  });
});
