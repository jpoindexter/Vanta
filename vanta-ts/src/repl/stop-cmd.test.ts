import { describe, it, expect } from "vitest";
import {
  buildStopSummary,
  buildStopHandler,
  createSoftStopSignal,
  consumeSoftStop,
  softStopPredicate,
  stop,
  SOFT_STOP,
} from "./stop-cmd.js";
import type { ReplCtx } from "./types.js";
import { runTurn } from "../agent/turn-loop.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { Tool, ToolContext } from "../tools/types.js";
import type { KernelClient } from "../kernel/client.js";
import type { LLMProvider, CompletionResult } from "../providers/interface.js";
import type { AgentDeps } from "../agent/agent-types.js";

// --- Pure summary builder -------------------------------------------------

describe("buildStopSummary", () => {
  it("notes when no tool ran yet", () => {
    expect(buildStopSummary([])).toBe("Soft-stopped before any tool ran.");
  });

  it("summarizes a single completed tool call (singular)", () => {
    expect(buildStopSummary(["read_file"])).toBe(
      "Soft-stopped after the in-flight tool finished. Completed 1 tool call: read_file.",
    );
  });

  it("counts all calls but dedupes names in first-seen order (plural)", () => {
    expect(buildStopSummary(["read_file", "shell_cmd", "read_file"])).toBe(
      "Soft-stopped after the in-flight tool finished. Completed 3 tool calls: read_file, shell_cmd.",
    );
  });
});

// --- Signal helpers -------------------------------------------------------

describe("soft-stop signal", () => {
  it("starts un-requested", () => {
    expect(createSoftStopSignal().requested).toBe(false);
  });

  it("softStopPredicate reflects the live signal", () => {
    const sig = createSoftStopSignal();
    const pred = softStopPredicate(sig);
    expect(pred()).toBe(false);
    sig.requested = true;
    expect(pred()).toBe(true);
  });

  it("consumeSoftStop is one-shot (reads and clears)", () => {
    const sig = createSoftStopSignal();
    sig.requested = true;
    expect(consumeSoftStop(sig)).toBe(true);
    expect(sig.requested).toBe(false);
    expect(consumeSoftStop(sig)).toBe(false);
  });
});

// --- The /stop handler ----------------------------------------------------

describe("/stop handler", () => {
  it("sets the bound signal and confirms", async () => {
    const sig = createSoftStopSignal();
    const handler = buildStopHandler(sig);
    const res = await handler("", {} as unknown as ReplCtx);
    expect(sig.requested).toBe(true);
    expect(res.output).toContain("soft-stop requested");
  });

  it("the registered handler writes the shared module signal", async () => {
    SOFT_STOP.requested = false;
    await stop("", {} as unknown as ReplCtx);
    expect(SOFT_STOP.requested).toBe(true);
    SOFT_STOP.requested = false; // clean up shared state for other tests
  });
});

// --- The agent loop honours the predicate at the post-tool boundary -------

/** A kernel client stub that always allows — no live kernel needed. */
const allowSafety: KernelClient = {
  status: async () => true,
  assess: async () => ({ risk: "allow", needsHuman: false, reason: "ok" }),
  getGoals: async () => [],
  addGoal: async () => true,
  completeGoal: async () => true,
  getApprovals: async () => [],
  proposeApproval: async () => null,
  approve: async () => {},
  deny: async () => {},
  logEvent: async () => {},
};

/** A counting tool whose exec count is observable from the test. */
function countingTool(counter: { calls: number }): Tool {
  return {
    schema: { name: "ping", description: "increments a counter", parameters: { type: "object", properties: {} } },
    describeForSafety: () => "ping (no side effects)",
    execute: async () => {
      counter.calls++;
      return { ok: true, output: `pong ${counter.calls}` };
    },
  };
}

/** A provider that records how many times it was asked to complete. */
class ScriptedProvider implements LLMProvider {
  public completeCalls = 0;
  private index = 0;
  constructor(private readonly turns: CompletionResult[]) {}
  async complete(): Promise<CompletionResult> {
    this.completeCalls++;
    return this.turns[this.index++] ?? { text: "fallback", toolCalls: [], finishReason: "stop" };
  }
  modelId(): string {
    return "scripted";
  }
  contextWindow(): number {
    return 100_000;
  }
}

const toolTurn = (): CompletionResult => ({
  text: "",
  toolCalls: [{ id: `c${Math.random()}`, name: "ping", arguments: {} }],
  finishReason: "tool_calls",
});

function buildDeps(provider: ScriptedProvider, registry: InMemoryToolRegistry, extra: Partial<AgentDeps>): AgentDeps {
  return {
    provider,
    safety: allowSafety,
    registry,
    root: process.cwd(),
    requestApproval: async () => true,
    ...extra,
  };
}

describe("runTurn soft-stop boundary", () => {
  it("with a predicate true after one tool call, stops cleanly after that call and does NOT start the next iteration", async () => {
    const counter = { calls: 0 };
    const registry = new InMemoryToolRegistry();
    registry.register(countingTool(counter));
    // The provider would loop forever (always a tool call) without the soft-stop.
    const provider = new ScriptedProvider([toolTurn(), toolTurn(), toolTurn()]);
    // Predicate flips true once the tool has executed at least once.
    const deps = buildDeps(provider, registry, { shouldSoftStop: () => counter.calls >= 1 });
    const ctx: ToolContext = { root: deps.root, safety: deps.safety, requestApproval: deps.requestApproval };

    const outcome = await runTurn({ messages: [{ role: "system", content: "sys" }], ctx, deps, userText: "go" });

    expect(counter.calls).toBe(1); // the in-flight call finished; no second call started
    expect(provider.completeCalls).toBe(1); // only the first completion ran; no next-iteration request
    expect(outcome.stoppedReason).toBe("soft_stopped");
    expect(outcome.finalText).toContain("Soft-stopped after the in-flight tool finished");
    expect(outcome.finalText).toContain("ping");
  });

  it("with NO predicate, the loop runs to completion exactly as before (byte-identical control flow)", async () => {
    const counter = { calls: 0 };
    const registry = new InMemoryToolRegistry();
    registry.register(countingTool(counter));
    // One tool call, then a final text turn → DONE.
    const provider = new ScriptedProvider([toolTurn(), { text: "all done", toolCalls: [], finishReason: "stop" }]);
    const deps = buildDeps(provider, registry, {}); // shouldSoftStop absent
    const ctx: ToolContext = { root: deps.root, safety: deps.safety, requestApproval: deps.requestApproval };

    const outcome = await runTurn({ messages: [{ role: "system", content: "sys" }], ctx, deps, userText: "go" });

    expect(counter.calls).toBe(1);
    expect(provider.completeCalls).toBe(2); // tool turn + final text turn
    expect(outcome.stoppedReason).toBe("done");
    expect(outcome.finalText).toBe("all done");
  });

  it("a predicate that stays false never short-circuits the loop", async () => {
    const counter = { calls: 0 };
    const registry = new InMemoryToolRegistry();
    registry.register(countingTool(counter));
    const provider = new ScriptedProvider([toolTurn(), { text: "finished", toolCalls: [], finishReason: "stop" }]);
    const deps = buildDeps(provider, registry, { shouldSoftStop: () => false });
    const ctx: ToolContext = { root: deps.root, safety: deps.safety, requestApproval: deps.requestApproval };

    const outcome = await runTurn({ messages: [{ role: "system", content: "sys" }], ctx, deps, userText: "go" });

    expect(outcome.stoppedReason).toBe("done");
    expect(provider.completeCalls).toBe(2);
  });
});
