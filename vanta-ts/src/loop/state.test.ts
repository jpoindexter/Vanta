import { describe, it, expect } from "vitest";
import {
  openEscalations,
  hasOpenEscalations,
  raiseEscalation,
  clearEscalation,
  markInProgress,
  loopStateReminder,
} from "./state.js";
import { LoopDefSchema, newState } from "./types.js";
import type { LoopDef } from "./types.js";

const NOW = new Date("2026-06-11T09:00:00.000Z");

function def(goal = "ship the readme"): LoopDef {
  return LoopDefSchema.parse({
    id: "l",
    goal,
    trigger: { kind: "manual" },
    stages: [{ name: "execute", prompt: "p" }],
    createdAt: NOW.toISOString(),
  });
}

describe("escalations", () => {
  it("raises an open escalation with a stable count-derived id", () => {
    const s1 = raiseEscalation(newState("l"), "needs an API key", NOW);
    expect(s1.escalations).toHaveLength(1);
    expect(s1.escalations[0]).toMatchObject({ id: "esc-1", reason: "needs an API key", status: "open" });
    const s2 = raiseEscalation(s1, "second blocker", NOW);
    expect(s2.escalations[1]?.id).toBe("esc-2");
  });

  it("openEscalations / hasOpenEscalations reflect only open entries", () => {
    const s = raiseEscalation(newState("l"), "blocked", NOW);
    expect(hasOpenEscalations(s)).toBe(true);
    expect(openEscalations(s)).toHaveLength(1);
    const { state } = clearEscalation(s, "esc-1", NOW);
    expect(hasOpenEscalations(state)).toBe(false);
    expect(openEscalations(state)).toHaveLength(0);
  });

  it("clearEscalation marks cleared with a timestamp and reports the change", () => {
    const s = raiseEscalation(newState("l"), "blocked", NOW);
    const r = clearEscalation(s, "esc-1", NOW);
    expect(r.cleared).toBe(true);
    expect(r.state.escalations[0]).toMatchObject({ status: "cleared", clearedAt: NOW.toISOString() });
  });

  it("clearEscalation is a no-op for unknown or already-cleared ids", () => {
    const s = raiseEscalation(newState("l"), "blocked", NOW);
    expect(clearEscalation(s, "esc-99", NOW).cleared).toBe(false);
    const once = clearEscalation(s, "esc-1", NOW).state;
    expect(clearEscalation(once, "esc-1", NOW).cleared).toBe(false);
  });
});

describe("markInProgress", () => {
  it("toggles the crash-detection flag", () => {
    expect(markInProgress(newState("l"), true).inProgress).toBe(true);
    expect(markInProgress(markInProgress(newState("l"), true), false).inProgress).toBe(false);
  });
});

describe("loopStateReminder", () => {
  it("always carries the goal", () => {
    expect(loopStateReminder(def("do X"), newState("l"))).toContain("Loop goal: do X");
  });

  it("includes open blockers and recent lessons, omitting empty sections", () => {
    let s = raiseEscalation(newState("l"), "needs key", NOW);
    s = { ...s, lessons: ["a", "b"] };
    const text = loopStateReminder(def(), s);
    expect(text).toContain("Open blockers");
    expect(text).toContain("needs key");
    expect(text).toContain("Lessons so far: a; b");
  });

  it("caps lessons at the last 5", () => {
    const s = { ...newState("l"), lessons: ["1", "2", "3", "4", "5", "6", "7"] };
    const text = loopStateReminder(def(), s);
    expect(text).toContain("3; 4; 5; 6; 7");
    expect(text).not.toContain("1; 2");
  });

  it("a cleared-only state shows no blockers section", () => {
    const raised = raiseEscalation(newState("l"), "x", NOW);
    const { state } = clearEscalation(raised, "esc-1", NOW);
    expect(loopStateReminder(def(), state)).not.toContain("Open blockers");
  });
});
