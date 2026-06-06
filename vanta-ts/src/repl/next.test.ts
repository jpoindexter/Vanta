import { describe, it, expect } from "vitest";
import { next } from "./next.js";
import type { ReplCtx } from "./types.js";

function makeCtx(goals: Array<{ id: number; text: string; status: string }>): ReplCtx {
  return {
    setup: {
      safety: {
        getGoals: async () => goals,
      } as unknown as ReplCtx["setup"]["safety"],
    } as unknown as ReplCtx["setup"],
  } as unknown as ReplCtx;
}

describe("next handler", () => {
  it("returns no-goals message when there are no active goals", async () => {
    const result = await next("", makeCtx([]));
    expect(result.output).toContain("no active goals");
    expect(result.resend).toBeUndefined();
  });

  it("returns no-goals message when all goals are completed", async () => {
    const result = await next("", makeCtx([{ id: 1, text: "done thing", status: "completed" }]));
    expect(result.output).toContain("no active goals");
  });

  it("returns a resend prompt containing the active goals", async () => {
    const result = await next("", makeCtx([{ id: 1, text: "ship the feature", status: "active" }]));
    expect(result.resend).toBeDefined();
    expect(result.resend).toContain("ship the feature");
    expect(result.output).toBeUndefined();
  });

  it("includes all active goals in the resend prompt", async () => {
    const goals = [
      { id: 1, text: "goal one", status: "active" },
      { id: 2, text: "goal two", status: "active" },
      { id: 3, text: "inactive", status: "completed" },
    ];
    const result = await next("", makeCtx(goals));
    expect(result.resend).toContain("goal one");
    expect(result.resend).toContain("goal two");
    expect(result.resend).not.toContain("inactive");
  });

  it("asks for one concrete next step in the prompt", async () => {
    const result = await next("", makeCtx([{ id: 1, text: "build something", status: "active" }]));
    expect(result.resend).toMatch(/next micro-step|immediately actionable/i);
  });
});
