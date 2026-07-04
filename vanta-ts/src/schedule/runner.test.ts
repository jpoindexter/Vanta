import { describe, it, expect } from "vitest";
import { runDueTasks, runDueTasksTracked, type RunTask } from "./runner.js";
import type { CronEntry } from "./cron.js";
import { fireWindowKey } from "./at-most-once.js";

// runner.ts owns the status filter, the due filter, and error isolation —
// loadCron (and the cron.tsv format) is owned by the concurrently-built
// ./cron.js, which has its own test. So, mirroring the task's own injection of
// `run`, we inject `load` with canned CronEntry[] rather than coupling to the
// tsv schema. isDue is kept REAL; the cron expressions are chosen to be both
// time- and timezone-independent so the assertions hold on any machine:
//   "* * * * *"  matches every minute → due at any `now`
//   "0 0 30 2 *" is Feb 30 → can never match → never due
const ALWAYS = "* * * * *";
const NEVER = "0 0 30 2 *";

const DATA_DIR = "/tmp/vanta-cron-runner-fixture";
// Value is irrelevant: the cron expressions never depend on it.
const now = new Date("2026-06-01T08:00:00.000Z");

function entry(over: Record<string, unknown>): CronEntry {
  // `over` is loose (Record) on purpose: CronEntry's `status` may be a narrow
  // union, and one test needs a non-active status to exercise the filter.
  return {
    id: 1,
    instruction: "do thing",
    cron: ALWAYS,
    status: "active",
    ...over,
  } as CronEntry;
}

function loaderFor(entries: CronEntry[]): (dataDir: string) => Promise<CronEntry[]> {
  return async () => entries;
}

const echoRun: RunTask = async (instruction) => ({
  finalText: `ran: ${instruction}`,
});

describe("runDueTasks", () => {
  it("runs only the active entry that is due at now", async () => {
    const load = loaderFor([
      entry({ id: 1, instruction: "morning briefing", cron: ALWAYS }),
      entry({ id: 2, instruction: "leap-day recap", cron: NEVER }),
    ]);

    const results = await runDueTasks({ dataDir: DATA_DIR, now, run: echoRun, load });

    expect(results).toEqual([
      { id: 1, instruction: "morning briefing", result: "ran: morning briefing" },
    ]);
  });

  it("skips entries whose status is not active even when due", async () => {
    const load = loaderFor([
      entry({ id: 1, instruction: "paused task", cron: ALWAYS, status: "paused" }),
      entry({ id: 2, instruction: "active task", cron: ALWAYS }),
    ]);

    const results = await runDueTasks({ dataDir: DATA_DIR, now, run: echoRun, load });

    expect(results.map((r) => r.id)).toEqual([2]);
  });

  it("captures a throwing run as an error result and continues the batch", async () => {
    const load = loaderFor([
      entry({ id: 1, instruction: "flaky task", cron: ALWAYS }),
      entry({ id: 2, instruction: "good task", cron: ALWAYS }),
    ]);

    const run: RunTask = async (instruction) => {
      if (instruction === "flaky task") throw new Error("provider exploded");
      return { finalText: `ran: ${instruction}` };
    };

    const results = await runDueTasks({ dataDir: DATA_DIR, now, run, load });

    expect(results).toEqual([
      { id: 1, instruction: "flaky task", result: "error: provider exploded" },
      { id: 2, instruction: "good task", result: "ran: good task" },
    ]);
  });

  it("passes the dataDir through to the loader", async () => {
    let seenDir: string | null = null;
    const load = async (dataDir: string): Promise<CronEntry[]> => {
      seenDir = dataDir;
      return [];
    };

    const results = await runDueTasks({ dataDir: DATA_DIR, now, run: echoRun, load });

    expect(seenDir).toBe(DATA_DIR);
    expect(results).toEqual([]);
  });

  it("passes compact cron wake context to the task runner", async () => {
    const seen: string[] = [];
    const run: RunTask = async (_instruction, wake) => {
      seen.push(`${wake?.wake_reason} ${wake?.goal_id}`);
      return { finalText: "ok" };
    };

    await runDueTasks({ dataDir: DATA_DIR, now, run, load: loaderFor([entry({ id: 9, cron: ALWAYS })]) });

    expect(seen).toEqual(["cron:* * * * * cron:9"]);
  });
});

