import { describe, it, expect, beforeAll, vi } from "vitest";
import { runAgent } from "./agent.js";
import { SafetyClient } from "./safety-client.js";
import { buildRegistry } from "./tools/index.js";
import type { LLMProvider, CompletionResult } from "./providers/interface.js";

const KERNEL_URL = process.env.ARGO_KERNEL_URL ?? "http://127.0.0.1:7788";

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
beforeAll(async () => {
  kernelUp = await new SafetyClient(KERNEL_URL).status();
});

describe("agent dispatch against the live kernel", () => {
  const baseDeps = () => ({
    safety: new SafetyClient(KERNEL_URL),
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
