import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import { PluginCommandRegistry } from "../plugins/commands.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";
import type { KernelClient } from "../kernel/client.js";
import type { RunSetup } from "../session.js";
import { parseAutoResearchArgs, runAutoResearchCommand } from "./auto-research-cmd.js";

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

function setup(): RunSetup {
  return {
    provider: new FakeProvider(),
    safety: kernel(),
    registry: new ToolRegistry(),
    pluginCommands: new PluginCommandRegistry(),
    effortLevel: "medium",
    goals: [],
    systemPrompt: "system",
  };
}

describe("auto-research command", () => {
  it("parses required flags and optional iteration bounds", () => {
    const parsed = parseAutoResearchArgs([
      "--objective", "Improve score",
      "--metric", "npm run score",
      "--bounds", "tests only",
      "--iters", "4",
    ]);
    expect(parsed.maxIters).toBe(4);
    expect(parsed.objective).toBe("Improve score");
  });

  it("runs the injected loop and prints the final report", async () => {
    const lines: string[] = [];
    const code = await runAutoResearchCommand("/repo", [
      "--objective", "Improve score",
      "--metric", "score",
      "--bounds", "small",
      "--iters", "1",
    ], {
      log: (line) => lines.push(line),
      prepare: async () => setup(),
      hooks: {
        metric: async (_cmd, cwd) => ({ score: cwd === "/repo" ? 1 : 2, output: "score" }),
        createWorktree: async () => ({ path: "/work", branch: "branch", cleanup: async () => {} }),
        spawn: async () => ({ finalText: "done", iterations: 1, stoppedReason: "done", toolIterations: 0 }),
        commit: async () => ({ sha: "c1", summary: "1 file changed" }),
        merge: async () => ({ ok: true, message: "merged" }),
        cleanup: async () => {},
        journal: () => {},
      },
    });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("baseline 1 -> final 2");
  });
});
