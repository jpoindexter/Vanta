import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDue, loadCron, addCron, saveCron, type CronEntry } from "./cron.js";

// Fixed local-time literals so matches don't depend on the wall clock.
// new Date(year, monthIndex, day, hours, minutes): June (5) 2 2026.
const at = (h: number, m: number, d = 2, mon = 5) =>
  new Date(2026, mon, d, h, m);

describe("isDue", () => {
  it("matches a */15 step on minute 30 but not 31", () => {
    expect(isDue("*/15 * * * *", at(10, 30))).toBe(true);
    expect(isDue("*/15 * * * *", at(10, 31))).toBe(false);
  });

  it("matches a fixed time 0 8 * * * at 08:00 local, not 09:00", () => {
    expect(isDue("0 8 * * *", at(8, 0))).toBe(true);
    expect(isDue("0 8 * * *", at(9, 0))).toBe(false);
  });

  it("supports comma lists", () => {
    expect(isDue("0 8,12,18 * * *", at(12, 0))).toBe(true);
    expect(isDue("0 8,12,18 * * *", at(13, 0))).toBe(false);
  });

  it("supports ranges", () => {
    // 2026-06-02 is a Tuesday (getDay() === 2), within Mon-Fri (1-5).
    expect(isDue("0 9 * * 1-5", at(9, 0))).toBe(true);
    // 2026-06-06 is a Saturday (getDay() === 6), outside the range.
    expect(isDue("0 9 * * 1-5", at(9, 0, 6))).toBe(false);
  });

  it("supports a stepped range", () => {
    expect(isDue("0-30/10 * * * *", at(10, 20))).toBe(true);
    expect(isDue("0-30/10 * * * *", at(10, 25))).toBe(false);
  });

  it("treats * as always matching its field", () => {
    expect(isDue("* * * * *", at(3, 47))).toBe(true);
  });

  it("matches day-of-month and month fields", () => {
    expect(isDue("0 0 2 6 *", at(0, 0))).toBe(true);
    expect(isDue("0 0 3 6 *", at(0, 0))).toBe(false);
  });

  it("returns false for malformed expressions instead of throwing", () => {
    expect(isDue("not a cron", at(10, 30))).toBe(false);
    expect(isDue("* * * *", at(10, 30))).toBe(false); // too few fields
    expect(isDue("60 * * * *", at(10, 30))).toBe(false); // out of range
    expect(isDue("*/0 * * * *", at(10, 30))).toBe(false); // zero step
    expect(isDue("5-1 * * * *", at(10, 30))).toBe(false); // inverted range
  });
});

describe("cron persistence", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("returns [] when no cron.tsv exists", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-cron-"));
    expect(await loadCron(dir)).toEqual([]);
  });

  it("round-trips entries via addCron then loadCron", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-cron-"));
    const first = await addCron(dir, "*/15 * * * *", "sweep inbox");
    const second = await addCron(dir, "0 8 * * *", "daily standup");

    expect(first).toEqual({
      id: 1,
      cron: "*/15 * * * *",
      instruction: "sweep inbox",
      status: "active",
    });
    expect(second.id).toBe(2);

    const loaded = await loadCron(dir);
    expect(loaded).toEqual([first, second]);
  });

  it("saveCron rewrites the file and skips malformed lines on load", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-cron-"));
    const entries: CronEntry[] = [
      { id: 1, cron: "0 8 * * *", instruction: "a", status: "active" },
      { id: 2, cron: "0 9 * * *", instruction: "b", status: "paused" },
    ];
    await saveCron(dir, entries);
    expect(await loadCron(dir)).toEqual(entries);
  });

  it("saveCron with [] yields an empty load", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-cron-"));
    await saveCron(dir, []);
    expect(await loadCron(dir)).toEqual([]);
  });
});
