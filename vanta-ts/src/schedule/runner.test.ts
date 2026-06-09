import { describe, it, expect } from "vitest";
import { runDueTasks, type RunTask } from "./runner.js";
import type { CronEntry } from "./cron.js";

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
});
