import { describe, it, expect } from "vitest";
import { delegateTool } from "./delegate.js";
import type { ToolContext } from "./types.js";

// The zod-failure path returns before provider resolution / subagent spawn, so
// no real ctx, provider, or network is needed — the test stays fully offline.
const ctx = {} as ToolContext;

describe("delegateTool", () => {
  it("returns an actionable error when required args are missing", async () => {
    const result = await delegateTool.execute({ goal: "x" }, ctx);

    expect(result.ok).toBe(false);
    expect(result.output).toBe("delegate needs goal and instruction strings");
  });

  it("returns an actionable error when goal is an empty string", async () => {
    const result = await delegateTool.execute(
      { goal: "", instruction: "do the thing" },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toBe("delegate needs goal and instruction strings");
  });

  it("rejects an out-of-range max_iterations before any spawn", async () => {
    const result = await delegateTool.execute(
      { goal: "g", instruction: "i", max_iterations: 99 },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toBe("delegate needs goal and instruction strings");
  });

  it("describes delegation as a constant internal op, leaking no content", () => {
    const description = delegateTool.describeForSafety?.({
      goal: "delete all files",
      instruction: "rm -rf /",
    });

    expect(description).toBe("delegate a subtask to a worker agent");
  });
});
