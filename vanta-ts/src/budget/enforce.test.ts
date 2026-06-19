import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveDef, loadDef } from "../loop/store.js";
import { enqueueLoopWake, drainLoopWakes } from "../loop/wake.js";
import { LoopDefSchema, WakeContextSchema } from "../loop/types.js";
import { setBudgetLimit, getBudget } from "./store.js";
import { enforceScopeBudget, checkLoopBudgetBeforeRun, scopeForLoop } from "./enforce.js";

const NOW = new Date("2026-06-19T00:00:00.000Z");

function loopDef(id: string) {
  return LoopDefSchema.parse({
    id, goal: "g", trigger: { kind: "manual" }, stages: [{ name: "s", prompt: "p" }],
    createdAt: "2026-06-19T00:00:00.000Z",
  });
}
function wakeFor(id: string) {
  return WakeContextSchema.parse({ wake_reason: "manual", goal_id: id, since: null, delta: [] });
}

describe("enforceScopeBudget — loop hard stop", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-enforce-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("auto-pauses the loop and cancels ONLY its queued wakes on overspend", async () => {
    await saveDef(dir, loopDef("nightly"));
    await saveDef(dir, loopDef("other"));
    await enqueueLoopWake(dir, wakeFor("nightly"));
    await enqueueLoopWake(dir, wakeFor("nightly"));
    await enqueueLoopWake(dir, wakeFor("other"));
    await setBudgetLimit(dir, { scope: scopeForLoop("nightly"), limitUsd: 1, now: NOW });

    const r = await enforceScopeBudget({ dataDir: dir, scope: scopeForLoop("nightly"), deltaUsd: 1.5, now: NOW });
    expect(r.justExceeded).toBe(true);
    expect(r.exceeded).toBe(true);
    expect(r.pausedLoop).toBe(true);
    expect(r.cancelledWork).toBe(2);

    expect((await loadDef(dir, "nightly"))?.status).toBe("paused");
    expect((await loadDef(dir, "other"))?.status).toBe("active"); // untouched
    const remaining = await drainLoopWakes(dir);
    expect(remaining.map((w) => w.goal_id)).toEqual(["other"]); // only other's wake survives
  });

  it("fires the stop side effects exactly once (not again while already exceeded)", async () => {
    await saveDef(dir, loopDef("nightly"));
    await setBudgetLimit(dir, { scope: scopeForLoop("nightly"), limitUsd: 1, now: NOW });
    await enforceScopeBudget({ dataDir: dir, scope: scopeForLoop("nightly"), deltaUsd: 2, now: NOW });
    await enqueueLoopWake(dir, wakeFor("nightly")); // a new wake after the pause

    const second = await enforceScopeBudget({ dataDir: dir, scope: scopeForLoop("nightly"), deltaUsd: 1, now: NOW });
    expect(second.justExceeded).toBe(false);
    expect(second.pausedLoop).toBe(false);
    expect(second.cancelledWork).toBe(0);
    expect(await drainLoopWakes(dir)).toHaveLength(1); // not re-cancelled
  });

  it("is a no-op when no budget is set for the scope", async () => {
    const r = await enforceScopeBudget({ dataDir: dir, scope: scopeForLoop("nightly"), deltaUsd: 99, now: NOW });
    expect(r.enforced).toBe(false);
    expect(r.justExceeded).toBe(false);
  });

  it("flips a non-loop scope to exceeded without pausing any loop", async () => {
    await setBudgetLimit(dir, { scope: "session", limitUsd: 1, now: NOW });
    const r = await enforceScopeBudget({ dataDir: dir, scope: "session", deltaUsd: 2, now: NOW });
    expect(r.exceeded).toBe(true);
    expect(r.pausedLoop).toBe(false);
    expect((await getBudget(dir, "session"))?.pauseReason).toBe("budget");
  });
});

describe("checkLoopBudgetBeforeRun — pre-run gate", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-pregate-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("returns null (loop may run) when under the limit", async () => {
    await saveDef(dir, loopDef("nightly"));
    await setBudgetLimit(dir, { scope: scopeForLoop("nightly"), limitUsd: 10, now: NOW });
    expect(await checkLoopBudgetBeforeRun(dir, "nightly")).toBeNull();
  });

  it("returns null when no budget is set", async () => {
    await saveDef(dir, loopDef("nightly"));
    expect(await checkLoopBudgetBeforeRun(dir, "nightly")).toBeNull();
  });

  it("pauses + cancels queued wakes when already exceeded", async () => {
    await saveDef(dir, loopDef("nightly"));
    await enqueueLoopWake(dir, wakeFor("nightly"));
    await setBudgetLimit(dir, { scope: scopeForLoop("nightly"), limitUsd: 1, now: NOW });
    // Drive it over the limit directly in the ledger (limit lowered below spend).
    await enforceScopeBudget({ dataDir: dir, scope: scopeForLoop("nightly"), deltaUsd: 2, now: NOW });
    await enqueueLoopWake(dir, wakeFor("nightly")); // re-queue after first cancel

    const stop = await checkLoopBudgetBeforeRun(dir, "nightly");
    expect(stop?.exceeded).toBe(true);
    expect(stop?.cancelledWork).toBe(1);
    expect(await drainLoopWakes(dir)).toHaveLength(0);
  });
});
