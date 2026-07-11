import { describe, expect, it, vi } from "vitest";
import * as backgroundLearning from "./background-learning.js";
import type { KernelClient } from "../kernel/client.js";
import type { LLMProvider } from "../providers/interface.js";

type ChoiceWallApi = {
  isExplicitChoiceWall?: (finalText: string) => boolean;
};

const api = backgroundLearning as ChoiceWallApi & typeof backgroundLearning;

describe("post-turn choice wall", () => {
  it("recognizes an explicit promise to wait for the operator's choice", () => {
    expect(api.isExplicitChoiceWall).toBeTypeOf("function");
    expect(api.isExplicitChoiceWall?.(
      "Choose one of the five workflows. I won't start anything until you choose.",
    )).toBe(true);
  });

  it("does not suppress learning merely because a completed answer uses the word choose", () => {
    expect(api.isExplicitChoiceWall).toBeTypeOf("function");
    expect(api.isExplicitChoiceWall?.(
      "I compared both implementations and chose the safer one. The targeted test passed.",
    )).toBe(false);
  });

  it("does not call the learning provider when mutation is deferred", async () => {
    const complete = vi.fn().mockResolvedValue({ text: "no skill", usage: { inputTokens: 1, outputTokens: 1 } });
    const result = await api.reviewAfterTurn({
      provider: { complete, modelId: () => "fake", contextWindow: () => 1000 } as unknown as LLMProvider,
      safety: {} as KernelClient,
      root: "/tmp/vanta-choice-wall-test",
      transcript: [{ role: "user", content: "check readiness" }, { role: "assistant", content: "pick one; I will wait" }],
      toolIterations: 10,
      turnIndex: 1,
      env: { VANTA_SELF_IMPROVE: "1", VANTA_REVIEW_MIN_TOOLS: "1" },
      deferMutation: true,
    } as Parameters<typeof api.reviewAfterTurn>[0] & { deferMutation: boolean });

    expect(result).toBe("deferred");
    expect(complete).not.toHaveBeenCalled();
  });
});
