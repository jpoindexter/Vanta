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
import { CORRECTION_TOOL_BUDGET, DEFAULT_TOOL_BUDGET } from "./tool-budget.js";

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

describe("automatic executive support", () => {
  it("injects activation support privately on the first provider call", async () => {
    const seen: Message[][] = [];
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      complete: vi.fn(async (messages): Promise<CompletionResult> => {
        seen.push(messages);
        return { text: "Starting with one safe step.", toolCalls: [], finishReason: "stop" };
      }),
    };
    const transcript: Message[] = [{ role: "system", content: "sys" }];
    await runTurn({
      messages: transcript,
      ctx: { root: "/tmp", safety: {} as AgentDeps["safety"], requestApproval: async () => true },
      deps: deps(provider),
      userText: "I'm stuck and can't start",
    });

    expect(seen[0]?.some((message) => message.role === "system" && message.content.includes("VANTA AUTOMATIC SUPPORT"))).toBe(true);
    expect(transcript.filter((message) => message.role === "system")).toHaveLength(1);
  });

  it("self-redirects a research-only loop before continuing an action task", async () => {
    const registry = new InMemoryToolRegistry();
    registry.register({
      schema: { name: "read_file", description: "read", parameters: { type: "object", properties: {} } },
      describeForSafety: (args) => `read ${String(args.path)}`,
      execute: async (args) => ({ ok: true, output: `contents of ${String(args.path)}` }),
    });
    const seen: Message[][] = [];
    let call = 0;
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      complete: vi.fn(async (messages): Promise<CompletionResult> => {
        seen.push(messages);
        call++;
        if (call === 1) {
          return {
            text: "",
            toolCalls: Array.from({ length: 6 }, (_, index) => ({
              id: `read-${index}`,
              name: "read_file",
              arguments: { path: `file-${index}.ts` },
            })),
            finishReason: "tool_calls",
          };
        }
        return { text: "I stopped researching and made the smallest useful fix.", toolCalls: [], finishReason: "stop" };
      }),
    };
    const { safety } = spySafety();
    const transcript: Message[] = [{ role: "system", content: "sys" }];
    const outcome = await runTurn({
      messages: transcript,
      ctx: { root: "/tmp", safety, requestApproval: async () => true },
      deps: { provider, safety, registry, root: "/tmp", requestApproval: async () => true },
      userText: "Fix the broken setup flow",
    });

    expect(outcome.finalText).toContain("smallest useful fix");
    expect(seen[1]?.some((message) => message.role === "system" && message.content.includes("VANTA SELF-REDIRECT"))).toBe(true);
    expect(transcript.some((message) => message.content.includes("VANTA SELF-REDIRECT"))).toBe(false);
  });
});

