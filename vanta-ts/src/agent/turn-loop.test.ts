import { describe, expect, it, vi } from "vitest";
import { runTurn } from "./turn-loop.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "./agent-types.js";
import type { LLMProvider, CompletionResult, ToolSchema } from "../providers/interface.js";
import type { Message, ToolCall, Verdict } from "../types.js";
import type { Tool } from "../tools/types.js";

function history(): Message[] {
  return [
    { role: "system", content: "sys" },
    ...Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `older message ${i} ${"x".repeat(120)}`,
    })),
  ];
}

function deps(provider: LLMProvider, summarize = vi.fn(async () => "compressed after error")): AgentDeps {
  return {
    provider,
    safety: {} as AgentDeps["safety"],
    registry: new InMemoryToolRegistry(),
    root: "/tmp",
    requestApproval: async () => true,
    summarize,
  };
}

describe("context-length retry", () => {
  it("compacts and retries one context-length provider failure", async () => {
    const seen: Message[][] = [];
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 5_000,
      complete: vi.fn(async (messages: Message[], _tools: ToolSchema[]): Promise<CompletionResult> => {
        seen.push(messages);
        if (seen.length === 1) throw new Error("maximum context length exceeded");
        return { text: "recovered", toolCalls: [], finishReason: "stop" };
      }),
    };
    const summarize = vi.fn(async () => "compressed after error");

    const out = await runTurn({
      messages: history(),
      ctx: { root: "/tmp", safety: {} as AgentDeps["safety"], requestApproval: async () => true },
      deps: deps(provider, summarize),
      userText: "continue",
    });

    expect(out.finalText).toBe("recovered");
    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(summarize).toHaveBeenCalledOnce();
    expect(seen[1]?.some((m) => m.content.includes("compressed after error"))).toBe(true);
  });

  it("returns a clean error when the compacted retry still exceeds context", async () => {
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 5_000,
      complete: vi.fn(async () => {
        throw new Error("context window exceeded");
      }),
    };

    const out = await runTurn({
      messages: history(),
      ctx: { root: "/tmp", safety: {} as AgentDeps["safety"], requestApproval: async () => true },
      deps: deps(provider),
      userText: "continue",
    });

    expect(provider.complete).toHaveBeenCalledTimes(2);
    expect(out.stoppedReason).toBe("repeated_failure");
    expect(out.finalText).toContain("one compaction retry");
  });
});

describe("specialized tool-use contract", () => {
  it("retries one text-only workflow draft and validates through compose_workflow", async () => {
    const registry = new InMemoryToolRegistry();
    registry.register({
      schema: { name: "compose_workflow", description: "validate workflow", parameters: { type: "object", properties: {} } },
      execute: async () => ({ ok: true, output: "workflow valid" }),
    });
    const seen: Message[][] = [];
    let turn = 0;
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      complete: vi.fn(async (messages): Promise<CompletionResult> => {
        seen.push(messages);
        turn++;
        if (turn === 1) return { text: "Here is an unvalidated draft", toolCalls: [], finishReason: "stop" };
        if (turn === 2) return { text: "", toolCalls: [{ id: "wf", name: "compose_workflow", arguments: { mode: "validate", spec: {} } }], finishReason: "tool_calls" };
        return { text: "Validated workflow draft", toolCalls: [], finishReason: "stop" };
      }),
    };
    const { safety } = spySafety();
    const out = await runTurn({
      messages: [{ role: "system", content: "sys" }],
      ctx: { root: "/tmp", safety, requestApproval: async () => true },
      deps: { provider, safety, registry, root: "/tmp", requestApproval: async () => true },
      userText: "Draft a Kubernetes briefing workflow for review",
    });

    expect(out.finalText).toBe("Validated workflow draft");
    expect(out.toolIterations).toBe(1);
    expect(seen[1]?.at(-1)?.content).toMatch(/compose_workflow.*validate/i);
  });
});

