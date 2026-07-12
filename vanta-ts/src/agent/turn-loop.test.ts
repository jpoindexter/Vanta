import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTurn } from "./turn-loop.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "./agent-types.js";
import type { LLMProvider, CompletionResult, ToolSchema } from "../providers/interface.js";
import type { Message, ToolCall, Verdict } from "../types.js";
import type { Tool } from "../tools/types.js";
import { loadSession } from "../sessions/store.js";

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

describe("interrupted mutation recovery", () => {
  it("records an unknown effect, resumes with inspection guidance, and never retries blindly", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-effect-root-"));
    const home = await mkdtemp(join(tmpdir(), "vanta-effect-home-"));
    const previousHome = process.env.VANTA_HOME;
    process.env.VANTA_HOME = home;
    try {
      const marker = join(root, "published.txt");
      const execute = vi.fn(async () => {
        await writeFile(marker, "published", "utf8");
        throw new Error("transport dropped after publish");
      });
      const registry = new InMemoryToolRegistry();
      registry.register({
        schema: { name: "publish_release", description: "publish", parameters: { type: "object", properties: {} } },
        describeForSafety: () => "publish release",
        execute,
      });
      const seen: Message[][] = [];
      let turn = 0;
      const provider: LLMProvider = {
        modelId: () => "fake",
        contextWindow: () => 100_000,
        complete: vi.fn(async (messages): Promise<CompletionResult> => {
          seen.push(structuredClone(messages));
          turn++;
          return turn === 1
            ? { text: "", toolCalls: [{ id: "publish-1", name: "publish_release", arguments: { apiKey: "do-not-log" } }], finishReason: "tool_calls" }
            : { text: "I will inspect the published state before deciding whether to retry.", toolCalls: [], finishReason: "stop" };
        }),
      };
      const { safety } = spySafety();
      const messages: Message[] = [{ role: "system", content: "sys" }];

      const out = await runTurn({
        messages,
        ctx: { root, safety, requestApproval: async () => true },
        deps: { provider, safety, registry, root, sessionId: "effect-session", requestApproval: async () => true },
        userText: "publish it",
      });

      expect(out.stoppedReason).toBe("done");
      expect(execute).toHaveBeenCalledOnce();
      expect(await readFile(marker, "utf8")).toBe("published");
      const modelReceipt = seen[1]?.find((message) => message.role === "tool");
      expect(modelReceipt).toMatchObject({
        role: "tool",
        toolCallId: "publish-1",
        effectDisposition: "unknown",
      });
      expect(modelReceipt?.content).toMatch(/inspect current state before any retry/i);

      const journal = await readFile(join(root, ".vanta", "tool-effects.jsonl"), "utf8");
      const records = journal.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(records.map((record) => record.transition)).toEqual(["pending", "started", "settled"]);
      expect(records.at(-1)?.disposition).toBe("unknown");
      expect(journal).not.toContain("do-not-log");
      expect(journal).not.toContain("transport dropped");

      const restored = await loadSession("effect-session", { VANTA_HOME: home } as NodeJS.ProcessEnv);
      expect(restored?.messages.find((message) => message.role === "tool")).toMatchObject({
        effectDisposition: "unknown",
      });
    } finally {
      if (previousHome === undefined) delete process.env.VANTA_HOME;
      else process.env.VANTA_HOME = previousHome;
      await rm(root, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
  });
});
