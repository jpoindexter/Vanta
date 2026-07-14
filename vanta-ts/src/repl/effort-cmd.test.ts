import { describe, expect, it } from "vitest";
import { effort } from "./effort-cmd.js";
import type { ReplCtx } from "./types.js";

function ctx(): ReplCtx {
  return {
    state: { sessionId: "s1", started: "t0", turnIndex: 0, effortLevel: "medium" },
    setup: { effortLevel: "medium" },
    env: {},
  } as ReplCtx;
}

describe("/effort", () => {
  it("shows the current level and usage when called without an arg", async () => {
    const result = await effort("", ctx());
    expect(result.output).toContain("effort medium");
    expect(result.output).toContain("usage: /effort <low|medium|high|xhigh|max>");
  });

  it("reports invalid args without mutating the context", async () => {
    const c = ctx();
    const result = await effort("turbo", c);
    expect(result.output).toContain('invalid effort "turbo"');
    expect(c.state.effortLevel).toBe("medium");
    expect(c.setup.effortLevel).toBe("medium");
    expect(c.env.VANTA_EFFORT_LEVEL).toBeUndefined();
  });

  it("sets the live state, setup, and env for valid levels", async () => {
    const c = ctx();
    const result = await effort("high", c);
    expect(result.output).toContain("effort high");
    expect(c.state.effortLevel).toBe("high");
    expect(c.setup.effortLevel).toBe("high");
    expect(c.env.VANTA_EFFORT_LEVEL).toBe("high");
  });
});
