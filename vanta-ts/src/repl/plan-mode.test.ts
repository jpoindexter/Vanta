import { describe, it, expect } from "vitest";
import { planMode, PLAN_MARKER } from "./plan-mode.js";
import type { ReplCtx } from "./types.js";

function makeCtx(systemContent = "You are Vanta."): { ctx: ReplCtx; sys: { role: string; content: string } } {
  const sys = { role: "system", content: systemContent };
  const ctx = {
    convo: { messages: [sys] },
  } as unknown as ReplCtx;
  return { ctx, sys };
}

describe("planMode handler", () => {
  it("returns unavailable when there is no system message", () => {
    const ctx = { convo: { messages: [] } } as unknown as ReplCtx;
    const result = planMode("", ctx);
    expect((result as { output: string }).output).toContain("unavailable");
  });

  it("enables plan-first mode when toggled on from off state", () => {
    const { ctx, sys } = makeCtx();
    const result = planMode("", ctx);
    expect((result as { output: string }).output).toContain("ON");
    expect(sys.content).toContain(PLAN_MARKER);
  });

  it("disables plan-first mode when toggled off from on state", () => {
    const { ctx, sys } = makeCtx();
    planMode("", ctx); // turn on
    const result = planMode("", ctx); // turn off
    expect((result as { output: string }).output).toContain("OFF");
    expect(sys.content).not.toContain(PLAN_MARKER);
  });

  it("turns on with explicit 'on' arg", () => {
    const { ctx, sys } = makeCtx();
    planMode("on", ctx);
    expect(sys.content).toContain(PLAN_MARKER);
  });

  it("turns off with explicit 'off' arg", () => {
    const { ctx, sys } = makeCtx();
    planMode("on", ctx);
    planMode("off", ctx);
    expect(sys.content).not.toContain(PLAN_MARKER);
  });

  it("reports already-on when enabling while on", () => {
    const { ctx } = makeCtx();
    planMode("on", ctx);
    const result = planMode("on", ctx); // already on
    expect((result as { output: string }).output).toContain("already ON");
  });

  it("reports already-off when disabling while off", () => {
    const { ctx } = makeCtx();
    const result = planMode("off", ctx); // already off
    expect((result as { output: string }).output).toContain("already OFF");
  });
});
