import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimFire, sweepClaims, claimPath } from "./cron-cas.js";

const KEY = "2026-06-01T08:07";

describe("claimFire", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-cron-cas-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("wins the claim on a fresh (task, window) and writes the claim file", async () => {
    expect(await claimFire(dir, 1, KEY)).toBe(true);
    expect(existsSync(claimPath(dir, 1, KEY))).toBe(true);
  });

  it("refuses a second claim for the same (task, window) — at-most-once", async () => {
    expect(await claimFire(dir, 1, KEY)).toBe(true);
    expect(await claimFire(dir, 1, KEY)).toBe(false);
    expect(await claimFire(dir, 1, KEY)).toBe(false);
  });

  it("allows the same task to claim a DIFFERENT window (the next minute fires)", async () => {
    expect(await claimFire(dir, 1, KEY)).toBe(true);
    expect(await claimFire(dir, 1, "2026-06-01T08:08")).toBe(true);
  });

  it("treats distinct tasks in the same window independently", async () => {
    expect(await claimFire(dir, 1, KEY)).toBe(true);
    expect(await claimFire(dir, 2, KEY)).toBe(true);
  });

  it("exactly one of many concurrent claims wins the same (task, window)", async () => {
    // The core cross-process guarantee: N racing callers → exactly 1 true.
    const results = await Promise.all(
      Array.from({ length: 24 }, () => claimFire(dir, 7, KEY)),
    );
    expect(results.filter((won) => won).length).toBe(1);
  });

  it("fails soft toward firing when the claim path can't be created", async () => {
    // A non-existent parent that is actually a FILE makes mkdir/write fail with
    // a non-EEXIST error → claim SUCCEEDS (never silently drops a due fire).
    const filePath = join(dir, "not-a-dir");
    await writeFile(filePath, "x", "utf8");
    expect(await claimFire(filePath, 1, KEY)).toBe(true);
  });
});

describe("sweepClaims", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-cron-cas-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("prunes prior-window claims and keeps the current window", async () => {
    await claimFire(dir, 1, "2026-06-01T08:05");
    await claimFire(dir, 2, "2026-06-01T08:06");
    await claimFire(dir, 1, KEY);
    await claimFire(dir, 2, KEY);

    const removed = await sweepClaims(dir, KEY);
    expect(removed).toBe(2);

    const remaining = await readdir(join(dir, "cron-claims"));
    expect(remaining.every((n) => n.endsWith(`__${KEY}.claim`))).toBe(true);
    expect(remaining.length).toBe(2);
  });

  it("is a no-op (returns 0) when the claims dir does not exist", async () => {
    expect(await sweepClaims(dir, KEY)).toBe(0);
  });

  it("leaves the freed windows re-claimable after a sweep", async () => {
    await claimFire(dir, 1, "2026-06-01T08:05");
    await sweepClaims(dir, KEY);
    // The old window's file is gone, so a (hypothetical) replay could re-claim it.
    expect(await claimFire(dir, 1, "2026-06-01T08:05")).toBe(true);
  });
});
