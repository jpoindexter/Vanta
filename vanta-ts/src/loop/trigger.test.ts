import { describe, it, expect } from "vitest";
import { isLoopDue, advanceTick } from "./trigger.js";
import { LoopDefSchema, newState } from "./types.js";
import type { LoopDef, Trigger } from "./types.js";

function defWith(trigger: Trigger, status: LoopDef["status"] = "active"): LoopDef {
  return LoopDefSchema.parse({
    id: "t",
    goal: "g",
    trigger,
    stages: [{ name: "execute", prompt: "p" }],
    status,
    createdAt: "2026-06-11T00:00:00.000Z",
  });
}

// Local time (not UTC) — cron isDue() reads getHours()/getDate() in local tz.
const NOON = new Date(2026, 5, 11, 12, 0, 0);

describe("isLoopDue", () => {
  it("manual loops never auto-wake", () => {
    expect(isLoopDue(defWith({ kind: "manual" }), newState("t"), NOON)).toBe(false);
  });

  it("event loops never wake from the clock; queued events target them explicitly", () => {
    expect(isLoopDue(defWith({ kind: "event", event: "approval.resolved" }), newState("t"), NOON)).toBe(false);
  });

  it("a paused loop never wakes, even on a matching cron", () => {
    const def = defWith({ kind: "cron", expr: "0 12 * * *" }, "paused");
    expect(isLoopDue(def, newState("t"), NOON)).toBe(false);
  });

  it("cron wakes only when the expression matches the clock", () => {
    expect(isLoopDue(defWith({ kind: "cron", expr: "0 12 * * *" }), newState("t"), NOON)).toBe(true);
    expect(isLoopDue(defWith({ kind: "cron", expr: "0 13 * * *" }), newState("t"), NOON)).toBe(false);
  });

  it("heartbeat everyTicks=1 wakes every tick", () => {
    expect(isLoopDue(defWith({ kind: "heartbeat", everyTicks: 1 }), newState("t"), NOON)).toBe(true);
  });

  it("heartbeat everyTicks=3 wakes only once the counter reaches the interval", () => {
    const def = defWith({ kind: "heartbeat", everyTicks: 3 });
    expect(isLoopDue(def, { ...newState("t"), ticksSinceRun: 0 }, NOON)).toBe(false);
    expect(isLoopDue(def, { ...newState("t"), ticksSinceRun: 1 }, NOON)).toBe(false);
    expect(isLoopDue(def, { ...newState("t"), ticksSinceRun: 2 }, NOON)).toBe(true);
  });
});

describe("advanceTick", () => {
  it("increments the counter for a heartbeat loop", () => {
    const def = defWith({ kind: "heartbeat", everyTicks: 3 });
    expect(advanceTick(def, newState("t")).ticksSinceRun).toBe(1);
  });

  it("leaves non-heartbeat loops untouched", () => {
    const def = defWith({ kind: "cron", expr: "0 12 * * *" });
    const s = { ...newState("t"), ticksSinceRun: 5 };
    expect(advanceTick(def, s)).toBe(s);
  });
});