describe("runDueTasks at-most-once dedup", () => {
  // Counts every actual run so a re-fire is observable.
  function countingRun(): { run: RunTask; ran: number[] } {
    const ran: number[] = [];
    const run: RunTask = async (instruction) => {
      ran.push(1);
      return { finalText: `ran: ${instruction}` };
    };
    return { run, ran };
  }

  const due = loaderFor([
    entry({ id: 1, instruction: "a", cron: ALWAYS }),
    entry({ id: 2, instruction: "b", cron: ALWAYS }),
  ]);

  it("without lastFired, every due task fires once per call (behavior unchanged)", async () => {
    const { run, ran } = countingRun();
    const first = await runDueTasks({ dataDir: DATA_DIR, now, run, load: due });
    const second = await runDueTasks({ dataDir: DATA_DIR, now, run, load: due });
    // Two ticks in the same minute, NO dedup map → both ticks fire both tasks.
    expect(first.map((r) => r.id)).toEqual([1, 2]);
    expect(second.map((r) => r.id)).toEqual([1, 2]);
    expect(ran.length).toBe(4);
  });

  it("a single tick per window still fires each due task exactly once", async () => {
    const { run, ran } = countingRun();
    const { results, lastFired } = await runDueTasksTracked({
      dataDir: DATA_DIR,
      now,
      run,
      load: due,
      lastFired: {},
    });
    expect(results.map((r) => r.id)).toEqual([1, 2]);
    expect(ran.length).toBe(2);
    expect(lastFired).toEqual({ "1": fireWindowKey(now), "2": fireWindowKey(now) });
  });

  it("an overlapping tick within the same window does NOT re-fire", async () => {
    const { run, ran } = countingRun();
    const first = await runDueTasksTracked({
      dataDir: DATA_DIR,
      now,
      run,
      load: due,
      lastFired: {},
    });
    // Same `now` (same minute) → all tasks already recorded → no re-fire.
    const second = await runDueTasksTracked({
      dataDir: DATA_DIR,
      now,
      run,
      load: due,
      lastFired: first.lastFired,
    });
    expect(first.results.map((r) => r.id)).toEqual([1, 2]);
    expect(second.results).toEqual([]);
    expect(ran.length).toBe(2);
  });

  it("a genuinely-new window fires again", async () => {
    const { run, ran } = countingRun();
    const first = await runDueTasksTracked({
      dataDir: DATA_DIR,
      now,
      run,
      load: due,
      lastFired: {},
    });
    const nextMinute = new Date(now.getTime() + 60_000);
    const second = await runDueTasksTracked({
      dataDir: DATA_DIR,
      now: nextMinute,
      run,
      load: due,
      lastFired: first.lastFired,
    });
    expect(second.results.map((r) => r.id)).toEqual([1, 2]);
    expect(ran.length).toBe(4);
    expect(second.lastFired).toEqual({
      "1": fireWindowKey(nextMinute),
      "2": fireWindowKey(nextMinute),
    });
  });

  it("a newly-added task fires even if another already fired this window", async () => {
    const { run, ran } = countingRun();
    const first = await runDueTasksTracked({
      dataDir: DATA_DIR,
      now,
      run,
      load: loaderFor([entry({ id: 1, instruction: "a", cron: ALWAYS })]),
      lastFired: {},
    });
    // Task 2 is new this window — task 1 already fired, task 2 still fires.
    const second = await runDueTasksTracked({
      dataDir: DATA_DIR,
      now,
      run,
      load: due,
      lastFired: first.lastFired,
    });
    expect(first.results.map((r) => r.id)).toEqual([1]);
    expect(second.results.map((r) => r.id)).toEqual([2]);
    expect(ran.length).toBe(2);
  });
});

describe("runDueTasks cross-process claim (store-CAS)", () => {
  const due = loaderFor([
    entry({ id: 1, instruction: "a", cron: ALWAYS }),
    entry({ id: 2, instruction: "b", cron: ALWAYS }),
  ]);

  it("a task whose claim is lost (another process holds it) does NOT fire", async () => {
    // Simulate the other process having already claimed task 1 this window.
    const claim = async (id: number): Promise<boolean> => id !== 1;
    const results = await runDueTasksTracked({
      dataDir: DATA_DIR,
      now,
      run: echoRun,
      load: due,
      lastFired: {},
      claim,
    });
    expect(results.results.map((r) => r.id)).toEqual([2]);
    // The skipped task is NOT recorded as fired locally — the winner owns it.
    expect(results.lastFired).toEqual({ "2": fireWindowKey(now) });
  });

  it("records the claim call per due task and fires all when every claim wins", async () => {
    const claimed: Array<[number, string]> = [];
    const claim = async (id: number, windowKey: string): Promise<boolean> => {
      claimed.push([id, windowKey]);
      return true;
    };
    const results = await runDueTasksTracked({
      dataDir: DATA_DIR,
      now,
      run: echoRun,
      load: due,
      lastFired: {},
      claim,
    });
    expect(results.results.map((r) => r.id)).toEqual([1, 2]);
    expect(claimed).toEqual([
      [1, fireWindowKey(now)],
      [2, fireWindowKey(now)],
    ]);
  });

  it("does not consult the claim for a task already deduped in-process", async () => {
    // Task 1 pre-recorded this window → shouldFire=false → claim never called for it.
    let claimCalls = 0;
    const claim = async (): Promise<boolean> => {
      claimCalls += 1;
      return true;
    };
    const results = await runDueTasksTracked({
      dataDir: DATA_DIR,
      now,
      run: echoRun,
      load: due,
      lastFired: { "1": fireWindowKey(now) },
      claim,
    });
    expect(results.results.map((r) => r.id)).toEqual([2]);
    expect(claimCalls).toBe(1); // only task 2 reached the CAS gate
  });
});
