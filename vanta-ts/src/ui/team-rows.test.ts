import { describe, expect, it } from "vitest";
import { teamSummary, teamsKeyAction, toTeamWorkerRow } from "./team-rows.js";
import type { Worker } from "../team/store.js";
import type { WorkerTask } from "../team/tasks.js";

const worker: Worker = { kind: "worker", id: "analyst", role: "research", status: "idle", ts: "t" };
const task = (patch: Partial<WorkerTask> = {}): WorkerTask => ({
  kind: "task",
  id: "t1",
  workerId: "analyst",
  title: "Map the market",
  status: "running",
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
  ...patch,
});

describe("team rows", () => {
  it("shapes a worker with runtime state and open task count", () => {
    expect(toTeamWorkerRow(worker, [task()])).toMatchObject({
      id: "analyst",
      role: "research",
      runtime: "running",
      openTasks: 1,
      runningTitle: "Map the market",
    });
  });

  it("summarizes workers and open tasks", () => {
    expect(teamSummary([worker], [task(), task({ id: "t2", status: "done" })])).toBe("1 worker · 1 open task");
  });

  it("maps keys to team panel actions", () => {
    expect(teamsKeyAction("n", {}, { detail: false, sel: 0, count: 0 })).toEqual({ kind: "create" });
    expect(teamsKeyAction("b", {}, { detail: false, sel: 0, count: 1 })).toEqual({ kind: "status", status: "blocked" });
    expect(teamsKeyAction("", { downArrow: true }, { detail: false, sel: 0, count: 2 })).toEqual({ kind: "move", to: 1 });
    expect(teamsKeyAction("", { escape: true }, { detail: true, sel: 0, count: 1 })).toEqual({ kind: "closeDetail" });
  });
});
