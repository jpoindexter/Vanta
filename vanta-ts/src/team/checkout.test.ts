import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkoutTask, withTaskCheckout, lockPath, type CheckoutRecord } from "./checkout.js";

// A pid guaranteed not to map to a live process (valid int32, far above any
// real macOS/Linux pid) — used to exercise stale-lock reclaim.
const DEAD_PID = 2147483646;

async function readRecord(path: string): Promise<CheckoutRecord> {
  return JSON.parse(await readFile(path, "utf8")) as CheckoutRecord;
}

describe("checkoutTask", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-checkout-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("claims a fresh task and records the holder in the lock file", async () => {
    const r = await checkoutTask({ taskId: "fleet-1:one", workerId: "w1", dir });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(existsSync(r.value.path)).toBe(true);
    const rec = await readRecord(r.value.path);
    expect(rec.taskId).toBe("fleet-1:one");
    expect(rec.workerId).toBe("w1");
    expect(rec.pid).toBe(process.pid);
  });

  it("refuses a second claim of a task held by a live worker", async () => {
    const first = await checkoutTask({ taskId: "t", workerId: "w1", dir });
    expect(first.ok).toBe(true);
    const second = await checkoutTask({ taskId: "t", workerId: "w2", dir });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toMatch(/already checked out by w1/);
  });

  it("lets exactly one of many concurrent claims on one task win", async () => {
    const claims = await Promise.all(
      Array.from({ length: 16 }, (_, i) => checkoutTask({ taskId: "race", workerId: `w${i}`, dir })),
    );
    expect(claims.filter((c) => c.ok)).toHaveLength(1);
    expect(claims.filter((c) => !c.ok)).toHaveLength(15);
  });

  it("allows re-claim after the holder releases", async () => {
    const first = await checkoutTask({ taskId: "t", workerId: "w1", dir });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await first.value.release();
    expect(existsSync(first.value.path)).toBe(false);
    const second = await checkoutTask({ taskId: "t", workerId: "w2", dir });
    expect(second.ok).toBe(true);
  });

  it("reclaims a lock orphaned by a dead pid", async () => {
    const path = lockPath(dir, "stale");
    await writeFile(path, JSON.stringify({ taskId: "stale", workerId: "ghost", pid: DEAD_PID, acquired: "2026-01-01T00:00:00.000Z" }));
    const r = await checkoutTask({ taskId: "stale", workerId: "w-live", dir });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rec = await readRecord(r.value.path);
    expect(rec.workerId).toBe("w-live");
    expect(rec.pid).toBe(process.pid);
  });

  it("uses an injected clock for the acquired timestamp", async () => {
    const r = await checkoutTask({ taskId: "t", workerId: "w1", dir, now: () => new Date("2026-06-19T12:00:00.000Z") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await readRecord(r.value.path)).acquired).toBe("2026-06-19T12:00:00.000Z");
  });
});

describe("withTaskCheckout", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-withcheckout-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("runs fn under the lock then releases it", async () => {
    let ran = false;
    const r = await withTaskCheckout({ taskId: "t", workerId: "w1", dir }, async (h) => {
      ran = true;
      expect(existsSync(h.path)).toBe(true);
      return "result";
    });
    expect(ran).toBe(true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe("result");
    expect(existsSync(lockPath(dir, "t"))).toBe(false);
  });

  it("does not run fn when the task is already held", async () => {
    await checkoutTask({ taskId: "t", workerId: "holder", dir });
    let ran = false;
    const r = await withTaskCheckout({ taskId: "t", workerId: "w2", dir }, async () => { ran = true; return 1; });
    expect(ran).toBe(false);
    expect(r.ok).toBe(false);
  });

  it("releases the lock even when fn throws", async () => {
    await expect(
      withTaskCheckout({ taskId: "t", workerId: "w1", dir }, async () => { throw new Error("boom"); }),
    ).rejects.toThrow("boom");
    expect(existsSync(lockPath(dir, "t"))).toBe(false);
  });
});
