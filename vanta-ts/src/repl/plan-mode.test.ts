import { describe, it, expect } from "vitest";
import { planMode, PLAN_MARKER } from "./plan-mode.js";
import type { ReplCtx, ReplState } from "./types.js";

function makeCtx(systemContent = "You are Vanta."): {
  ctx: ReplCtx;
  sys: { role: string; content: string };
  state: ReplState;
} {
  const sys = { role: "system", content: systemContent };
  const state = { sessionId: "s1", started: "", turnIndex: 0 } as ReplState;
  const ctx = {
    convo: { messages: [sys] },
    state,
  } as unknown as ReplCtx;
  return { ctx, sys, state };
}

describe("planMode handler", () => {
  it("returns unavailable when there is no system message", () => {
    const state = { sessionId: "s1", started: "", turnIndex: 0 } as ReplState;
    const ctx = { convo: { messages: [] }, state } as unknown as ReplCtx;
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

  it("sets planApproved false when turning on", () => {
    const { ctx, state } = makeCtx();
    state.planApproved = true; // pre-approved from a previous session action
    planMode("on", ctx);
    expect(state.planApproved).toBe(false);
  });

  it("approves plan with 'approve' arg", () => {
    const { ctx, state } = makeCtx();
    planMode("on", ctx);
    expect(state.planApproved).toBe(false);
    const result = planMode("approve", ctx);
    expect((result as { output: string }).output).toContain("approved");
    expect(state.planApproved).toBe(true);
  });

  it("returns error when approving without plan mode on", () => {
    const { ctx } = makeCtx();
    const result = planMode("approve", ctx);
    expect((result as { output: string }).output).toContain("not active");
  });

  it("resets planApproved when turning off", () => {
    const { ctx, state } = makeCtx();
    planMode("on", ctx);
    planMode("approve", ctx);
    expect(state.planApproved).toBe(true);
    planMode("off", ctx);
    expect(state.planApproved).toBe(false);
  });
});
