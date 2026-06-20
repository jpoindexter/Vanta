import { describe, it, expect } from "vitest";
import { deriveWorkerState, lastWorkerSummary } from "./idle.js";
import type { WorkerTask } from "./tasks.js";

function task(
  id: string,
  workerId: string,
  status: WorkerTask["status"],
  extra: Partial<WorkerTask> = {},
): WorkerTask {
  const now = new Date().toISOString();
  return { kind: "task", id, workerId, title: id, status, created: now, updated: now, ...extra };
}

describe("deriveWorkerState", () => {
  it("returns running when the worker has a running task", () => {
    const recs = [task("t1", "w1", "running")];
    expect(deriveWorkerState(recs, "w1")).toBe("running");
  });

  it("returns running when the worker has an assigned (not-yet-started) task", () => {
    const recs = [task("t1", "w1", "assigned")];
    expect(deriveWorkerState(recs, "w1")).toBe("running");
  });

  it("returns running when the worker's task is blocked (still actively held)", () => {
    const recs = [task("t1", "w1", "blocked")];
    expect(deriveWorkerState(recs, "w1")).toBe("running");
  });

  it("returns idle when every task is done and none are open", () => {
    const recs = [task("t1", "w1", "done")];
    expect(deriveWorkerState(recs, "w1")).toBe("idle");
  });

  it("returns idle when the worker's only task was stopped", () => {
    const recs = [task("t1", "w1", "stopped")];
    expect(deriveWorkerState(recs, "w1")).toBe("idle");
  });

  it("returns running when a worker has one done and one still-running task", () => {
    const recs = [task("t1", "w1", "done"), task("t2", "w1", "running")];
    expect(deriveWorkerState(recs, "w1")).toBe("running");
  });

  it("returns offline when the worker was never dispatched a task", () => {
    const recs = [task("t1", "other", "running")];
    expect(deriveWorkerState(recs, "w1")).toBe("offline");
  });

  it("returns offline when the worker's only task was removed", () => {
    const recs = [task("t1", "w1", "removed")];
    expect(deriveWorkerState(recs, "w1")).toBe("offline");
  });

  it("derives from latest-write-wins per task id (done overrides earlier running)", () => {
    const recs = [
      task("t1", "w1", "running", { updated: "2026-06-20T10:00:00.000Z" }),
      task("t1", "w1", "done", { updated: "2026-06-20T11:00:00.000Z" }),
    ];
    expect(deriveWorkerState(recs, "w1")).toBe("idle");
  });
});

describe("lastWorkerSummary", () => {
  it("returns the result of a single done task", () => {
    const recs = [task("t1", "w1", "done", { result: "scraped 12 rows" })];
    expect(lastWorkerSummary(recs, "w1")).toBe("scraped 12 rows");
  });

  it("returns the most-recently-updated completed task's result", () => {
    const recs = [
      task("t1", "w1", "done", { result: "older", updated: "2026-06-20T09:00:00.000Z" }),
      task("t2", "w1", "done", { result: "newer", updated: "2026-06-20T12:00:00.000Z" }),
    ];
    expect(lastWorkerSummary(recs, "w1")).toBe("newer");
  });

  it("returns undefined when the worker has no completed tasks", () => {
    const recs = [task("t1", "w1", "running")];
    expect(lastWorkerSummary(recs, "w1")).toBeUndefined();
  });

  it("ignores another worker's results", () => {
    const recs = [task("t1", "other", "done", { result: "not mine" })];
    expect(lastWorkerSummary(recs, "w1")).toBeUndefined();
  });

  it("skips completed tasks that carry no result", () => {
    const recs = [task("t1", "w1", "stopped")];
    expect(lastWorkerSummary(recs, "w1")).toBeUndefined();
  });
});
