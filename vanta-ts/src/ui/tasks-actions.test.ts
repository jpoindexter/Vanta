import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendTask, latestTasks, readTasks, type WorkerTask } from "../team/tasks.js";
import { visibleTasks, reloadTasks, stopWorkerTask, respawnWorkerTask } from "./tasks-actions.js";

let home: string;
let env: NodeJS.ProcessEnv;

function task(id: string, status: WorkerTask["status"], extra: Partial<WorkerTask> = {}): WorkerTask {
  const now = new Date().toISOString();
  return { kind: "task", id, workerId: extra.workerId ?? "worker-a", title: extra.title ?? "Investigate", status, created: now, updated: now, ...extra };
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-tasks-panel-"));
  env = { VANTA_HOME: home };
});
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

describe("visibleTasks", () => {
  it("drops removed tasks and sorts newest-updated first", () => {
    const recs: WorkerTask[] = [
      task("a", "running", { updated: "2026-06-19T10:00:00.000Z" }),
      task("b", "done", { updated: "2026-06-19T11:00:00.000Z" }),
      task("c", "removed"),
    ];
    const v = visibleTasks(recs);
    expect(v.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("reloadTasks", () => {
  it("reads the latest visible view from the store", async () => {
    await appendTask(task("t1", "running", { title: "Build parser" }), env);
    await appendTask(task("t2", "removed"), env);
    const v = await reloadTasks(env);
    expect(v.map((t) => t.id)).toEqual(["t1"]);
  });
});

describe("stopWorkerTask", () => {
  it("transitions a running task to stopped and returns the refreshed view", async () => {
    await appendTask(task("run-1", "running"), env);
    const r = await stopWorkerTask(task("run-1", "running"), env);
    expect(r.ok).toBe(true);
    const latest = latestTasks(await readTasks(env)).find((t) => t.id === "run-1");
    expect(latest?.status).toBe("stopped");
    if (r.ok) expect(r.tasks.find((t) => t.id === "run-1")?.status).toBe("stopped");
  });
  it("returns an error on an illegal transition", async () => {
    const r = await stopWorkerTask(task("d", "done"), env);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("illegal transition");
  });
});

describe("respawnWorkerTask", () => {
  it("creates a fresh assigned copy carrying worker + title", async () => {
    await appendTask(task("done-1", "done", { title: "Ship it", workerId: "worker-z" }), env);
    const r = await respawnWorkerTask(task("done-1", "done", { title: "Ship it", workerId: "worker-z" }), env);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const spawned = r.tasks.find((t) => t.id.startsWith("done-1-respawn-"));
      expect(spawned?.status).toBe("assigned");
      expect(spawned?.workerId).toBe("worker-z");
      expect(spawned?.title).toBe("Ship it");
    }
  });
});