describe("task completion boundaries", () => {
  function productiveBatch(): ToolCall[] {
    return Array.from({ length: 10 }, (_, index) => ({
      id: `inspect-${index}`,
      name: "inspect_item",
      arguments: { index },
    }));
  }

  function completionDeps(permissionMode: "default" | "auto") {
    const registry = new InMemoryToolRegistry();
    registry.register({
      schema: { name: "inspect_item", description: "inspect", parameters: { type: "object", properties: {} } },
      describeForSafety: (args) => `inspect item ${String(args.index)}`,
      execute: async (args) => ({ ok: true, output: `item ${String(args.index)} checked` }),
    });
    const { safety } = spySafety();
    return {
      registry,
      safety,
      deps: {
        provider: {} as LLMProvider,
        safety,
        registry,
        root: "/tmp",
        permissionMode: () => permissionMode,
        requestApproval: async () => true,
      } satisfies AgentDeps,
    };
  }

  it("keeps the turn alive past the generic nudge cap until the live checklist closes", async () => {
    const registry = new InMemoryToolRegistry();
    registry.register({
      schema: { name: "todo", description: "todo", parameters: { type: "object", properties: {} } },
      describeForSafety: () => "todo",
      execute: async () => ({ ok: true, output: "todo ok" }),
    });
    const { safety } = spySafety();
    let call = 0;
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      complete: vi.fn(async (): Promise<CompletionResult> => {
        call++;
        if (call === 1) {
          return {
            text: "",
            toolCalls: [{
              id: "plan-open",
              name: "todo",
              arguments: {
                action: "write",
                items: [{ text: "Finish the requested task", status: "in_progress" }],
              },
            }],
            finishReason: "tool_calls",
          };
        }
        if (call <= 5) {
          return { text: "Here are the current results.", toolCalls: [], finishReason: "stop" };
        }
        if (call === 6) {
          return {
            text: "",
            toolCalls: [{
              id: "plan-closed",
              name: "todo",
              arguments: {
                action: "write",
                items: [{ text: "Finish the requested task", status: "done" }],
              },
            }],
            finishReason: "tool_calls",
          };
        }
        return { text: "The requested task is complete.", toolCalls: [], finishReason: "stop" };
      }),
    };

    const out = await runTurn({
      messages: [{ role: "system", content: "sys" }],
      ctx: { root: "/tmp", safety, requestApproval: async () => true },
      deps: { provider, safety, registry, root: "/tmp", requestApproval: async () => true },
      userText: "Finish the requested task.",
    });

    expect(provider.complete).toHaveBeenCalledTimes(7);
    expect(out.stoppedReason).toBe("done");
    expect(out.finalText).toBe("The requested task is complete.");
  });

  it("lets Auto mode finish a corrected task past the manual correction leash", async () => {
    const fixture = completionDeps("auto");
    let call = 0;
    fixture.deps.provider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      complete: vi.fn(async (): Promise<CompletionResult> => {
        call++;
        if (call === 1) return { text: "", toolCalls: productiveBatch(), finishReason: "tool_calls" };
        return { text: "Updated and verified the dashboard.", toolCalls: [], finishReason: "stop" };
      }),
    };

    const out = await runTurn({
      messages: [{ role: "system", content: "sys" }],
      ctx: { root: "/tmp", safety: fixture.safety, requestApproval: async () => true, permissionMode: () => "auto" },
      deps: fixture.deps,
      userText: "You didn't finish; update every stale job now.",
    });

    expect(out.stoppedReason).toBe("done");
    expect(out.toolIterations).toBe(10);
    expect(out.finalText).toContain("Updated and verified");
  }, 60_000);

  it("uses the finish reserve before recording an explicitly lowered hard-stop receipt", async () => {
    const previousBudget = process.env.VANTA_TOOL_BUDGET;
    const previousReserve = process.env.VANTA_TOOL_CLOSURE_RESERVE;
    process.env.VANTA_TOOL_BUDGET = "20";
    process.env.VANTA_TOOL_CLOSURE_RESERVE = "10";
    const fixture = completionDeps("default");
    const seen: Message[][] = [];
    fixture.deps.provider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      complete: vi.fn(async (providerMessages): Promise<CompletionResult> => {
        seen.push(structuredClone(providerMessages));
        return { text: "", toolCalls: productiveBatch(), finishReason: "tool_calls" };
      }),
    };
    const messages: Message[] = [{ role: "system", content: "sys" }];

    try {
      const out = await runTurn({
        messages,
        ctx: { root: "/tmp", safety: fixture.safety, requestApproval: async () => true, permissionMode: () => "default" },
        deps: fixture.deps,
        userText: "You didn't finish; update every stale job now.",
      });

      expect(out.stoppedReason).toBe("tool_budget");
      expect(out.toolIterations).toBe(20);
      expect(out.finalText).toContain("hard safety limit");
      expect(seen[1]?.some((message) => message.role === "system" && message.content.includes("VANTA TOOL-BUDGET CLOSURE"))).toBe(true);
      expect(messages.at(-1)).toMatchObject({ role: "assistant", content: out.finalText });
    } finally {
      if (previousBudget === undefined) delete process.env.VANTA_TOOL_BUDGET;
      else process.env.VANTA_TOOL_BUDGET = previousBudget;
      if (previousReserve === undefined) delete process.env.VANTA_TOOL_CLOSURE_RESERVE;
      else process.env.VANTA_TOOL_CLOSURE_RESERVE = previousReserve;
    }
  }, 60_000);

  it("honors an explicitly lowered acquisition threshold, finishes open tasks, and does not ask the operator to resume", async () => {
    const previousBudget = process.env.VANTA_TOOL_BUDGET;
    const previousReserve = process.env.VANTA_TOOL_CLOSURE_RESERVE;
    process.env.VANTA_TOOL_BUDGET = "40";
    process.env.VANTA_TOOL_CLOSURE_RESERVE = "10";
    const registry = new InMemoryToolRegistry();
    let searchExecutions = 0;
    registry.register({
      schema: { name: "web_search", description: "web_search", parameters: { type: "object", properties: {} } },
      describeForSafety: () => "web_search",
      execute: async () => {
        searchExecutions++;
        return { ok: true, output: "web_search ok" };
      },
    });
    registry.register({
      schema: { name: "todo", description: "todo", parameters: { type: "object", properties: {} } },
      describeForSafety: () => "todo",
      execute: async () => ({ ok: true, output: "todo ok" }),
    });
    const { safety } = spySafety();
    const seen: Array<{ messages: Message[]; tools: string[] }> = [];
    let call = 0;
    const searches = (offset: number, count: number): ToolCall[] =>
      Array.from({ length: count }, (_, index) => ({
        id: `search-${offset + index}`,
        name: "web_search",
        arguments: { query: `role ${offset + index}` },
      }));
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      complete: vi.fn(async (providerMessages, tools): Promise<CompletionResult> => {
        seen.push({ messages: structuredClone(providerMessages), tools: tools.map((tool: ToolSchema) => tool.name) });
        call++;
        if (call === 1) {
          return {
            text: "",
            toolCalls: [
              {
                id: "plan-open",
                name: "todo",
                arguments: {
                  action: "write",
                  items: [
                    { text: "Check filters", status: "in_progress" },
                    { text: "Rank leads", status: "pending" },
                  ],
                },
              },
              ...searches(0, 9),
            ],
            finishReason: "tool_calls",
          };
        }
        if (call === 2) return { text: "", toolCalls: searches(9, 10), finishReason: "tool_calls" };
        if (call === 3) return { text: "", toolCalls: searches(19, 10), finishReason: "tool_calls" };
        if (call === 4) {
          return {
            text: "",
            toolCalls: [
              { id: "late-search", name: "web_search", arguments: { query: "one more source" } },
              {
                id: "plan-closed",
                name: "todo",
                arguments: {
                  action: "write",
                  items: [
                    { text: "Check filters", status: "done" },
                    { text: "Rank leads", status: "done" },
                  ],
                },
              },
            ],
            finishReason: "tool_calls",
          };
        }
        return { text: "Ranked the usable leads and recorded next actions.", toolCalls: [], finishReason: "stop" };
      }),
    };

    const messages: Message[] = [{ role: "system", content: "sys" }];
    const out = await runTurn({
      messages,
      ctx: { root: "/tmp", safety, requestApproval: async () => true },
      deps: { provider, safety, registry, root: "/tmp", requestApproval: async () => true },
      userText: "Search fresh roles, check the filters, and rank the usable leads.",
    });

    try {
      expect(out.stoppedReason).toBe("done");
      expect(out.toolIterations).toBe(32);
      expect(searchExecutions).toBe(29);
      expect(out.finalText).toContain("Ranked the usable leads");
      expect(seen[3]?.messages.some((message) => message.role === "system" && message.content.includes("2 open items"))).toBe(true);
      expect(seen[3]?.tools).toContain("todo");
      expect(seen[3]?.tools).not.toContain("web_search");
      expect(messages.find((message) => message.role === "tool" && message.toolCallId === "late-search")?.content).toContain("acquisition are closed");
      expect(out.finalText).not.toContain("Tell me the one thing");
    } finally {
      if (previousBudget === undefined) delete process.env.VANTA_TOOL_BUDGET;
      else process.env.VANTA_TOOL_BUDGET = previousBudget;
      if (previousReserve === undefined) delete process.env.VANTA_TOOL_CLOSURE_RESERVE;
      else process.env.VANTA_TOOL_CLOSURE_RESERVE = previousReserve;
    }
  }, 60_000);

  it("never executes past the predeclared hard ceiling even when one batch requests more", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-turn-ceiling-"));
    const registry = new InMemoryToolRegistry();
    let executed = 0;
    registry.register({
      schema: { name: "inspect_state", description: "inspect", parameters: { type: "object", properties: {} } },
      describeForSafety: (args) => `inspect ${String(args.index)}`,
      execute: async () => {
        executed++;
        return { ok: true, output: "checked" };
      },
    });
    const { safety } = spySafety();
    const messages: Message[] = [{ role: "system", content: "sys" }];
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      complete: vi.fn(async (): Promise<CompletionResult> => ({
        text: "",
        toolCalls: Array.from({ length: DEFAULT_TOOL_BUDGET + 5 }, (_, index) => ({
          id: `inspect-${index}`,
          name: "inspect_state",
          arguments: { index },
        })),
        finishReason: "tool_calls",
      })),
    };

    try {
      const out = await runTurn({
        messages,
        ctx: { root, safety, requestApproval: async () => true },
        deps: { provider, safety, registry, root, requestApproval: async () => true },
        userText: "Inspect all items and report.",
      });

      expect(out.stoppedReason).toBe("tool_budget");
      expect(out.toolIterations).toBe(DEFAULT_TOOL_BUDGET);
      expect(executed).toBe(DEFAULT_TOOL_BUDGET);
      expect(messages.filter((message) => message.role === "tool")).toHaveLength(DEFAULT_TOOL_BUDGET + 5);
      expect(messages.filter((message) => message.role === "tool").slice(-5).every((message) => message.content.includes("Not executed"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
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
