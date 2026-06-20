import { describe, expect, it } from "vitest";
import { makeLoopSchedule, type CronAdder } from "./loop-schedule-cmd.js";
import type { CronEntry } from "../schedule/cron.js";
import type { ReplCtx } from "./types.js";

// The handler reads only ctx.dataDir; a minimal cast satisfies the signature.
const ctx = { dataDir: "/tmp/vanta-data" } as ReplCtx;

/** A fake cron adder that records its calls instead of touching the filesystem. */
function fakeAdder() {
  const calls: Array<{ dataDir: string; cron: string; instruction: string }> = [];
  const add: CronAdder = async (dataDir, cron, instruction) => {
    calls.push({ dataDir, cron, instruction });
    const entry: CronEntry = { id: calls.length, cron, instruction, status: "active" };
    return entry;
  };
  return { add, calls };
}

describe("/loop handler", () => {
  it("schedules a cron entry for 'every 2 hours <task>'", async () => {
    const { add, calls } = fakeAdder();
    const loop = makeLoopSchedule(add);
    const r = await loop("every 2 hours sync the repo", ctx);
    expect(calls).toEqual([
      { dataDir: "/tmp/vanta-data", cron: "0 */2 * * *", instruction: "sync the repo" },
    ]);
    expect(r.output).toContain("0 */2 * * *");
    expect(r.output).toContain("sync the repo");
    expect(r.output).toContain("#1");
  });

  it("schedules 'every 30 minutes' to the stepped-minute cron", async () => {
    const { add, calls } = fakeAdder();
    const r = await makeLoopSchedule(add)("every 30 minutes ping build", ctx);
    expect(calls[0]?.cron).toBe("*/30 * * * *");
    expect(r.output).toContain("⟳ scheduled");
  });

  it("schedules 'every monday <task>' to a weekday cron", async () => {
    const { add, calls } = fakeAdder();
    await makeLoopSchedule(add)("every monday plan the week", ctx);
    expect(calls[0]).toMatchObject({ cron: "0 0 * * 1", instruction: "plan the week" });
  });

  it("schedules 'every day at 9:00 <task>'", async () => {
    const { add, calls } = fakeAdder();
    await makeLoopSchedule(add)("every day at 9:00 standup", ctx);
    expect(calls[0]).toMatchObject({ cron: "0 9 * * *", instruction: "standup" });
  });

  it("returns the parser error and creates NO schedule on garbage", async () => {
    const { add, calls } = fakeAdder();
    const r = await makeLoopSchedule(add)("flibbertigibbet nonsense", ctx);
    expect(calls).toEqual([]);
    expect(r.output).toMatch(/✘/);
    expect(r.output).toMatch(/unrecognized interval/);
  });

  it("errors with NO schedule when the task is missing", async () => {
    const { add, calls } = fakeAdder();
    const r = await makeLoopSchedule(add)("every 2 hours", ctx);
    expect(calls).toEqual([]);
    expect(r.output).toMatch(/no task/);
  });

  it("prints usage and creates NO schedule for an empty argument", async () => {
    const { add, calls } = fakeAdder();
    const r = await makeLoopSchedule(add)("   ", ctx);
    expect(calls).toEqual([]);
    expect(r.output).toMatch(/usage:/);
  });

  it("returns an out-of-range error with NO schedule (every 90 minutes)", async () => {
    const { add, calls } = fakeAdder();
    const r = await makeLoopSchedule(add)("every 90 minutes x", ctx);
    expect(calls).toEqual([]);
    expect(r.output).toMatch(/out of range/);
  });
});
