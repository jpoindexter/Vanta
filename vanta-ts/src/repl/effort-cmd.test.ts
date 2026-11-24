import { describe, expect, it } from "vitest";
import { effort } from "./effort-cmd.js";
import type { ReplCtx } from "./types.js";

function ctx(): ReplCtx {
  return {
    state: { sessionId: "s1", started: "t0", turnIndex: 0, effortLevel: "medium" },
    setup: {
      effortLevel: "medium",
      provider: {
        modelId: () => "gpt-5.6-sol",
        routeInfo: () => ({ provider: "codex", model: "gpt-5.6-sol" }),
      },
    },
    env: { CODEX_HOME: "/missing-codex-home" },
  } as unknown as ReplCtx;
}

describe("/effort", () => {
  it("shows the current level and usage when called without an arg", async () => {
    const result = await effort("", ctx());
    expect(result.output).toContain("effort medium");
    expect(result.output).toContain("usage: /effort <low|medium|high|xhigh|max|ultra> [--session|--global]");
  });

  it("reports invalid args without mutating the context", async () => {
    const c = ctx();
    const result = await effort("turbo", c);
    expect(result.output).toContain("does not support effort turbo");
    expect(c.state.effortLevel).toBe("medium");
    expect(c.setup.effortLevel).toBe("medium");
    expect(c.env.VANTA_EFFORT_LEVEL).toBeUndefined();
  });

  it("sets live session state without changing project env", async () => {
    const c = ctx();
    const result = await effort("high", c);
    expect(result.output).toContain("effort high");
    expect(c.state.effortLevel).toBe("high");
    expect(c.setup.effortLevel).toBe("high");
    expect(c.env.VANTA_EFFORT_LEVEL).toBeUndefined();
  });
});
