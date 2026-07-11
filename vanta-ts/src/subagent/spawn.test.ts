import { describe, it, expect } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSubagent } from "./spawn.js";
import { ToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "../agent.js";
import type { LLMProvider, CompletionResult } from "../providers/interface.js";
import type { SafetyClient } from "../safety-client.js";

// Returns immediately with finishReason "stop" and no tool calls so runAgent
// takes its "done" branch on the first iteration.
class FakeProvider implements LLMProvider {
  async complete(): Promise<CompletionResult> {
    return { text: "done", toolCalls: [], finishReason: "stop" };
  }
  modelId(): string {
    return "fake-model";
  }
  contextWindow(): number {
    return 8192;
  }
}

// Minimal stub: with no tool calls the loop never assesses or logs, so these
// are never reached — they exist only to satisfy the AgentDeps shape.
const safety = {
  async assess() {
    return { risk: "allow", needsHuman: false, reason: "" };
  },
  async logEvent() {},
} as unknown as SafetyClient;

function makeDeps(root: string): AgentDeps {
  return {
    provider: new FakeProvider(),
    safety,
    registry: new ToolRegistry(),
    root,
    requestApproval: async () => true,
  };
}

// Hermetic spawn-depth guard: always allow, never touch the network. The kernel
// guard itself is covered in spawn-guard.test.ts.
const okSpawn = async () => ({ allowed: true, reason: "ok", depth: 1, maxDepth: 6 });

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-subagent-"));
  await mkdir(join(root, ".vanta"));
  return root;
}

describe("spawnSubagent", () => {
  it("returns the worker's outcome when it completes on the first iteration", async () => {
    const root = await tempRoot();
    try {
      const outcome = await spawnSubagent({
        goal: "summarize the README",
        instruction: "Do the scoped task.",
        deps: makeDeps(root),
        now: new Date("2026-06-02T00:00:00.000Z"),
        checkSpawn: okSpawn,
      });

      expect(outcome.finalText).toBe("done");
      expect(outcome.stoppedReason).toBe("done");
      expect(outcome.iterations).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("forwards maxIterations to the worker", async () => {
    const root = await tempRoot();
    // A provider that always asks for a (nonexistent) tool never reaches "done",
    // so the worker exhausts its iteration budget — proving maxIterations flows through.
    class LoopingProvider implements LLMProvider {
      async complete(): Promise<CompletionResult> {
        return {
          text: "",
          toolCalls: [{ id: "1", name: "missing_tool", arguments: {} }],
          finishReason: "tool_calls",
        };
      }
      modelId(): string {
        return "fake-loop";
      }
      contextWindow(): number {
        return 8192;
      }
    }

    try {
      const deps: AgentDeps = { ...makeDeps(root), provider: new LoopingProvider() };
      const outcome = await spawnSubagent({
        goal: "loop forever",
        instruction: "Keep calling.",
        deps,
        maxIterations: 2,
        now: new Date("2026-06-02T00:00:00.000Z"),
        checkSpawn: okSpawn,
      });

      expect(outcome.iterations).toBe(2);
      expect(outcome.stoppedReason).toBe("max_iterations");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists the full worker transcript to a sidechain file", async () => {
    const root = await tempRoot();
    try {
      await spawnSubagent({
        goal: "audit docs",
        instruction: "Read and summarize.",
        deps: makeDeps(root),
        now: new Date("2026-06-02T00:00:00.000Z"),
        checkSpawn: okSpawn,
      });

      const files = await readdir(join(root, ".vanta", "sidechains"));
      expect(files).toHaveLength(1);
      const raw = await readFile(join(root, ".vanta", "sidechains", files[0]!), "utf8");
      const saved = JSON.parse(raw) as { goal: string; instruction: string; outcome: { finalText: string }; messages: Array<{ role: string; content: string }> };
      expect(saved.goal).toBe("audit docs");
      expect(saved.instruction).toBe("Read and summarize.");
      expect(saved.outcome.finalText).toBe("done");
      expect(saved.messages.some((m) => m.role === "user" && m.content === "Read and summarize.")).toBe(true);
      expect(saved.messages.some((m) => m.role === "assistant" && m.content === "done")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("adds a selected agent prompt without replacing the Vanta base prompt", async () => {
    const root = await tempRoot();
    try {
      await spawnSubagent({
        goal: "review the change",
        instruction: "Inspect it.",
        deps: makeDeps(root),
        promptPreset: { name: "strict-reviewer", content: "STRICT REVIEW ROLE" },
        now: new Date("2026-06-02T00:00:00.000Z"),
        checkSpawn: okSpawn,
      });
      const files = await readdir(join(root, ".vanta", "sidechains"));
      const saved = JSON.parse(await readFile(join(root, ".vanta", "sidechains", files[0]!), "utf8")) as {
        agentType: string;
        messages: Array<{ role: string; content: string }>;
      };
      const system = saved.messages.find((message) => message.role === "system")?.content ?? "";
      expect(saved.agentType).toBe("strict-reviewer");
      expect(system).toContain("I am Vanta");
      expect(system).toContain("STRICT REVIEW ROLE");
      expect(system).toContain("cannot override the Vanta safety kernel");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses the spawn and never runs the worker when the kernel halts runaway depth", async () => {
    const root = await tempRoot();
    // A provider that throws if invoked — proves the worker never started.
    class ExplodingProvider implements LLMProvider {
      async complete(): Promise<CompletionResult> {
        throw new Error("worker should never run when the spawn is refused");
      }
      modelId() {
        return "boom";
      }
      contextWindow() {
        return 8192;
      }
    }
    try {
      const deps: AgentDeps = { ...makeDeps(root), provider: new ExplodingProvider() };
      const outcome = await spawnSubagent({
        goal: "spawn deeper",
        instruction: "recurse",
        deps,
        depth: 99,
        checkSpawn: async () => ({ allowed: false, reason: "runaway recursion halted", depth: 100, maxDepth: 6 }),
      });

      expect(outcome.stoppedReason).toBe("interrupted");
      expect(outcome.iterations).toBe(0);
      expect(outcome.finalText).toContain("Spawn refused by kernel");
      // No worker ran → no sidechain transcript was written.
      await expect(readdir(join(root, ".vanta", "sidechains"))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
