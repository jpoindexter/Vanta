import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldReview, reviewTurn } from "./background-review.js";
import { listSkills, LEARNED_TAG } from "../skills/store.js";
import type { LLMProvider } from "../providers/interface.js";
import type { SafetyClient } from "../safety-client.js";
import type { CompletionResult } from "../providers/interface.js";

describe("shouldReview", () => {
  const on: NodeJS.ProcessEnv = {};

  it("fires on a busy turn (>= min tools)", () => {
    expect(shouldReview(6, 1, on)).toBe(true);
  });

  it("fires periodically on the interval turn", () => {
    expect(shouldReview(0, 8, on)).toBe(true);
  });

  it("stays quiet on a light, off-interval turn", () => {
    expect(shouldReview(1, 3, on)).toBe(false);
  });

  it("is fully disabled by VANTA_SELF_IMPROVE=0", () => {
    expect(shouldReview(50, 8, { VANTA_SELF_IMPROVE: "0" })).toBe(false);
    expect(shouldReview(50, 8, { VANTA_SELF_IMPROVE: "false" })).toBe(false);
  });

  it("honors custom thresholds", () => {
    expect(shouldReview(3, 1, { VANTA_REVIEW_MIN_TOOLS: "3" })).toBe(true);
    expect(shouldReview(0, 5, { VANTA_REVIEW_EVERY: "5" })).toBe(true);
  });
});

/** A provider that calls write_skill once, then finishes. */
class WritingProvider implements LLMProvider {
  private n = 0;
  modelId() {
    return "fake";
  }
  contextWindow() {
    return 100_000;
  }
  async complete(): Promise<CompletionResult> {
    this.n++;
    if (this.n === 1) {
      return {
        text: "",
        finishReason: "tool_calls",
        toolCalls: [
          {
            id: "c1",
            name: "write_skill",
            arguments: {
              name: "debug-failing-test",
              description: "how to isolate a failing test",
              body: "1. reproduce 2. bisect 3. fix",
            },
          },
        ],
      };
    }
    return { text: "done", toolCalls: [], finishReason: "stop" };
  }
}

const fakeSafety = {
  assess: async () => ({ risk: "allow" as const, needsHuman: false, reason: "" }),
  logEvent: async () => {},
} as unknown as SafetyClient;

describe("reviewTurn", () => {
  let home: string;
  const prev = process.env.VANTA_HOME;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "argo-review-"));
    process.env.VANTA_HOME = home;
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.VANTA_HOME;
    else process.env.VANTA_HOME = prev;
    await rm(home, { recursive: true, force: true });
  });

  it("writes a learned skill from the transcript and tags it for provenance", async () => {
    const { wrote } = await reviewTurn({
      provider: new WritingProvider(),
      safety: fakeSafety,
      root: home,
      transcript: [
        { role: "user", content: "the vitest run keeps failing" },
        { role: "assistant", content: "found it: a stale mock" },
      ],
    });

    expect(wrote).toContain("debug-failing-test");
    const skills = await listSkills(process.env);
    const learned = skills.find((s) => s.meta.name === "debug-failing-test");
    expect(learned).toBeDefined();
    expect(learned?.meta.tags).toContain(LEARNED_TAG);
  });

  it("swallows provider failure (best-effort) and writes nothing", async () => {
    const failing = {
      modelId: () => "x",
      contextWindow: () => 1000,
      complete: async () => {
        throw new Error("provider down");
      },
    } as unknown as LLMProvider;

    const { wrote } = await reviewTurn({
      provider: failing,
      safety: fakeSafety,
      root: home,
      transcript: [{ role: "user", content: "x" }],
    });
    expect(wrote).toEqual([]);
  });
});