// A tool whose output is a secret-shaped string. describeForSafety returns a
// benign, kernel-allowable string (never the output) so the gate approves.
function secretLeakTool(secret: string): Tool {
  return {
    schema: { name: "read_secret", description: "reads a value", parameters: { type: "object", properties: {} } },
    describeForSafety: () => "read_secret",
    execute: async () => ({ ok: true, output: secret }),
  };
}

// Minimal kernel client: allow everything, spy on logEvent. No HTTP/real kernel.
function spySafety(): { safety: AgentDeps["safety"]; logEvent: ReturnType<typeof vi.fn> } {
  const logEvent = vi.fn(async () => {});
  const safety = {
    assess: async (): Promise<Verdict> => ({ risk: "allow", needsHuman: false, reason: "ok" }),
    logEvent,
  } as unknown as AgentDeps["safety"];
  return { safety, logEvent };
}

describe("tool-output logging redaction", () => {
  it("logs only status + length, never the raw tool output", async () => {
    // A google-api-key-shaped value that the secret scanner would flag.
    const secret = "AIza" + "Z".repeat(35);
    const registry = new InMemoryToolRegistry();
    registry.register(secretLeakTool(secret));
    const call: ToolCall = { id: "c1", name: "read_secret", arguments: {} };
    let turn = 0;
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      complete: vi.fn(async (): Promise<CompletionResult> => {
        turn++;
        return turn === 1
          ? { text: "", toolCalls: [call], finishReason: "tool_calls" }
          : { text: "done", toolCalls: [], finishReason: "stop" };
      }),
    };
    const { safety, logEvent } = spySafety();
    const out = await runTurn({
      messages: [{ role: "system", content: "sys" }],
      ctx: { root: "/tmp", safety, requestApproval: async () => true },
      deps: { provider, safety, registry, root: "/tmp", requestApproval: async () => true },
      userText: "read it",
    });

    expect(out.finalText).toBe("done");
    // PAPER-GOVERNANCE-AUDIT adds one gate-audit log call ahead of the existing
    // post-execution status line — 2 total, neither carrying the secret.
    expect(logEvent).toHaveBeenCalledTimes(2);
    const [gateLine, resultLine] = logEvent.mock.calls.map((c) => c[0] as string);
    expect(gateLine).not.toContain(secret);
    expect(resultLine).not.toContain(secret);
    // The gate-audit line only ever carries describeForSafety's output (args, never
    // tool output) — proven here by the constant "read_secret" action string.
    expect(JSON.parse(gateLine!)).toMatchObject({ kind: "gate", tool: "read_secret", risk: "allow", resolution: "allow" });
    // …and the post-execution line is the status + char-count marker.
    expect(resultLine).toBe(`read_secret: ok (${secret.length} chars)`);
  });
});

describe("tool-output logging is best-effort", () => {
  it("does not throw the turn when logEvent rejects", async () => {
    const registry = new InMemoryToolRegistry();
    registry.register(secretLeakTool("plain output"));
    const call: ToolCall = { id: "c1", name: "read_secret", arguments: {} };
    let turn = 0;
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      complete: vi.fn(async (): Promise<CompletionResult> => {
        turn++;
        return turn === 1
          ? { text: "", toolCalls: [call], finishReason: "tool_calls" }
          : { text: "done", toolCalls: [], finishReason: "stop" };
      }),
    };
    const safety = {
      assess: async (): Promise<Verdict> => ({ risk: "allow", needsHuman: false, reason: "ok" }),
      logEvent: vi.fn(async () => { throw new Error("kernel log down"); }),
    } as unknown as AgentDeps["safety"];
    const out = await runTurn({
      messages: [{ role: "system", content: "sys" }],
      ctx: { root: "/tmp", safety, requestApproval: async () => true },
      deps: { provider, safety, registry, root: "/tmp", requestApproval: async () => true },
      userText: "read it",
    });
    expect(out.finalText).toBe("done");
  });
});
