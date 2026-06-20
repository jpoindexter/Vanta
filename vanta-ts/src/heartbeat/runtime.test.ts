import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  recoverOrphans,
  runHeartbeat,
  loadRuns,
  saveRuns,
  STAGE_ORDER,
  type HeartbeatRun,
  type HeartbeatStage,
} from "./runtime.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");
const okStage = (name: string): HeartbeatStage => ({ name, run: async () => ({ ok: true }) });
const failStage = (name: string, reason: string): HeartbeatStage => ({ name, run: async () => ({ ok: false, reason }) });

let tmp: string;
beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "vanta-hb-")); });
afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

function baseDeps(over: Partial<Parameters<typeof runHeartbeat>[0]> = {}) {
  return {
    dataDir: tmp,
    now: () => NOW,
    pid: 4242,
    isAlive: () => true,
    queuedCount: async () => 1,
    stages: STAGE_ORDER.map((s) => okStage(s)),
    execute: async () => ({ ran: 2 }),
    newId: () => "run-1",
    ...over,
  };
}

describe("recoverOrphans", () => {
  it("recovers a running run with a dead pid, leaves alive/terminal runs", () => {
    const runs: HeartbeatRun[] = [
      { id: "a", status: "running", pid: 1, startedAt: "x" },
      { id: "b", status: "running", pid: 2, startedAt: "x" },
      { id: "c", status: "done", pid: 3, startedAt: "x" },
    ];
    const isAlive = (pid: number) => pid === 2;
    const { runs: next, recovered } = recoverOrphans(runs, isAlive, NOW);
    expect(recovered).toEqual(["a"]);
    expect(next.find((r) => r.id === "a")?.status).toBe("recovered");
    expect(next.find((r) => r.id === "b")?.status).toBe("running");
    expect(next.find((r) => r.id === "c")?.status).toBe("done");
  });
});

describe("runHeartbeat", () => {
  it("coalesces to a no-op when nothing is queued, but still recovers orphans", async () => {
    await saveRuns(tmp, [{ id: "dead", status: "running", pid: 999999, startedAt: "x" }]);
    const r = await runHeartbeat(baseDeps({ queuedCount: async () => 0, isAlive: () => false }));
    expect(r.ranPipeline).toBe(false);
    expect(r.ran).toBe(0);
    expect(r.recovered).toEqual(["dead"]);
    expect((await loadRuns(tmp)).find((x) => x.id === "dead")?.status).toBe("recovered");
  });

  it("runs the pipeline in order and executes the work on success", async () => {
    const seen: string[] = [];
    const stages = STAGE_ORDER.map((s) => ({ name: s, run: async () => { seen.push(s); return { ok: true }; } }));
    const r = await runHeartbeat(baseDeps({ stages }));
    expect(seen).toEqual(["budget", "workspace", "secret", "skill", "adapter"]);
    expect(r.ran).toBe(2);
    expect((await loadRuns(tmp)).find((x) => x.id === "run-1")?.status).toBe("done");
  });

  it("short-circuits on the first failing gate and never executes the work", async () => {
    let executed = false;
    const stages = [okStage("budget"), failStage("workspace", "no disk"), okStage("secret")];
    const r = await runHeartbeat(baseDeps({ stages, execute: async () => { executed = true; return { ran: 9 }; } }));
    expect(r.failedStage).toBe("workspace");
    expect(executed).toBe(false);
    const run = (await loadRuns(tmp)).find((x) => x.id === "run-1");
    expect(run?.status).toBe("failed");
    expect(run?.stage).toBe("workspace");
  });

  it("marks the run failed when execute throws", async () => {
    const r = await runHeartbeat(baseDeps({ execute: async () => { throw new Error("boom"); } }));
    expect(r.ranPipeline).toBe(true);
    const run = (await loadRuns(tmp)).find((x) => x.id === "run-1");
    expect(run?.status).toBe("failed");
    expect(run?.error).toContain("boom");
  });
});
