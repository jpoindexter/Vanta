import { describe, it, expect, beforeEach } from "vitest";
import { runProgressTick, startProgressReporter } from "./progress-reporter.js";
import { progressStore } from "./progress-store.js";
import { SUMMARY_INTERVAL_MS, type RecentCall } from "./progress.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";

class ReplyProvider implements LLMProvider {
  constructor(private readonly reply: string) {}
  async complete(): Promise<CompletionResult> {
    return { text: this.reply, toolCalls: [], finishReason: "stop" };
  }
  modelId(): string { return "fake"; }
  contextWindow(): number { return 8192; }
}

class ThrowingProvider implements LLMProvider {
  async complete(): Promise<CompletionResult> { throw new Error("model down"); }
  modelId(): string { return "fake"; }
  contextWindow(): number { return 8192; }
}

const editCall: RecentCall[] = [{ name: "edit_file", args: { path: "src/auth.ts" } }];

beforeEach(() => {
  for (const p of progressStore().snapshot()) progressStore().clear(p.id);
});

describe("runProgressTick", () => {
  it("writes a formatted summary from the side-query reply", async () => {
    progressStore().register("w1", "fix auth");
    const wrote = await runProgressTick({
      id: "w1", goal: "fix auth", provider: new ReplyProvider("Editing auth.ts"),
      getRecentCalls: () => editCall, now: 1_000,
    });
    expect(wrote).toBe(true);
    const rec = progressStore().snapshot().find((p) => p.id === "w1");
    expect(rec?.summary).toBe("Editing auth.ts");
    expect(rec?.updatedAt).toBe(1_000);
  });

  it("falls back to the specific tool-call hint when the reply is vague", async () => {
    progressStore().register("w2", "fix auth");
    await runProgressTick({
      id: "w2", goal: "fix auth", provider: new ReplyProvider("working"),
      getRecentCalls: () => editCall, now: 1_000,
    });
    expect(progressStore().snapshot().find((p) => p.id === "w2")?.summary).toBe("Editing auth.ts");
  });

  it("throttles within the ~30s interval", async () => {
    progressStore().register("w3", "fix auth");
    await runProgressTick({ id: "w3", goal: "g", provider: new ReplyProvider("Reading the config"), getRecentCalls: () => editCall, now: 1_000 });
    const wrote2 = await runProgressTick({ id: "w3", goal: "g", provider: new ReplyProvider("Other phrase here"), getRecentCalls: () => editCall, now: 1_000 + SUMMARY_INTERVAL_MS - 1 });
    expect(wrote2).toBe(false);
    expect(progressStore().snapshot().find((p) => p.id === "w3")?.summary).toBe("Reading the config");
  });

  it("keeps the last summary when the side-query fails", async () => {
    progressStore().register("w4", "fix auth");
    await runProgressTick({ id: "w4", goal: "g", provider: new ReplyProvider("Building module now"), getRecentCalls: () => editCall, now: 1_000 });
    const wrote2 = await runProgressTick({ id: "w4", goal: "g", provider: new ThrowingProvider(), getRecentCalls: () => editCall, now: 1_000 + SUMMARY_INTERVAL_MS });
    expect(wrote2).toBe(false);
    expect(progressStore().snapshot().find((p) => p.id === "w4")?.summary).toBe("Building module now");
  });

  it("seeds a hint summary on first tick even if the model fails", async () => {
    progressStore().register("w5", "fix auth");
    await runProgressTick({ id: "w5", goal: "g", provider: new ThrowingProvider(), getRecentCalls: () => editCall, now: 1_000 });
    expect(progressStore().snapshot().find((p) => p.id === "w5")?.summary).toBe("Editing auth.ts");
  });

  it("is disabled by VANTA_SUBAGENT_PROGRESS=0", async () => {
    progressStore().register("w6", "fix auth");
    const wrote = await runProgressTick({
      id: "w6", goal: "g", provider: new ReplyProvider("Editing auth.ts"),
      getRecentCalls: () => editCall, now: 1_000, env: { VANTA_SUBAGENT_PROGRESS: "0" } as NodeJS.ProcessEnv,
    });
    expect(wrote).toBe(false);
    expect(progressStore().snapshot().find((p) => p.id === "w6")?.summary).toBeNull();
  });
});

describe("startProgressReporter", () => {
  it("registers the worker immediately and clears it on stop", () => {
    const stop = startProgressReporter({
      id: "r1", goal: "do a thing", provider: new ReplyProvider("Doing a thing"),
      getRecentCalls: () => [], env: { VANTA_SUBAGENT_PROGRESS: "0" } as NodeJS.ProcessEnv,
    });
    expect(progressStore().snapshot().some((p) => p.id === "r1")).toBe(true);
    stop();
    expect(progressStore().snapshot().some((p) => p.id === "r1")).toBe(false);
  });
});
