import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isWorkerPaused, pausedReason, pausedWorkerIds, tasksOfActiveWorkers } from "./paused.js";
import { appendTeam, type Worker } from "./store.js";
import type { WorkerTask } from "./tasks.js";

let home: string;
let env: NodeJS.ProcessEnv;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-paused-"));
  env = { VANTA_HOME: home };
});
afterEach(() => rm(home, { recursive: true, force: true }));

const worker = (id: string, extra: Record<string, unknown> = {}): Worker => ({ kind: "worker", id, role: "Engineer", status: "idle", ts: "2026-10-13T10:00:00.000Z", ...extra }) as Worker;
const task = (id: string, workerId: string): WorkerTask => ({ kind: "task", id, workerId, title: id, status: "assigned", created: "2026-10-13T10:00:00.000Z", updated: "2026-10-13T10:00:00.000Z" });

describe("paused workers", () => {
  it("reads the paused flag from the latest roster row", async () => {
    await appendTeam(worker("a"), env);
    await appendTeam(worker("b", { paused: true }), env);
    expect(isWorkerPaused(worker("x", { paused: true }))).toBe(true);
    expect([...(await pausedWorkerIds(env))]).toEqual(["b"]);
    await appendTeam(worker("b", { paused: false }), env);
    expect((await pausedWorkerIds(env)).size).toBe(0);
  });

  it("drops the tasks of paused workers and keeps the rest", async () => {
    await appendTeam(worker("a"), env);
    await appendTeam(worker("b", { paused: true }), env);
    const kept = await tasksOfActiveWorkers([task("T-1", "a"), task("T-2", "b"), task("T-3", "ghost")], env);
    expect(kept.map((t) => t.id)).toEqual(["T-1", "T-3"]);
  });

  it("explains how to resume a paused worker", async () => {
    await appendTeam(worker("b", { paused: true }), env);
    expect(await pausedReason("b", env)).toContain("Resume it");
    expect(await pausedReason("a", env)).toBeNull();
  });
});
