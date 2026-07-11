import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendTask, latestTasks, readTasks, type WorkerTask } from "../team/tasks.js";
import { runAgentsCommand } from "./agents-cmd.js";
import { recordDelegationNode } from "../subagent/delegation-receipt.js";

let root: string;
let home: string;
let env: NodeJS.ProcessEnv;
let logs: string[];

function task(id: string, status: WorkerTask["status"], extra: Partial<WorkerTask> = {}): WorkerTask {
  const now = new Date().toISOString();
  return {
    kind: "task",
    id,
    workerId: extra.workerId ?? "worker-a",
    title: extra.title ?? "Investigate issue",
    status,
    created: now,
    updated: now,
    ...extra,
  };
}

async function run(rest: string[]): Promise<number> {
  return runAgentsCommand(root, rest, {
    env,
    log: (line) => logs.push(line),
    serviceStatus: async () => ({
      platform: "darwin",
      installed: true,
      running: true,
      plistPath: "/tmp/vanta.plist",
    }),
    uninstallService: async () => undefined,
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-agents-root-"));
  home = await mkdtemp(join(tmpdir(), "vanta-agents-home-"));
  env = { VANTA_HOME: home };
  logs = [];
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

describe("runAgentsCommand", () => {
  it("lists active agent sessions from the team task ledger", async () => {
    await appendTask(task("t1", "running", { title: "Build parser" }), env);
    await appendTask(task("t2", "removed", { title: "Hidden" }), env);

    expect(await run([])).toBe(0);
    expect(logs.join("\n")).toContain("Agents — 1 session");
    expect(logs.join("\n")).toContain("t1 · worker-a · running · Build parser");
    expect(logs.join("\n")).not.toContain("Hidden");
  });

  it("prints logs for done and blocked sessions", async () => {
    await appendTask(task("done-1", "done", { result: "finished ok" }), env);
    await appendTask(task("block-1", "blocked", { blocker: "needs token" }), env);

    expect(await run(["logs", "done-1"])).toBe(0);
    expect(await run(["attach", "block-1"])).toBe(0);
    expect(logs.join("\n")).toContain("finished ok");
    expect(logs.join("\n")).toContain("needs token");
  });

  it("stops a running session", async () => {
    await appendTask(task("run-1", "running"), env);

    expect(await run(["stop", "run-1"])).toBe(0);
    const latest = latestTasks(await readTasks(env)).find((t) => t.id === "run-1");
    expect(latest?.status).toBe("stopped");
    expect(latest?.blocker).toContain("stopped by operator");
  });

  it("removes a session from the visible list", async () => {
    await appendTask(task("old-1", "done"), env);

    expect(await run(["rm", "old-1"])).toBe(0);
    expect(await run(["list"])).toBe(0);
    expect(logs.join("\n")).not.toContain("old-1");
  });

  it("respawns a session as a fresh assigned task", async () => {
    await appendTask(task("old-1", "blocked", { title: "Retry me", workerId: "worker-b" }), env);

    expect(await run(["respawn", "old-1"])).toBe(0);
    const tasks = latestTasks(await readTasks(env));
    const spawned = tasks.find((t) => t.id.startsWith("old-1-respawn-"));
    expect(spawned?.status).toBe("assigned");
    expect(spawned?.workerId).toBe("worker-b");
    expect(spawned?.title).toBe("Retry me");
  });

  it("supports daemon status through the agents surface", async () => {
    expect(await run(["daemon", "status"])).toBe(0);
    expect(logs.join("\n")).toContain("daemon platform darwin");
    expect(logs.join("\n")).toContain("running yes");
  });

  it("inspects delegation trees and queues replay controls", async () => {
    await recordDelegationNode(root, {
      id: "child-1", treeId: "tree-1", parentId: "parent", parentTask: "Audit release",
      childPrompt: "Inspect tests", model: "gpt-5.5", tools: ["read_file"], summary: "Tests pass",
      rawSidechain: ".vanta/sidechains/child.json", verification: "pass", stoppedReason: "done",
      durationMs: 100, createdAt: "2026-07-11T12:00:00.000Z",
    });
    expect(await run(["delegations", "tree-1"])).toBe(0);
    expect(logs.join("\n")).toContain("Tests pass");
    logs = [];
    expect(await run(["delegation", "replay", "child-1"])).toBe(0);
    expect(logs.join("\n")).toContain("queued replay");
    expect(latestTasks(await readTasks(env)).some((task) => task.title.includes("Inspect tests"))).toBe(true);
  });

  it("honors the disableAgentView setting", async () => {
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(join(root, ".vanta", "settings.json"), JSON.stringify({ disableAgentView: true }), "utf8");

    expect(await run(["list"])).toBe(1);
    expect(logs.join("\n")).toContain("agent view disabled");
  });
});
