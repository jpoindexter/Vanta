import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";
import { PluginCommandRegistry } from "../plugins/commands.js";
import type { KernelClient } from "../kernel/client.js";
import type { RunSetup } from "../session.js";
import { parseFleetTasks, runFleetCommand } from "./fleet-cmd.js";

class FakeProvider implements LLMProvider {
  async complete(): Promise<CompletionResult> {
    return { text: "unused", toolCalls: [], finishReason: "stop" };
  }
  modelId(): string { return "fake"; }
  contextWindow(): number { return 8192; }
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

function setup(root: string): RunSetup {
  return {
    provider: new FakeProvider(),
    safety: fakeKernel(),
    registry: new ToolRegistry(),
    pluginCommands: new PluginCommandRegistry(),
    effortLevel: "medium" as const,
    goals: [],
    systemPrompt: `root ${root}`,
  };
}

describe("fleet command", () => {
  it("parses repeated task flags into specs", () => {
    expect(parseFleetTasks(["--task", "Fix auth", "--task", "Add tests"]).map((t) => t.id)).toEqual(["1-fix-auth", "2-add-tests"]);
  });

  it("runs a fleet and can print the latest review", async () => {
    const root = mkdtempSync(join(tmpdir(), "fleet-cmd-"));
    const lines: string[] = [];
    try {
      const code = await runFleetCommand(root, ["run", "--task", "Fix auth"], {
        log: (line) => lines.push(line),
        prepare: async () => setup(root),
        fleetDeps: {
          createWorktree: async (_repo, _prefix, baseDir) => ({ path: join(baseDir, "w1"), branch: "fleet/b1", cleanup: async () => {} }),
          spawn: async () => ({ finalText: "done", iterations: 1, stoppedReason: "done", toolIterations: 0 }),
          diff: async () => "1 file changed",
          appendTask: async () => {},
          now: () => new Date("2026-06-18T00:00:00.000Z"),
        },
      });
      expect(code).toBe(0);
      expect(lines.join("\n")).toContain("fleet fleet-2026-06-18T00-00-00-000Z");
      expect(lines.join("\n")).toContain("fleet digest fleet-2026-06-18T00-00-00-000Z");
      expect(lines.join("\n")).toContain("Needs operator decision");
      const review = await runFleetCommand(root, ["review"], { log: (line) => lines.push(line) });
      expect(review).toBe(0);
      expect(lines.join("\n")).toContain("diff 1 file changed");
      const digest = await runFleetCommand(root, ["digest"], { log: (line) => lines.push(line) });
      expect(digest).toBe(0);
      expect(lines.join("\n")).toContain("accept or reject fleet-2026-06-18T00-00-00-000Z-1-fix-auth");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
