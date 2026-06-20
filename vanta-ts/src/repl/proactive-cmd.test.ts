import { describe, expect, it } from "vitest";
import { ProactiveConfigSchema, newProactiveState, type ProactiveConfig, type ProactiveState, type TickDecision } from "../proactive/policy.js";
import { formatProactiveStatus, makeProactive, type ProactiveStatusDeps } from "./proactive-cmd.js";
import type { ReplCtx } from "./types.js";

const cfg = (over: Partial<ProactiveConfig> = {}): ProactiveConfig => ProactiveConfigSchema.parse(over);
const wouldTick = (tick: boolean, reason = "ok"): TickDecision => ({ tick, reason });
const NOW = new Date("2026-06-20T12:00:00.000Z");

describe("formatProactiveStatus (pure)", () => {
  it("disabled → shows the VANTA_PROACTIVE=1 enable hint and no would-tick line", () => {
    const out = formatProactiveStatus(cfg({ enabled: false }), newProactiveState(), {}, wouldTick(false, "proactive disabled"));
    expect(out).toContain("disabled");
    expect(out).toContain("VANTA_PROACTIVE=1");
    expect(out).not.toContain("would tick now");
  });

  it("enabled → shows cadence, daily cap, idle threshold and whether it would tick now", () => {
    const out = formatProactiveStatus(cfg({ enabled: true, minIdleMin: 20, minIntervalMin: 45, maxPerDay: 5 }), newProactiveState(), {}, wouldTick(true));
    expect(out).toContain("enabled");
    expect(out).toContain("idle ≥ 20m"); // idle threshold
    expect(out).toContain("interval ≥ 45m"); // cadence
    expect(out).toContain("≤ 5/day"); // daily cap
    expect(out).toContain("would tick now: yes");
    expect(out).not.toContain("VANTA_PROACTIVE=1"); // no enable hint when already on
  });

  it("reflects would-tick-now = no with the gating reason", () => {
    const out = formatProactiveStatus(cfg({ enabled: true }), newProactiveState(), {}, wouldTick(false, "no queued work"));
    expect(out).toContain("would tick now: no (no queued work)");
  });

  it("always points to the /loop recurring-task scheduler", () => {
    const onOut = formatProactiveStatus(cfg({ enabled: true }), newProactiveState(), {}, wouldTick(true));
    const offOut = formatProactiveStatus(cfg({ enabled: false }), newProactiveState(), {}, wouldTick(false, "proactive disabled"));
    expect(onOut).toContain("/loop");
    expect(offOut).toContain("/loop");
  });

  it("surfaces the current state (last tick + ticks today)", () => {
    const state: ProactiveState = { ...newProactiveState(), lastTickAt: "2026-06-20T09:00:00.000Z", ticksToday: 3, day: "2026-06-20" };
    const out = formatProactiveStatus(cfg({ enabled: true }), state, {}, wouldTick(false, "cadence (10m < 30m)"));
    expect(out).toContain("2026-06-20T09:00:00.000Z");
    expect(out).toContain("3 tick(s) today");
  });
});

describe("/proactive handler (injected loaders — no real fs)", () => {
  const baseCtx = (env: NodeJS.ProcessEnv): ReplCtx =>
    ({ env, dataDir: "/fake/.vanta", now: () => NOW } as unknown as ReplCtx);

  const fakeDeps = (over: Partial<ProactiveStatusDeps> = {}): ProactiveStatusDeps => ({
    resolveConfig: (env) => cfg({ enabled: env.VANTA_PROACTIVE === "1" }),
    loadState: async () => newProactiveState(),
    queuedCount: async () => 0,
    budgetExceeded: async () => false,
    ...over,
  });

  it("disabled env → status reports disabled + enable hint, mutating nothing", async () => {
    const handler = makeProactive(fakeDeps());
    const r = await handler("", baseCtx({}));
    expect(r.output).toContain("disabled");
    expect(r.output).toContain("VANTA_PROACTIVE=1");
    // read-only: no resend/exit/cleared control signals
    expect(r).toEqual({ output: r.output });
  });

  it("enabled with queued work + idle user → would tick now: yes", async () => {
    const past = new Date(NOW.getTime() - 60 * 60_000).toISOString(); // 60m ago (idle)
    const handler = makeProactive(
      fakeDeps({
        loadState: async () => ({ ...newProactiveState(), lastUserActivityAt: past }),
        queuedCount: async () => 2,
      }),
    );
    const r = await handler("", baseCtx({ VANTA_PROACTIVE: "1" }));
    expect(r.output).toContain("enabled");
    expect(r.output).toContain("would tick now: yes");
  });

  it("enabled but no queued work → would tick now: no (no queued work)", async () => {
    const handler = makeProactive(fakeDeps({ queuedCount: async () => 0 }));
    const r = await handler("", baseCtx({ VANTA_PROACTIVE: "1" }));
    expect(r.output).toContain("would tick now: no (no queued work)");
  });

  it("enabled but budget exceeded → would tick now reflects the budget hard-stop", async () => {
    const handler = makeProactive(
      fakeDeps({ queuedCount: async () => 1, budgetExceeded: async () => true }),
    );
    const r = await handler("", baseCtx({ VANTA_PROACTIVE: "1" }));
    expect(r.output).toContain("would tick now: no");
    expect(r.output).toContain("budget exceeded");
  });
});
