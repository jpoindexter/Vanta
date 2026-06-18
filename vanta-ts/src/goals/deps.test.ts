import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addGoalDependency, buildGoalGraph, parseGoalDepArgs, readGoalDeps, wakingDependents } from "./deps.js";
import type { Goal } from "../types.js";

describe("goal dependency graph", () => {
  it("persists dependency edges", async () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-deps-"));
    await addGoalDependency(dir, { blockerId: 1, dependentId: 2 });
    expect((await readGoalDeps(dir)).edges).toEqual([{ blockerId: 1, dependentId: 2 }]);
  });

  it("derives blocked state from unfinished blockers", () => {
    const rows = buildGoalGraph(goals("active", "active"), [{ blockerId: 1, dependentId: 2 }]);
    expect(rows.find((r) => r.goal.id === 2)?.status).toBe("blocked");
    expect(rows.find((r) => r.goal.id === 1)?.blocks).toEqual([2]);
  });

  it("wakes dependents when all blockers are done", () => {
    const all = goals("done", "active", "done");
    const woke = wakingDependents(1, all, [{ blockerId: 1, dependentId: 2 }, { blockerId: 3, dependentId: 2 }]);
    expect(woke.map((g) => g.id)).toEqual([2]);
  });

  it("does not wake dependents with another unfinished blocker", () => {
    const all = goals("done", "active", "active");
    const woke = wakingDependents(1, all, [{ blockerId: 1, dependentId: 2 }, { blockerId: 3, dependentId: 2 }]);
    expect(woke).toEqual([]);
  });

  it("parses blocks and blocked_by directions", () => {
    expect(parseGoalDepArgs("blocks 1 2", "blocks")).toEqual({ blockerId: 1, dependentId: 2 });
    expect(parseGoalDepArgs("blocked_by 2 1", "blocked_by")).toEqual({ blockerId: 1, dependentId: 2 });
  });
});

function goals(a: Goal["status"], b: Goal["status"], c: Goal["status"] = "active"): Goal[] {
  return [
    { id: 1, text: "one", status: a },
    { id: 2, text: "two", status: b },
    { id: 3, text: "three", status: c },
  ];
}
