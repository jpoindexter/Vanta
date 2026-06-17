import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent, createConversation } from "./agent.js";
import { createKernelClient } from "./safety-client.js";
import { buildRegistry } from "./tools/index.js";
import type { LLMProvider, CompletionResult } from "./providers/interface.js";

const KERNEL_URL = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";

/** A provider that replays scripted turns — removes model nondeterminism. */
class FakeProvider implements LLMProvider {
  private index = 0;
  constructor(private readonly turns: CompletionResult[]) {}
  async complete(): Promise<CompletionResult> {
    return (
      this.turns[this.index++] ?? { text: "ok", toolCalls: [], finishReason: "stop" }
    );
  }
  modelId(): string {
    return "fake";
  }
  contextWindow(): number {
    return 100_000;
  }
}

let kernelUp = false;
let home = "";
let prevHome: string | undefined;
beforeAll(async () => {
  // Isolate the permission store: dispatch reads loadRules(process.env) from
  // ~/.vanta/permissions.tsv, so a real `allow shell_cmd` rule (from the
  // "always allow" feature) would auto-approve the ask-risk action this test
  // expects to prompt on. A clean temp VANTA_HOME makes the gate deterministic.
  prevHome = process.env.VANTA_HOME;
  home = mkdtempSync(join(tmpdir(), "vanta-agent-test-"));
  process.env.VANTA_HOME = home;
  kernelUp = await createKernelClient(KERNEL_URL).status();
});

afterAll(() => {
  if (prevHome === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prevHome;
  if (home) rmSync(home, { recursive: true, force: true });
});

describe("agent dispatch against the live kernel", () => {
  const baseDeps = () => ({
    safety: createKernelClient(KERNEL_URL),
    registry: buildRegistry(),
    root: process.cwd(),
  });

  it("pauses for approval on an ask-risk action and respects denial", async () => {
    if (!kernelUp) return; // kernel sidecar not running; skip integration
    const approve = vi.fn<(action: string, reason: string) => Promise<boolean>>(
      async () => false,
    );
    const provider = new FakeProvider([
      {
        text: "",
        toolCalls: [
          { id: "c1", name: "shell_cmd", arguments: { command: "brew install cowsay" } },
        ],
        finishReason: "tool_calls",
      },
      { text: "stopped after denial", toolCalls: [], finishReason: "stop" },
    ]);

    let denied = "";
    const outcome = await runAgent("system", "install cowsay", {
      ...baseDeps(),
      provider,
      requestApproval: approve,
      onToolResult: (_n, _ok, out) => {
        denied = out;
      },
    });

    expect(approve).toHaveBeenCalledOnce();
    expect(approve.mock.calls[0]?.[0]).toContain("install");
    expect(denied).toContain("denied");
    expect(outcome.stoppedReason).toBe("done");
  });

  it("blocks a destructive action without prompting", async () => {
    if (!kernelUp) return;
    const approve = vi.fn(async () => true);
    const provider = new FakeProvider([
      {
        text: "",
        toolCalls: [
          { id: "c1", name: "shell_cmd", arguments: { command: "rm -rf /tmp/x" } },
        ],
        finishReason: "tool_calls",
      },
    ]);

    let result = "";
    await runAgent("system", "delete", {
      ...baseDeps(),
      provider,
      requestApproval: approve,
      onToolResult: (_n, _ok, out) => {
        result = out;
      },
    });

    expect(approve).not.toHaveBeenCalled();
    expect(result).toContain("blocked");
  });

  it("executes an allow-risk tool", async () => {
    if (!kernelUp) return;
    const provider = new FakeProvider([
      {
        text: "",
        toolCalls: [
          { id: "c1", name: "inspect_state", arguments: { what: "goals" } },
        ],
        finishReason: "tool_calls",
      },
      { text: "reported", toolCalls: [], finishReason: "stop" },
    ]);

    let ok = false;
    await runAgent("system", "goals", {
      ...baseDeps(),
      provider,
      requestApproval: async () => true,
      onToolResult: (_n, success) => {
        ok = success;
      },
    });

    expect(ok).toBe(true);
  });
});

// Auto-compact: onAutoCompact callback fires when context compression runs.
// Uses a tiny context window to force compaction without needing the kernel.
describe("auto-compact onAutoCompact callback", () => {
  it("fires with dropped count and summary text when compression runs", async () => {
    // Seed 12 prior messages so rest.length > protectFirst(3)+protectLast(6)=9.
    // With a 300-token window and ~80-char messages, the total comfortably exceeds 75%.
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: "x".repeat(80),
    }));
    const tinyWindow: LLMProvider = {
      complete: async () => ({ text: "done", toolCalls: [], finishReason: "stop" }),
      modelId: () => "fake",
      contextWindow: () => 300,
    };
    const compactEvents: Array<{ dropped: number; summary: string }> = [];
    const convo = createConversation(
      "sys",
      {
        provider: tinyWindow,
        safety: createKernelClient("http://127.0.0.1:7788"),
        registry: buildRegistry(),
        root: process.cwd(),
        requestApproval: async () => true,
        summarize: async () => "work was summarized",
        onAutoCompact: (dropped, summary) => compactEvents.push({ dropped, summary }),
      },
      { history },
    );

    await convo.send("new turn");

    expect(compactEvents.length).toBeGreaterThan(0);
    expect(compactEvents[0]?.summary).toBe("work was summarized");
    expect(compactEvents[0]?.dropped).toBeGreaterThan(0);
  });
});

// The /model hot-swap mechanism, proven without the kernel (no tools → no
// safety calls). This is the half the picker's selectModel relies on:
// setProvider must change which provider the NEXT send actually calls.
describe("setProvider hot-swap", () => {
  it("the next send uses the swapped-in provider, not the original", async () => {
    const original: LLMProvider = {
      complete: async () => {
        throw new Error("original provider must NOT be called after setProvider");
      },
      modelId: () => "original",
      contextWindow: () => 100_000,
    };
    const swapped = new FakeProvider([{ text: "from-swapped", toolCalls: [], finishReason: "stop" }]);

    const convo = createConversation("system", {
      provider: original,
      safety: createKernelClient(KERNEL_URL), // constructed, never called (no tools)
      registry: buildRegistry(),
      root: process.cwd(),
      requestApproval: async () => true,
    });
    convo.setProvider(swapped);
    const out = await convo.send("hello");

    expect(out.finalText).toBe("from-swapped"); // proves the swap took effect
  });
});
