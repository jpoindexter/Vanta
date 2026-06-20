import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSummarizer, loadRalphContinuity, shouldUseAuxSummarize } from "./session.js";
import { writeRalphState } from "./ralph/state.js";
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

describe("loadRalphContinuity", () => {
  it("returns a paused block only when project Ralph state has incomplete work", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-session-ralph-"));
    try {
      await expect(loadRalphContinuity(root)).resolves.toBeUndefined();
      await writeRalphState(join(root, ".vanta"), {
        goal: "Ship Ralph loop",
        features: [{ id: "prompt", title: "Paused prompt injection", status: "pending" }],
        updatedAt: "2026-06-15T10:00:00.000Z",
      });
      const block = await loadRalphContinuity(root);
      expect(block).toContain("PAUSED");
      expect(block).toContain("Ship Ralph loop");
      expect(block).toContain("/goal resume");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("shouldUseAuxSummarize (AUX-MODEL-MAP)", () => {
  it("is false by default (summarize uses the active provider — behavior preserved)", () => {
    expect(shouldUseAuxSummarize({})).toBe(false);
  });
  it("is true when a summarize aux model or provider override is configured", () => {
    expect(shouldUseAuxSummarize({ VANTA_MODEL_SUMMARIZE: "gpt-4o-mini" })).toBe(true);
    expect(shouldUseAuxSummarize({ VANTA_SUMMARIZE_PROVIDER: "openai" })).toBe(true);
  });
});
