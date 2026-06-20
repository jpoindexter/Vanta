import { describe, it, expect } from "vitest";
import { planMode, PLAN_MARKER } from "./plan-mode.js";
import type { ReplCtx, ReplState } from "./types.js";
import type { CompletionResult } from "../providers/interface.js";

type MakeCtxOpts = {
  systemContent?: string;
  /** Add a trailing user message so the interview phase has a task. */
  userMessage?: string;
  /** A canned provider reply (JSON array of questions); enables the interview path. */
  providerReply?: string;
  env?: NodeJS.ProcessEnv;
};

function makeCtx(opts: MakeCtxOpts = {}): {
  ctx: ReplCtx;
  sys: { role: string; content: string };
  state: ReplState;
} {
  const sys = { role: "system", content: opts.systemContent ?? "You are Vanta." };
  const messages: Array<{ role: string; content: string }> = [sys];
  if (opts.userMessage) messages.push({ role: "user", content: opts.userMessage });
  const state = { sessionId: "s1", started: "", turnIndex: 0 } as ReplState;
  const setup =
    opts.providerReply !== undefined
      ? {
          provider: {
            async complete(): Promise<CompletionResult> {
              return { text: opts.providerReply ?? "[]", toolCalls: [], finishReason: "stop" };
            },
          },
        }
      : undefined;
  const ctx = {
    convo: { messages },
    state,
    setup,
    env: opts.env ?? {},
  } as unknown as ReplCtx;
  return { ctx, sys, state };
}

describe("planMode handler", () => {
  it("returns unavailable when there is no system message", async () => {
    const state = { sessionId: "s1", started: "", turnIndex: 0 } as ReplState;
    const ctx = { convo: { messages: [] }, state, env: {} } as unknown as ReplCtx;
    const result = await planMode("", ctx);
    expect(result.output).toContain("unavailable");
  });

  it("enables plan-first mode when toggled on from off state", async () => {
    const { ctx, sys } = makeCtx();
    const result = await planMode("", ctx);
    expect(result.output).toContain("ON");
    expect(sys.content).toContain(PLAN_MARKER);
  });

  it("disables plan-first mode when toggled off from on state", async () => {
    const { ctx, sys } = makeCtx();
    await planMode("", ctx); // turn on
    const result = await planMode("", ctx); // turn off
    expect(result.output).toContain("OFF");
    expect(sys.content).not.toContain(PLAN_MARKER);
  });

  it("turns on with explicit 'on' arg", async () => {
    const { ctx, sys } = makeCtx();
    await planMode("on", ctx);
    expect(sys.content).toContain(PLAN_MARKER);
  });

  it("turns off with explicit 'off' arg", async () => {
    const { ctx, sys } = makeCtx();
    await planMode("on", ctx);
    await planMode("off", ctx);
    expect(sys.content).not.toContain(PLAN_MARKER);
  });

  it("reports already-on when enabling while on", async () => {
    const { ctx } = makeCtx();
    await planMode("on", ctx);
    const result = await planMode("on", ctx); // already on
    expect(result.output).toContain("already ON");
  });

  it("reports already-off when disabling while off", async () => {
    const { ctx } = makeCtx();
    const result = await planMode("off", ctx); // already off
    expect(result.output).toContain("already OFF");
  });

  it("sets planApproved false when turning on", async () => {
    const { ctx, state } = makeCtx();
    state.planApproved = true; // pre-approved from a previous session action
    await planMode("on", ctx);
    expect(state.planApproved).toBe(false);
  });

  it("approves plan with 'approve' arg", async () => {
    const { ctx, state } = makeCtx();
    await planMode("on", ctx);
    expect(state.planApproved).toBe(false);
    const result = await planMode("approve", ctx);
    expect(result.output).toContain("approved");
    expect(state.planApproved).toBe(true);
  });

  it("returns error when approving without plan mode on", async () => {
    const { ctx } = makeCtx();
    const result = await planMode("approve", ctx);
    expect(result.output).toContain("not active");
  });

  it("resets planApproved when turning off", async () => {
    const { ctx, state } = makeCtx();
    await planMode("on", ctx);
    await planMode("approve", ctx);
    expect(state.planApproved).toBe(true);
    await planMode("off", ctx);
    expect(state.planApproved).toBe(false);
  });
});

describe("planMode interview phase (VANTA-PLAN-INTERVIEW-PHASE)", () => {
  it("appends the clarifying-questions block on turn-on when a task is in flight", async () => {
    const { ctx } = makeCtx({
      userMessage: "build an export feature",
      providerReply: '["Which format?", "How many rows?"]',
    });
    const result = await planMode("on", ctx);
    expect(result.output).toContain("ON");
    expect(result.output).toContain("Before I plan this, I need to clarify:");
    expect(result.output).toContain("1. Which format?");
    expect(result.output).toContain("2. How many rows?");
  });

  it("appends nothing when the model returns no questions (already-specific task)", async () => {
    const { ctx } = makeCtx({
      userMessage: "rename foo to bar in src/x.ts line 10",
      providerReply: "[]",
    });
    const result = await planMode("on", ctx);
    expect(result.output).toContain("ON");
    expect(result.output).not.toContain("clarify");
  });

  it("skips the interview when disabled by VANTA_PLAN_INTERVIEW=0", async () => {
    const { ctx } = makeCtx({
      userMessage: "build an export feature",
      providerReply: '["Which format?"]',
      env: { VANTA_PLAN_INTERVIEW: "0" },
    });
    const result = await planMode("on", ctx);
    expect(result.output).not.toContain("clarify");
  });

  it("skips the interview when there is no task in flight", async () => {
    const { ctx } = makeCtx({ providerReply: '["Which format?"]' });
    const result = await planMode("on", ctx);
    expect(result.output).not.toContain("clarify");
  });

  it("does not run the interview on turn-off", async () => {
    const { ctx } = makeCtx({
      userMessage: "build an export feature",
      providerReply: '["Which format?"]',
    });
    await planMode("on", ctx);
    const result = await planMode("off", ctx);
    expect(result.output).toContain("OFF");
    expect(result.output).not.toContain("clarify");
  });
});
