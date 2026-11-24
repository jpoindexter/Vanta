import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lastRunByJob, listScheduleRuns, recordScheduleRun, runSucceeded } from "./run-log.js";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-run-log-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("schedule run log", () => {
  it("lists a job's runs newest first and ignores other jobs and torn lines", async () => {
    await recordScheduleRun(dir, { jobId: 1, at: "2026-10-13T09:00:00Z", trigger: "scheduled", ok: true, summary: "first" });
    await recordScheduleRun(dir, { jobId: 2, at: "2026-10-13T09:01:00Z", trigger: "scheduled", ok: true, summary: "other" });
    await appendFile(join(dir, "cron-runs.jsonl"), "{not json\n");
    await recordScheduleRun(dir, { jobId: 1, at: "2026-10-13T10:00:00Z", trigger: "manual", ok: false, summary: "second" });

    expect((await listScheduleRuns(dir, 1)).map((run) => run.summary)).toEqual(["second", "first"]);
    expect((await listScheduleRuns(dir, 1, 1))).toHaveLength(1);
    expect((await lastRunByJob(dir)).get(1)?.ok).toBe(false);
  });

  it("returns nothing when no run was ever logged, and caps stored summaries", async () => {
    expect(await listScheduleRuns(dir, 1)).toEqual([]);
    const run = await recordScheduleRun(dir, { jobId: 1, at: "2026-10-13T09:00:00Z", trigger: "manual", ok: true, summary: "x".repeat(5000) });
    expect(run.summary).toHaveLength(2000);
  });

  it("treats runner errors and human gates as failures", () => {
    expect(runSucceeded("error: boom")).toBe(false);
    expect(runSucceeded("needs human: authority")).toBe(false);
    expect(runSucceeded("all good")).toBe(true);
  });
});
