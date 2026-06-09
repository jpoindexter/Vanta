import { describe, it, expect } from "vitest";
import { nextStallState, shouldAlertStall, buildStallText, DEFAULT_STALL_THRESHOLD } from "./stall.js";
import type { Goal } from "../types.js";

describe("nextStallState", () => {
  it("resets on a progress tool (write/commit)", () => {
    expect(nextStallState({ stalledTurns: 5 }, ["read_file", "write_file"])).toEqual({ stalledTurns: 0 });
    expect(nextStallState({ stalledTurns: 3 }, ["git_commit"])).toEqual({ stalledTurns: 0 });
  });

  it("increments when the turn made no durable progress", () => {
    expect(nextStallState({ stalledTurns: 1 }, ["read_file", "web_search"])).toEqual({ stalledTurns: 2 });
    expect(nextStallState({ stalledTurns: 0 }, [])).toEqual({ stalledTurns: 1 });
  });

  it("treats a read-only git_status as no progress", () => {
    expect(nextStallState({ stalledTurns: 2 }, ["git_status", "git_diff"])).toEqual({ stalledTurns: 3 });
  });
});

describe("shouldAlertStall", () => {
  it("fires at the threshold and each multiple", () => {
    expect(shouldAlertStall({ stalledTurns: DEFAULT_STALL_THRESHOLD })).toBe(true);
    expect(shouldAlertStall({ stalledTurns: DEFAULT_STALL_THRESHOLD * 2 })).toBe(true);
  });

  it("stays quiet below the threshold and at zero", () => {
    expect(shouldAlertStall({ stalledTurns: DEFAULT_STALL_THRESHOLD - 1 })).toBe(false);
    expect(shouldAlertStall({ stalledTurns: 0 })).toBe(false);
  });

  it("threshold 0 disables it", () => {
    expect(shouldAlertStall({ stalledTurns: 8 }, 0)).toBe(false);
  });
});

describe("buildStallText", () => {
  const goal: Goal = { id: 1, text: "ship the dashboard", status: "active" };

  it("names the goal, duration, and the top buildable card as the unblocker", () => {
    const t = buildStallText(goal, 4, { id: "ROADMAP-ADD", title: "Agent-native add-card tool", size: "S" });
    expect(t).toContain("ship the dashboard");
    expect(t).toContain("4 turns");
    expect(t).toContain("ROADMAP-ADD");
  });

  it("falls back to /next when there is no top card", () => {
    const t = buildStallText(goal, 4);
    expect(t).toContain("/next");
  });
});
