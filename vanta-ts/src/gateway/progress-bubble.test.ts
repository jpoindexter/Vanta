import { describe, expect, it } from "vitest";
import { progressBubbleForPlatform } from "./progress-bubble.js";

describe("progressBubbleForPlatform", () => {
  it("enables LINE before its reply-token window expires", () => {
    expect(progressBubbleForPlatform("line")).toMatchObject({
      enabled: true,
      thresholdMs: 50_000,
    });
  });

  it("stays off for platforms without a hard token window", () => {
    expect(progressBubbleForPlatform("telegram")).toBeNull();
  });

  it("can be enabled for a test/platform override and disabled explicitly", () => {
    expect(progressBubbleForPlatform("fake", { platformIds: new Set(["fake"]), thresholdMs: 10 })?.thresholdMs).toBe(10);
    expect(progressBubbleForPlatform("line", { enabled: false })).toBeNull();
  });
});
