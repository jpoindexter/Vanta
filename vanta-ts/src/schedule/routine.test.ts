import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasMissedFire, addCron, loadCron, type CronEntry } from "./cron.js";
import { runDueTasksTracked, type RunTask } from "./runner.js";
import { parseScheduleFlags } from "./commands.js";
import { fireWindowKey } from "./at-most-once.js";

// PCLIP-ROUTINES-ISSUE — a routine fire creates a tracked issue, wakes its
// agent with the issue referenced, and honors a catch-up policy after downtime.

const EVERY_MIN = "* * * * *";
// A local-time anchor away from midnight/DST edges.
const NOW = new Date(2026, 6, 6, 12, 30, 0);

async function tmpDataDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "vanta-routine-"));
}

function fakes(): { turns: string[]; issues: string[]; run: RunTask; createIssue: (t: string) => Promise<string> } {
  const turns: string[] = [];
  const issues: string[] = [];
  return {
    turns,
    issues,
    run: async (instruction) => {
      turns.push(instruction);
      return { finalText: "done" };
    },
    createIssue: async (title) => {
      issues.push(title);
      return `tkt-${issues.length}`;
    },
  };
}

describe("hasMissedFire", () => {
  it("finds a missed window between since and now, none when up to date", () => {
    const now = NOW.getTime();
    expect(hasMissedFire(EVERY_MIN, now - 5 * 60_000, now)).not.toBeNull();
    expect(hasMissedFire(EVERY_MIN, now, now)).toBeNull(); // strictly-after guard
    // Daily 03:00 job, host down 12:00→12:30 → no 03:00 window missed.
    expect(hasMissedFire("0 3 * * *", now - 30 * 60_000, now)).toBeNull();
  });

  it("bounds the scan (a since far in the past scans only the cap)", () => {
    const now = NOW.getTime();
    // Cap of 60 minutes: a daily 03:00 window missed 3 days ago is outside it.
    expect(hasMissedFire("0 3 * * *", now - 3 * 86_400_000, now, 60)).toBeNull();
  });
});

describe("routine fire → tracked issue + agent wake", () => {
  const entry: CronEntry = { id: 1, cron: EVERY_MIN, instruction: "morning brief", status: "active", routine: "skip" };

  it("creates the issue and prefixes the agent turn with its id", async () => {
    const f = fakes();
    const { results } = await runDueTasksTracked({
      dataDir: await tmpDataDir(),
      now: NOW,
      run: f.run,
      load: async () => [entry],
      createIssue: f.createIssue,
    });
    expect(f.issues).toEqual(["Routine #1: morning brief"]);
    expect(f.turns[0]).toContain("[tracked issue tkt-1]");
    expect(f.turns[0]).toContain("morning brief");
    expect(results[0]?.result).toContain("tkt-1");
  });

  it("a non-routine entry never touches the issue creator", async () => {
    const f = fakes();
    await runDueTasksTracked({
      dataDir: await tmpDataDir(),
      now: NOW,
      run: f.run,
      load: async () => [{ ...entry, routine: undefined }],
      createIssue: f.createIssue,
    });
    expect(f.issues).toEqual([]);
    expect(f.turns[0]).toBe("morning brief");
  });
});

describe("catch-up policy after downtime", () => {
  // Hourly routine; host was down across the 12:00 window; it's now 12:30.
  const hourly: CronEntry = { id: 7, cron: "0 * * * *", instruction: "hourly sync", status: "active", routine: "once" };
  const downSince = new Date(2026, 6, 6, 11, 30, 0);

  it('"once" fires one catch-up run for the missed window', async () => {
    const f = fakes();
    const lastFired = { "7": fireWindowKey(downSince) };
    const { results, lastFired: updated } = await runDueTasksTracked({
      dataDir: await tmpDataDir(),
      now: NOW, // 12:30 — NOT an hourly boundary
      run: f.run,
      load: async () => [hourly],
      lastFired,
      createIssue: f.createIssue,
    });
    expect(results).toHaveLength(1);
    expect(f.turns[0]).toContain("hourly sync");
    expect(f.issues).toHaveLength(1);
    // The catch-up advanced the dedup map → a same-minute re-tick does nothing.
    const again = await runDueTasksTracked({
      dataDir: await tmpDataDir(),
      now: NOW,
      run: f.run,
      load: async () => [hourly],
      lastFired: updated,
      createIssue: f.createIssue,
    });
    expect(again.results).toHaveLength(0);
  });

  it('"skip" drops the missed window; a never-fired routine has nothing to catch up', async () => {
    const f = fakes();
    const skip = await runDueTasksTracked({
      dataDir: await tmpDataDir(),
      now: NOW,
      run: f.run,
      load: async () => [{ ...hourly, routine: "skip" as const }],
      lastFired: { "7": fireWindowKey(downSince) },
      createIssue: f.createIssue,
    });
    expect(skip.results).toHaveLength(0);
    const fresh = await runDueTasksTracked({
      dataDir: await tmpDataDir(),
      now: NOW,
      run: f.run,
      load: async () => [hourly],
      lastFired: {},
      createIssue: f.createIssue,
    });
    expect(fresh.results).toHaveLength(0);
  });
});

describe("--routine flag + persistence", () => {
  it("parses bare and valued --routine; persists through the TSV", async () => {
    expect(parseScheduleFlags(["x", "--cron", EVERY_MIN, "--routine"]).routine).toBe("skip");
    expect(parseScheduleFlags(["x", "--cron", EVERY_MIN, "--routine", "once"]).routine).toBe("once");
    expect(parseScheduleFlags(["x", "--cron", EVERY_MIN]).routine).toBeUndefined();
    const dataDir = await tmpDataDir();
    await addCron(dataDir, EVERY_MIN, "r", { routine: "once" });
    expect((await loadCron(dataDir))[0]?.routine).toBe("once");
  });
});
