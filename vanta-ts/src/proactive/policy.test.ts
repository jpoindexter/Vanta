import { describe, it, expect } from "vitest";
import {
  decideProactiveTick,
  recordTick,
  recordActivity,
  resolveProactiveConfig,
  newProactiveState,
  ProactiveConfigSchema,
  type ProactiveConfig,
  type ProactiveState,
} from "./policy.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");
const cfg = (over: Partial<ProactiveConfig> = {}): ProactiveConfig =>
  ProactiveConfigSchema.parse({ enabled: true, minIdleMin: 15, minIntervalMin: 30, maxPerDay: 8, ...over });
const minsAgo = (m: number): string => new Date(NOW.getTime() - m * 60_000).toISOString();
/** A state where idle + cadence + cap all pass (user long away, no recent tick). */
const ready = (over: Partial<ProactiveState> = {}): ProactiveState => ({ ...newProactiveState(), ...over });

function decide(over: { config?: ProactiveConfig; state?: ProactiveState; queuedCount?: number; budgetExceeded?: boolean }) {
  return decideProactiveTick({
    config: over.config ?? cfg(),
    state: over.state ?? ready(),
    now: NOW,
    queuedCount: over.queuedCount ?? 3,
    budgetExceeded: over.budgetExceeded ?? false,
  });
}

describe("decideProactiveTick", () => {
  it("ticks when away, under cadence/cap, with queued work and budget ok", () => {
    expect(decide({}).tick).toBe(true);
  });
  it("refuses when disabled", () => {
    expect(decide({ config: cfg({ enabled: false }) })).toMatchObject({ tick: false, reason: expect.stringMatching(/disabled/) });
  });
  it("refuses when nothing is queued", () => {
    expect(decide({ queuedCount: 0 })).toMatchObject({ tick: false, reason: expect.stringMatching(/no queued work/) });
  });
  it("refuses when the budget is exceeded (economic throttle)", () => {
    expect(decide({ budgetExceeded: true })).toMatchObject({ tick: false, reason: expect.stringMatching(/budget exceeded/) });
  });
  it("refuses when the user was recently active", () => {
    expect(decide({ state: ready({ lastUserActivityAt: minsAgo(5) }) })).toMatchObject({ tick: false, reason: expect.stringMatching(/user active/) });
  });
  it("refuses when a tick happened within the cadence window", () => {
    expect(decide({ state: ready({ lastTickAt: minsAgo(10) }) })).toMatchObject({ tick: false, reason: expect.stringMatching(/cadence/) });
  });
  it("refuses when the daily cap is reached", () => {
    expect(decide({ config: cfg({ maxPerDay: 8 }), state: ready({ day: "2026-06-20", ticksToday: 8 }) }))
      .toMatchObject({ tick: false, reason: expect.stringMatching(/daily cap/) });
  });
  it("ignores yesterday's tick count (new day resets the cap)", () => {
    expect(decide({ state: ready({ day: "2026-06-19", ticksToday: 99 }) }).tick).toBe(true);
  });
});

describe("recordTick", () => {
  it("increments same-day and stamps the tick time", () => {
    const s = recordTick(ready({ day: "2026-06-20", ticksToday: 2 }), NOW);
    expect(s.ticksToday).toBe(3);
    expect(s.day).toBe("2026-06-20");
    expect(s.lastTickAt).toBe(NOW.toISOString());
  });
  it("rolls the counter on a new day", () => {
    expect(recordTick(ready({ day: "2026-06-19", ticksToday: 5 }), NOW).ticksToday).toBe(1);
  });
});

describe("recordActivity", () => {
  it("stamps the activity time", () => {
    expect(recordActivity(newProactiveState(), NOW).lastUserActivityAt).toBe(NOW.toISOString());
  });
});

describe("resolveProactiveConfig", () => {
  it("is disabled by default and enabled by VANTA_PROACTIVE=1", () => {
    expect(resolveProactiveConfig({} as NodeJS.ProcessEnv).enabled).toBe(false);
    expect(resolveProactiveConfig({ VANTA_PROACTIVE: "1" } as NodeJS.ProcessEnv).enabled).toBe(true);
  });
  it("reads numeric overrides", () => {
    const c = resolveProactiveConfig({ VANTA_PROACTIVE: "1", VANTA_PROACTIVE_IDLE_MIN: "60", VANTA_PROACTIVE_MAX_PER_DAY: "3" } as NodeJS.ProcessEnv);
    expect(c.minIdleMin).toBe(60);
    expect(c.maxPerDay).toBe(3);
  });
});
