import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initProjectRepo } from "../desktop/__fixtures__/company-external.js";
import { readRuns } from "../desktop/company-runs.js";
import { addRule } from "../permissions/store.js";
import { appendTeam, type Worker } from "../team/store.js";
import { appendTask, latestTasks, readTasks, type WorkerTask } from "../team/tasks.js";
import { runHeartbeatCommand } from "../heartbeat/run-cmd.js";
import { fakeSpawn } from "./__fixtures__/fake-spawn.js";
import { dispatchableCount, dispatchExternalTasks, queuedExternalTasks } from "./headless-dispatch.js";
import type { ProbeFn } from "./probe.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const lines = (name: string): string[] => readFileSync(join(fixtures, name), "utf8").split("\n").filter(Boolean);
const AT = "2026-10-13T10:00:00.000Z";

let home: string;
let root: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "vanta-hl-home-"));
  root = mkdtempSync(join(tmpdir(), "vanta-hl-root-"));
  initProjectRepo(root);
  const bin = mkdtempSync(join(tmpdir(), "vanta-hl-bin-"));
  writeFileSync(join(bin, "claude"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(bin, "claude"), 0o755);
  env = { ...process.env, VANTA_HOME: home, PATH: `${bin}:${process.env.PATH ?? ""}` };
});
afterEach(() => { rmSync(home, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); });

const worker = (id: string, extra: Record<string, unknown> = {}): Worker => ({ kind: "worker", id, role: "Engineer", status: "idle", ts: AT, adapter: "cli:claude-code", ...extra }) as Worker;
const task = (id: string, workerId: string): WorkerTask => ({ kind: "task", id, workerId, title: `Job ${id}`, status: "assigned", created: AT, updated: AT });
const probe: ProbeFn = async (_c, args) => (args[0] === "--version" ? { code: 0, stdout: "2.1.222 (Claude Code)", missing: false } : { code: 0, stdout: "", missing: false });

function seams(overrides: { stdout?: string[] } = {}) {
  const fake = fakeSpawn({ stdout: overrides.stdout ?? lines("claude-stream-success.jsonl") });
  return { fake, seams: { spawnFactory: fake.factory, probe, kernel: { assess: async () => ({ risk: "allow" as const }) } } };
}

describe("queued external tickets", () => {
  it("counts only unpaused workers on an external CLI", async () => {
    await appendTeam(worker("ext"), env);
    await appendTeam(worker("stopped", { paused: true }), env);
    await appendTeam(worker("native", { adapter: "openai" }), env);
    for (const [id, w] of [["T-1", "ext"], ["T-2", "stopped"], ["T-3", "native"]] as const) await appendTask(task(id, w), env);
    expect((await queuedExternalTasks(env)).map((q) => q.task.id)).toEqual(["T-1", "T-2"]);
    expect(await dispatchableCount(env)).toBe(1);
  });
});

describe("dispatchExternalTasks", () => {
  it("starts a queued ticket through the engine when the owner saved an Always rule for this project", async () => {
    await appendTeam(worker("ext"), env);
    await appendTask(task("T-1", "ext"), env);
    await addRule({ action: "allow", tool: "call_agent", root }, env);
    const { fake, seams: s } = seams();
    const report = await dispatchExternalTasks({ root, env, seams: s });
    expect(report).toEqual({ started: ["T-1"], skipped: [] });
    expect(fake.launches).toHaveLength(1);
    expect(fake.launches[0]!.cwd).toBe(root);
    expect(latestTasks(await readTasks(env)).find((t) => t.id === "T-1")?.status).toBe("done");
    const runs = await readRuns(home);
    expect(runs[0]).toMatchObject({ ticketId: "T-1", workerId: "ext", runtime: "claude-code", status: "done", costUsd: 0.0412, costBasis: "reported" });
  });

  it("fails closed when there is no saved rule: no card is possible, nothing launches, the ticket is blocked with the reason", async () => {
    await appendTeam(worker("ext"), env);
    await appendTask(task("T-1", "ext"), env);
    const { fake, seams: s } = seams();
    await dispatchExternalTasks({ root, env, seams: s });
    expect(fake.launches).toHaveLength(0);
    expect(latestTasks(await readTasks(env)).find((t) => t.id === "T-1")?.status).toBe("blocked");
    expect((await readRuns(home))[0]!.error).toContain("no approval channel");
  });

  it("does not start a paused worker's ticket", async () => {
    await appendTeam(worker("ext", { paused: true }), env);
    await appendTask(task("T-1", "ext"), env);
    const { fake, seams: s } = seams();
    const report = await dispatchExternalTasks({ root, env, seams: s });
    expect(report.started).toEqual([]);
    expect(report.skipped[0]).toMatchObject({ taskId: "T-1" });
    expect(report.skipped[0]!.reason).toContain("paused");
    expect(fake.launches).toHaveLength(0);
    expect(latestTasks(await readTasks(env)).find((t) => t.id === "T-1")?.status).toBe("assigned");
  });

  it("leaves a Vanta-loop worker's ticket alone", async () => {
    await appendTeam(worker("native", { adapter: "openai" }), env);
    await appendTask(task("T-1", "native"), env);
    const { fake, seams: s } = seams();
    expect(await dispatchExternalTasks({ root, env, seams: s })).toEqual({ started: [], skipped: [] });
    expect(fake.launches).toHaveLength(0);
  });
});

describe("vanta heartbeat", () => {
  it("does nothing for a paused worker's ticket: the wakeup coalesces to a no-op", async () => {
    await appendTeam(worker("ext", { paused: true }), env);
    await appendTask(task("T-1", "ext"), env);
    const saved = { ...process.env };
    Object.assign(process.env, { VANTA_HOME: env.VANTA_HOME });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runHeartbeatCommand(root);
      const printed = JSON.parse(String(log.mock.calls[0]![0])) as { heartbeat: { ranPipeline: boolean; ran: number }; dispatched: { started: string[] } };
      expect(printed.heartbeat).toMatchObject({ ranPipeline: false, ran: 0 });
      expect(printed.dispatched.started).toEqual([]);
    } finally {
      log.mockRestore();
      process.env.VANTA_HOME = saved.VANTA_HOME;
      if (saved.VANTA_HOME === undefined) delete process.env.VANTA_HOME;
    }
    expect(latestTasks(await readTasks(env)).find((t) => t.id === "T-1")?.status).toBe("assigned");
  });
});
