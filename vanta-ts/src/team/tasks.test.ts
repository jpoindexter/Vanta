import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendTask,
  readTasks,
  latestTasks,
  assignTask,
  advanceTask,
  tasksForWorker,
  workerLoad,
  type WorkerTask,
} from "./tasks.js";

describe("team/tasks store", () => {
  let env: NodeJS.ProcessEnv;
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-tasks-"));
    env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
  });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });

  it("appends + reads tasks", async () => {
    const now = new Date().toISOString();
    const task: WorkerTask = {
      kind: "task", id: "t1", workerId: "w1", title: "do something",
      status: "assigned", created: now, updated: now,
    };
    await appendTask(task, env);
    const recs = await readTasks(env);
    expect(recs).toHaveLength(1);
    expect(recs[0]!.id).toBe("t1");
  });

  it("readTasks on a missing file returns []", async () => {
    expect(await readTasks(env)).toEqual([]);
  });

  it("latestTasks last-write-wins per id", async () => {
    const now = new Date().toISOString();
    const base: WorkerTask = { kind: "task", id: "t1", workerId: "w1", title: "old", status: "assigned", created: now, updated: now };
    await appendTask(base, env);
    await appendTask({ ...base, status: "running", updated: new Date().toISOString() }, env);
    const latest = latestTasks(await readTasks(env));
    expect(latest).toHaveLength(1);
    expect(latest[0]!.status).toBe("running");
  });
});

describe("assignTask", () => {
  it("creates an assigned task when id is fresh", () => {
    const result = assignTask([], "t1", "w1", "build thing");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("assigned");
    expect(result.value.workerId).toBe("w1");
  });

  it("rejects a duplicate id", () => {
    const now = new Date().toISOString();
    const existing: WorkerTask = {
      kind: "task", id: "t1", workerId: "w1", title: "x", status: "assigned", created: now, updated: now,
    };
    const result = assignTask([existing], "t1", "w1", "y");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/already exists/);
  });
});

describe("advanceTask", () => {
  function makeTask(status: WorkerTask["status"]): WorkerTask {
    const now = new Date().toISOString();
    return { kind: "task", id: "t1", workerId: "w1", title: "t", status, created: now, updated: now };
  }

  it("assigned → running succeeds", () => {
    const r = advanceTask(makeTask("assigned"), "running");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe("running");
  });

  it("running → done succeeds and sets result", () => {
    const r = advanceTask(makeTask("running"), "done", "finished output");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe("done");
    expect(r.value.result).toBe("finished output");
  });

  it("running → blocked succeeds and sets blocker", () => {
    const r = advanceTask(makeTask("running"), "blocked", "waiting on api key");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe("blocked");
    expect(r.value.blocker).toBe("waiting on api key");
  });

  it("running → stopped succeeds and records the stop reason", () => {
    const r = advanceTask(makeTask("running"), "stopped", "stopped by operator");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe("stopped");
    expect(r.value.blocker).toBe("stopped by operator");
  });

  it("done → removed succeeds so old sessions can be hidden", () => {
    const r = advanceTask(makeTask("done"), "removed", "removed by operator");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe("removed");
  });

  it("blocked → running succeeds and clears blocker", () => {
    const base = { ...makeTask("blocked"), blocker: "old blocker" };
    const r = advanceTask(base, "running");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe("running");
    expect(r.value.blocker).toBeUndefined();
  });

  it("assigned → done is rejected", () => {
    const r = advanceTask(makeTask("assigned"), "done");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/illegal transition/);
  });

  it("done → running is rejected", () => {
    const r = advanceTask(makeTask("done"), "running");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/illegal transition/);
  });

  it("assigned → blocked is rejected", () => {
    const r = advanceTask(makeTask("assigned"), "blocked");
    expect(r.ok).toBe(false);
  });
});

describe("tasksForWorker + workerLoad", () => {
  function task(id: string, workerId: string, status: WorkerTask["status"]): WorkerTask {
    const now = new Date().toISOString();
    return { kind: "task", id, workerId, title: id, status, created: now, updated: now };
  }

  it("tasksForWorker returns only matching worker tasks", () => {
    const recs = [task("t1", "w1", "assigned"), task("t2", "w2", "running"), task("t3", "w1", "done")];
    const result = tasksForWorker(recs, "w1");
    expect(result.map((t) => t.id)).toEqual(["t1", "t3"]);
  });

  it("workerLoad counts only open (non-done) tasks", () => {
    const recs = [
      task("t1", "w1", "assigned"),
      task("t2", "w1", "running"),
      task("t3", "w1", "done"),
      task("t4", "w2", "blocked"),
      task("t5", "w2", "stopped"),
      task("t6", "w3", "removed"),
    ];
    const load = workerLoad(recs);
    expect(load.get("w1")).toBe(2); // assigned + running, not done
    expect(load.get("w2")).toBe(1); // blocked, not stopped
    expect(load.has("w3")).toBe(false);
  });

  it("workerLoad returns empty map when all tasks are done", () => {
    const recs = [task("t1", "w1", "done"), task("t2", "w2", "done")];
    const load = workerLoad(recs);
    expect(load.size).toBe(0);
  });
});
