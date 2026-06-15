import { describe, expect, it } from "vitest";
import { runCompletionVerifier, shouldVerifyCompletion } from "./completion-verifier.js";
import type { LLMProvider, CompletionResult } from "../providers/interface.js";
import type { Message } from "../types.js";

class ReplyProvider implements LLMProvider {
  calls = 0;
  constructor(private readonly reply: string) {}
  modelId() { return "fake-cheap"; }
  contextWindow() { return 100_000; }
  async complete(): Promise<CompletionResult> {
    this.calls++;
    return { text: this.reply, toolCalls: [], finishReason: "stop" };
  }
}

class HangingProvider implements LLMProvider {
  calls = 0;
  modelId() { return "fake-hang"; }
  contextWindow() { return 100_000; }
  async complete(_messages: Message[], _tools: [], config?: { signal?: AbortSignal }): Promise<CompletionResult> {
    this.calls++;
    await new Promise((_resolve, reject) => {
      config?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    throw new Error("unreachable");
  }
}

const turn = {
  messages: [
    { role: "user" as const, content: "Add a verifier" },
    { role: "tool" as const, toolCallId: "t1", name: "write_file", content: "wrote src/verify/completion-verifier.ts" },
    { role: "assistant" as const, content: "Done." },
  ],
};

describe("shouldVerifyCompletion", () => {
  it("requires VANTA_VERIFY=1 and a completion claim", () => {
    expect(shouldVerifyCompletion(turn, { VANTA_VERIFY: "1" })).toBe(true);
    expect(shouldVerifyCompletion(turn, {})).toBe(false);
    expect(shouldVerifyCompletion({ messages: [{ role: "assistant", content: "I looked into it." }] }, { VANTA_VERIFY: "1" })).toBe(false);
  });
});

describe("runCompletionVerifier", () => {
  it("returns pass with provider evidence", async () => {
    const provider = new ReplyProvider("YES - files were written and tests passed.");
    const result = await runCompletionVerifier(turn, {
      provider,
      goals: [{ id: 1, text: "Implement CC-VERIFICATION-AGENT", status: "active" }],
      env: { VANTA_VERIFY: "1" },
    });

    expect(result).toEqual({ verdict: "pass", evidence: "files were written and tests passed." });
    expect(provider.calls).toBe(1);
  });

  it("returns fail with provider evidence", async () => {
    const provider = new ReplyProvider("NO - no targeted test output is present.");
    const result = await runCompletionVerifier(turn, {
      provider,
      goals: [{ id: 1, text: "Implement CC-VERIFICATION-AGENT", status: "active" }],
      env: { VANTA_VERIFY: "1" },
    });

    expect(result).toEqual({ verdict: "fail", evidence: "no targeted test output is present." });
  });

  it("does not call the provider when the gate is off", async () => {
    const provider = new ReplyProvider("NO - should not run.");
    const result = await runCompletionVerifier(turn, { provider, env: {} });

    expect(result).toEqual({ verdict: "pass", evidence: "completion verifier disabled" });
    expect(provider.calls).toBe(0);
  });

  it("times out and discards the verifier result", async () => {
    const provider = new HangingProvider();
    const result = await runCompletionVerifier(turn, {
      provider,
      env: { VANTA_VERIFY: "1" },
      timeoutMs: 5,
    });

    expect(result).toEqual({ verdict: "pass", evidence: "completion verifier timed out" });
    expect(provider.calls).toBe(1);
  });
});
