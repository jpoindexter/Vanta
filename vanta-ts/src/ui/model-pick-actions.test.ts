import { describe, expect, it, vi } from "vitest";
import { runModelPick } from "./model-pick-actions.js";

describe("runModelPick", () => {
  it("applies model, effort, and speed in order for a global default", async () => {
    const runSlash = vi.fn(() => Promise.resolve());
    await runModelPick({ providerId: "codex", model: "gpt-5.6-sol", effort: "high", speed: "fast", scope: "global" }, runSlash);
    expect(runSlash.mock.calls).toEqual([
      ["/model --global codex gpt-5.6-sol"],
      ["/effort high --global"],
      ["/speed fast --global"],
    ]);
  });

  it("uses session scope without persisting a default", async () => {
    const runSlash = vi.fn(() => Promise.resolve());
    await runModelPick({ providerId: "claude-code", model: "claude-sonnet-5", effort: "medium", scope: "session" }, runSlash);
    expect(runSlash.mock.calls).toEqual([
      ["/model claude-code claude-sonnet-5"],
      ["/effort medium --session"],
    ]);
  });
});
