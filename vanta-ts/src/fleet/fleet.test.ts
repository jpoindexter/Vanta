import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "../agent.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";
import type { WorkerTask } from "../team/tasks.js";
import type { KernelClient } from "../kernel/client.js";
import { acceptFleetWorker, runFleet } from "./fleet.js";
import { loadFleetReport } from "./store.js";

class FakeProvider implements LLMProvider {
  async complete(): Promise<CompletionResult> {
    return { text: "unused", toolCalls: [], finishReason: "stop" };
  }
  modelId(): string { return "fake"; }
  contextWindow(): number { return 8192; }
}

function deps(root: string): AgentDeps {
  return {
    provider: new FakeProvider(),
    safety: fakeKernel(),
    registry: new ToolRegistry(),
    root,
    requestApproval: async () => true,
  };
}

function fakeKernel(): KernelClient {
  return {
    async status() { return true; },
    async assess() { return { risk: "allow", needsHuman: false, reason: "" }; },
    async getGoals() { return []; },
    async addGoal() { return true; },
    async completeGoal() { return true; },
    async getApprovals() { return []; },
    async proposeApproval() { return null; },
    async approve() {},
    async deny() {},
    async logEvent() {},
  };
}

describe("runFleet", () => {
  it("fans out task specs to isolated worktree-rooted workers and records diffs", async () => {
    const root = mkdtempSync(join(tmpdir(), "fleet-"));
    const tasks: WorkerTask[] = [];
    try {
      const report = await runFleet({
        repoRoot: root,
        fleetId: "fleet-test",
        specs: [
          { id: "one", title: "Task one", instruction: "Do one" },
          { id: "two", title: "Task two", instruction: "Do two" },
        ],
        deps: deps(root),
        fleetDeps: {
          now: () => new Date("2026-06-18T00:00:00.000Z"),
          createWorktree: async (_repo, _prefix, baseDir) => ({ path: join(baseDir, `w${tasks.length}`), branch: `fleet/b${tasks.length}`, cleanup: async () => {} }),
          spawn: async ({ spec, deps: workerDeps }) => {
            expect(workerDeps.root).toContain(".vanta/worktrees");
            return { finalText: `done ${spec.id}`, iterations: 1, stoppedReason: "done", toolIterations: 0 };
          },
          diff: async (_repo, branch) => `${branch} changed`,
          appendTask: async (task) => { tasks.push(task); },
        },
      });
      expect(report.workers.map((w) => w.status)).toEqual(["done", "done"]);
      expect(report.workers[0]?.diff).toBe("fleet/b0 changed");
      expect(loadFleetReport(root, "fleet-test").workers).toHaveLength(2);
      expect(tasks.filter((t) => t.id.endsWith(":one")).map((t) => t.status)).toEqual(["assigned", "running", "done"]);
      expect(tasks.filter((t) => t.id.endsWith(":two")).map((t) => t.status)).toEqual(["assigned", "running", "done"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts one reviewed worker by merging and cleaning its saved worktree", async () => {
    const root = mkdtempSync(join(tmpdir(), "fleet-accept-"));
    const calls: string[] = [];
    try {
      await runFleet({
        repoRoot: root,
        fleetId: "fleet-accept",
        specs: [{ id: "one", title: "Task one", instruction: "Do one" }],
        deps: deps(root),
        fleetDeps: {
          createWorktree: async (_repo, _prefix, baseDir) => ({ path: join(baseDir, "w1"), branch: "fleet/b1", cleanup: async () => {} }),
          spawn: async () => ({ finalText: "done", iterations: 1, stoppedReason: "done", toolIterations: 0 }),
          diff: async () => "1 file changed",
          appendTask: async () => {},
        },
      });
      const next = await acceptFleetWorker({
        repoRoot: root,
        fleetId: "fleet-accept",
        workerId: "fleet-accept-one",
        deps: {
          merge: async (_repo, branch) => { calls.push(`merge:${branch}`); return { ok: true, message: "merged" }; },
          cleanup: async (_repo, path, branch) => { calls.push(`cleanup:${path}:${branch}`); },
        },
      });
      expect(next.workers[0]?.status).toBe("accepted");
      expect(calls).toEqual(["merge:fleet/b1", `${"cleanup"}:${join(root, ".vanta", "worktrees", "w1")}:fleet/b1`]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fires TeammateIdle after a fleet worker completes", async () => {
    const root = mkdtempSync(join(tmpdir(), "fleet-idle-"));
    const marker = join(root, "idle-hooked");
    try {
      mkdirSync(join(root, ".vanta"));
      writeFileSync(join(root, ".vanta", "hooks.json"), JSON.stringify({ TeammateIdle: [{ command: `touch ${marker}` }] }));
      await runFleet({
        repoRoot: root,
        fleetId: "fleet-idle",
        specs: [{ id: "one", title: "Task one", instruction: "Do one" }],
        deps: deps(root),
        fleetDeps: {
          createWorktree: async (_repo, _prefix, baseDir) => ({ path: join(baseDir, "w1"), branch: "fleet/b1", cleanup: async () => {} }),
          spawn: async () => ({ finalText: "done", iterations: 1, stoppedReason: "done", toolIterations: 0 }),
          diff: async () => "1 file changed",
          appendTask: async () => {},
        },
      });
      expect(existsSync(marker)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
