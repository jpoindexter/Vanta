import { describe, expect, it } from "vitest";
import {
  SCHEDULER_GROWTH_HOOKS,
  builtinCronScheduler,
  resolveSchedulerDue,
  type SchedulerProvider,
} from "./provider.js";
import type { CronEntry } from "./cron.js";

const ALWAYS = "* * * * *";
const NEVER = "0 0 30 2 *";
const now = new Date("2026-06-01T08:00:00.000Z");

function entry(over: Partial<CronEntry>): CronEntry {
  return {
    id: 1,
    instruction: "do thing",
    cron: ALWAYS,
    status: "active",
    ...over,
  };
}

const loader = (entries: CronEntry[]) => async () => entries;

describe("builtinCronScheduler", () => {
  it("selects only active entries due at now", async () => {
    const selected = await builtinCronScheduler.selectDue({
      dataDir: "/tmp/vanta-scheduler-provider",
      now,
      load: loader([
        entry({ id: 1, cron: ALWAYS, status: "active" }),
        entry({ id: 2, cron: NEVER, status: "active" }),
        entry({ id: 3, cron: ALWAYS, status: "paused" }),
      ]),
    });
    expect(selected.entries.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(selected.due.map((e) => e.id)).toEqual([1]);
  });

  it("publishes additive growth hook names", () => {
    expect(builtinCronScheduler.growthHooks).toBe(SCHEDULER_GROWTH_HOOKS);
    expect(SCHEDULER_GROWTH_HOOKS).toEqual([
      "before_select_due",
      "after_select_due",
      "before_fire",
      "after_fire",
    ]);
  });
});

describe("resolveSchedulerDue", () => {
  it("uses an injected provider when it succeeds", async () => {
    const provider: SchedulerProvider = {
      id: "custom",
      growthHooks: [],
      selectDue: async () => ({ entries: [entry({ id: 7 })], due: [entry({ id: 7 })] }),
    };
    const selected = await resolveSchedulerDue({ dataDir: "/tmp/x", now, provider });
    expect(selected.providerId).toBe("custom");
    expect(selected.fellBack).toBe(false);
    expect(selected.due.map((e) => e.id)).toEqual([7]);
  });

  it("falls back to builtin cron when the injected provider fails", async () => {
    const provider: SchedulerProvider = {
      id: "broken",
      growthHooks: [],
      selectDue: async () => { throw new Error("scheduler offline"); },
    };
    const selected = await resolveSchedulerDue({
      dataDir: "/tmp/x",
      now,
      provider,
      load: loader([entry({ id: 3, cron: ALWAYS })]),
    });
    expect(selected.providerId).toBe("builtin-cron");
    expect(selected.fellBack).toBe(true);
    expect(selected.error).toBe("scheduler offline");
    expect(selected.due.map((e) => e.id)).toEqual([3]);
  });
});
