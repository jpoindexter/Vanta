import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "../agent.js";
import type { KernelClient } from "../kernel/client.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";
import { runAutoResearch } from "./loop.js";

class FakeProvider implements LLMProvider {
  async complete(): Promise<CompletionResult> {
    return { text: "unused", toolCalls: [], finishReason: "stop" };
  }
  modelId(): string { return "fake"; }
  contextWindow(): number { return 8192; }
}

function kernel(): KernelClient {
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

function deps(root: string): AgentDeps {
  return {
    provider: new FakeProvider(),
    safety: kernel(),
    registry: new ToolRegistry(),
    root,
    requestApproval: async () => true,
  };
}

describe("runAutoResearch", () => {
  it("merges only metric-improving candidate commits and journals each delta", async () => {
    const merged: string[] = [];
    const cleaned: string[] = [];
    const journaled: string[] = [];
    const scores = [10, 9, 12];
    const report = await runAutoResearch({
      repoRoot: "/repo",
      deps: deps("/repo"),
      opts: { objective: "raise score", metric: "score", bounds: "stay small", maxIters: 2, stopAfterNoProgress: 2 },
      hooks: {
        metric: async (_cmd, cwd) => ({ score: cwd === "/repo" ? scores.shift()! : scores.shift()!, output: "score" }),
        createWorktree: async (_repo, _prefix, _base) => ({ path: `/work-${scores.length}`, branch: `branch-${scores.length}`, cleanup: async () => {} }),
        spawn: async ({ deps }) => {
          expect(deps.root).toMatch(/^\/work-/);
          return { finalText: "changed", iterations: 1, stoppedReason: "done", toolIterations: 0 };
        },
        commit: async (_cwd, _message) => ({ sha: `c${scores.length}`, summary: "1 file changed" }),
        merge: async (_repo, branch) => { merged.push(branch); return { ok: true, message: "merged" }; },
        cleanup: async (_repo, _path, branch) => { cleaned.push(branch); },
        journal: (it) => { journaled.push(`${it.iter}:${it.delta}:${it.kept}`); },
      },
    });
    expect(report.baseline).toBe(10);
    expect(report.final).toBe(12);
    expect(report.iterations.map((it) => it.kept)).toEqual([false, true]);
    expect(merged).toEqual(["branch-1"]);
    expect(cleaned).toEqual(["branch-2", "branch-1"]);
    expect(journaled).toEqual(["1:-1:false", "2:2:true"]);
  });

  it("stops after the configured no-progress count", async () => {
    const report = await runAutoResearch({
      repoRoot: "/repo",
      deps: deps("/repo"),
      opts: { objective: "raise score", metric: "score", bounds: "stay small", maxIters: 5, stopAfterNoProgress: 1 },
      hooks: {
        metric: async (_cmd, cwd) => ({ score: cwd === "/repo" ? 5 : 5, output: "score" }),
        createWorktree: async () => ({ path: "/work", branch: "branch", cleanup: async () => {} }),
        spawn: async () => ({ finalText: "same", iterations: 1, stoppedReason: "done", toolIterations: 0 }),
        commit: async () => ({ sha: "c1", summary: "1 file changed" }),
        cleanup: async () => {},
        journal: () => {},
      },
    });
    expect(report.iterations).toHaveLength(1);
    expect(report.stoppedReason).toBe("no-progress");
  });
});
