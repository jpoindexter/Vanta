import { describe, expect, it } from "vitest";
import { fast, fastStatusLine, nextFastSpeed, parseFastArg } from "./fast-cmd.js";
import { dispatch } from "./handlers.js";
import { SLASH_COMMANDS } from "./catalog.js";
import type { ReplCtx } from "./types.js";

function ctx(model = "claude-opus-5", provider = "claude-code"): ReplCtx {
  return {
    state: { sessionId: "s1", started: "t0", turnIndex: 0, effortLevel: "medium" },
    setup: {
      effortLevel: "medium",
      provider: { modelId: () => model, routeInfo: () => ({ provider, model }) },
    },
    env: { CODEX_HOME: "/missing-codex-home" },
  } as unknown as ReplCtx;
}

describe("parseFastArg", () => {
  it("treats a bare call as a toggle and maps the on/off vocabulary", () => {
    expect(parseFastArg("")).toEqual({ kind: "toggle" });
    expect(parseFastArg("on")).toEqual({ kind: "set", value: "fast" });
    expect(parseFastArg("ENABLE")).toEqual({ kind: "set", value: "fast" });
    expect(parseFastArg("off")).toEqual({ kind: "set", value: "standard" });
    expect(parseFastArg("0")).toEqual({ kind: "set", value: "standard" });
    expect(parseFastArg("status")).toEqual({ kind: "status" });
  });

  it("rejects an unknown word instead of guessing", () => {
    expect(parseFastArg("faster")).toEqual({ kind: "error", message: 'unknown option "faster"' });
  });
});

describe("nextFastSpeed", () => {
  it("flips the current speed on a toggle and obeys an explicit set", () => {
    expect(nextFastSpeed({ kind: "toggle" }, "standard")).toBe("fast");
    expect(nextFastSpeed({ kind: "toggle" }, "fast")).toBe("standard");
    expect(nextFastSpeed({ kind: "set", value: "fast" }, "fast")).toBe("fast");
  });
});

describe("/fast", () => {
  it("turns fast mode on for a supported Opus model, session-scoped", async () => {
    const c = ctx();
    const result = await fast("", c);
    expect(result.output).toContain("fast mode ON");
    expect(result.output).toContain("this session");
    expect(c.state.serviceTier).toBe("fast");
    expect(c.setup.serviceTier).toBe("fast");
    expect(c.env.VANTA_SERVICE_TIER).toBeUndefined();
  });

  it("toggles back off on a second call", async () => {
    const c = ctx();
    await fast("", c);
    const off = await fast("", c);
    expect(off.output).toContain("fast mode OFF");
    expect(c.state.serviceTier).toBe("standard");
  });

  it("reports status without changing state", async () => {
    const c = ctx();
    const result = await fast("status", c);
    expect(result.output).toContain("fast mode OFF");
    expect(c.state.serviceTier).toBeUndefined();
  });

  it("refuses on a model with no fast tier and names the supported ones", async () => {
    const c = ctx("claude-sonnet-5");
    const result = await fast("on", c);
    expect(result.output).toContain("fast mode is not available on claude-code/claude-sonnet-5");
    expect(result.output).toContain("Opus 5");
    expect(c.state.serviceTier).toBeUndefined();
  });

  it("works for Codex, which exposes the same fast service tier", async () => {
    const c = ctx("gpt-5.6-sol", "codex");
    const result = await fast("on", c);
    expect(result.output).toContain("fast mode ON");
    expect(c.state.serviceTier).toBe("fast");
  });

  it("rejects a bad option and a double scope without mutating state", async () => {
    const c = ctx();
    expect((await fast("faster", c)).output).toContain('unknown option "faster"');
    expect((await fast("on --session --global", c)).output).toContain("choose one scope");
    expect(c.state.serviceTier).toBeUndefined();
  });
});

describe("/fast registration", () => {
  it("is reachable through the real dispatcher and listed in the command catalog", async () => {
    const c = ctx();
    const result = await dispatch("fast", "on", c);
    expect(result?.output).toContain("fast mode ON");
    expect(c.state.serviceTier).toBe("fast");
    expect(SLASH_COMMANDS.some((cmd) => cmd.name === "fast")).toBe(true);
  });
});

describe("fastStatusLine", () => {
  it("marks fast mode with the ↯ glyph and names the cost tradeoff", () => {
    expect(fastStatusLine("fast", " · this session")).toContain("↯ fast mode ON");
    expect(fastStatusLine("fast", "")).toContain("premium rate");
    expect(fastStatusLine("standard", "")).toContain("standard speed and pricing");
  });
});
