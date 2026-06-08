import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getReviewPrompt,
  isDue,
  readReviewState,
  writeReviewState,
  REVIEW_PROMPTS,
} from "./review-loops.js";
import type { ReviewCadence } from "./review-loops.js";

async function tempDataDir(): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), "vanta-rl-")), ".vanta");
  await mkdir(dir, { recursive: true });
  return dir;
}

describe("getReviewPrompt", () => {
  it("returns the prompt for each cadence", () => {
    const cadences: ReviewCadence[] = ["daily", "weekly", "monthly"];
    for (const cadence of cadences) {
      const rp = getReviewPrompt(cadence);
      expect(rp.cadence).toBe(cadence);
      expect(typeof rp.prompt).toBe("string");
      expect(rp.prompt.length).toBeGreaterThan(0);
    }
  });

  it("covers all three cadences in REVIEW_PROMPTS", () => {
    expect(REVIEW_PROMPTS).toHaveLength(3);
    expect(REVIEW_PROMPTS.map((p) => p.cadence)).toEqual(
      expect.arrayContaining(["daily", "weekly", "monthly"]),
    );
  });
});

describe("isDue", () => {
  const now = new Date("2026-06-08T12:00:00.000Z");

  it("returns true when lastRun is null", () => {
    expect(isDue("daily", null, now)).toBe(true);
    expect(isDue("weekly", null, now)).toBe(true);
    expect(isDue("monthly", null, now)).toBe(true);
  });

  it("returns false for daily when it ran 1 hour ago", () => {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    expect(isDue("daily", oneHourAgo, now)).toBe(false);
  });

  it("returns true for daily when it ran 25 hours ago", () => {
    const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    expect(isDue("daily", twentyFiveHoursAgo, now)).toBe(true);
  });

  it("returns false for weekly when it ran 5 days ago", () => {
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(isDue("weekly", fiveDaysAgo, now)).toBe(false);
  });

  it("returns true for weekly when it ran 7 days ago", () => {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isDue("weekly", sevenDaysAgo, now)).toBe(true);
  });

  it("returns false for monthly when it ran 10 days ago", () => {
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(isDue("monthly", tenDaysAgo, now)).toBe(false);
  });

  it("returns true for monthly when it ran 28 days ago", () => {
    const twentyEightDaysAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString();
    expect(isDue("monthly", twentyEightDaysAgo, now)).toBe(true);
  });
});

describe("readReviewState", () => {
  it("returns {} for a missing file", async () => {
    const dir = await tempDataDir();
    const state = await readReviewState(dir);
    expect(state).toEqual({});
  });
});

describe("writeReviewState + readReviewState", () => {
  it("round-trips state correctly", async () => {
    const dir = await tempDataDir();
    const state = {
      daily: "2026-06-08T10:00:00.000Z",
      weekly: "2026-06-05T08:00:00.000Z",
    };
    await writeReviewState(dir, state);
    const loaded = await readReviewState(dir);
    expect(loaded).toEqual(state);
  });

  it("round-trips empty state", async () => {
    const dir = await tempDataDir();
    await writeReviewState(dir, {});
    const loaded = await readReviewState(dir);
    expect(loaded).toEqual({});
  });
});
