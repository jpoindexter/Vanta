import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldAutoContinue } from "./auto-continue.js";
import { runTurn } from "./turn-loop.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "./agent-types.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";
import type { Message, Verdict } from "../types.js";
import { receiptStatusForStoppedReason } from "../desktop/handler-chat-receipts.js";

const text = (content: string): CompletionResult => ({ text: content, toolCalls: [], finishReason: "stop" });
afterEach(() => vi.unstubAllEnvs());

describe("reported blockers terminate automatic continuation", () => {
  it.each([
    "Blocked: both required pages returned HTTP 403. The document remains unwritten.",
    "**Blocked:** the source requires a login. Next step needs your access.",
    "## Blocked — required credentials are missing.",
  ])("does not override an open checklist: %s", async (content) => {
    vi.stubEnv("VANTA_VERIFY", "1");
    const provider = { complete: vi.fn() } as unknown as LLMProvider;
    expect(await shouldAutoContinue({
      result: text(content), messages: [], autoContinues: 0,
      toolNames: ["web_fetch", "todo"], openTodoCount: 3,
      deps: { provider } as AgentDeps,
    })).toBe(false);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it.each([
    "The first source was blocked, but the approved fallback worked. Next step: write the brief.",
    "The article contains the phrase ‘Blocked: login needed’. Next step: summarize it.",
  ])("preserves productive continuation: %s", async (content) => {
    expect(await shouldAutoContinue({
      result: text(content), messages: [], autoContinues: 0,
      toolNames: ["web_fetch", "todo"], openTodoCount: 1, deps: {} as AgentDeps,
    })).toBe(true);
  });

  it("stops the real loop after an HTTP rejection, without forcing a fabricated write", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-blocked-turn-"));
    try {
      const registry = new InMemoryToolRegistry();
      const write = vi.fn(async () => ({ ok: true, output: "should not execute" }));
      for (const [name, execute] of [
        ["todo", async () => ({ ok: true, output: "3 open tasks" })],
        ["web_fetch", async () => ({ ok: false, output: "HTTP 403: source unavailable" })],
        ["write_file", write],
      ] as const) registry.register({ schema: { name, description: name, parameters: { type: "object", properties: {} } }, execute });
      let calls = 0;
      const provider: LLMProvider = {
        modelId: () => "blocked-provider-fixture", contextWindow: () => 100_000,
        complete: vi.fn(async (): Promise<CompletionResult> => {
          if (++calls === 1) return { text: "", finishReason: "tool_calls", toolCalls: [
            { id: "plan", name: "todo", arguments: { action: "write", items: [{ status: "pending" }, { status: "pending" }, { status: "pending" }] } },
            { id: "source", name: "web_fetch", arguments: { url: "https://example.com/source" } },
          ] };
          if (calls === 2) return text("Blocked: the required source returned HTTP 403. No brief was written.");
          if (calls === 3) return { text: "", finishReason: "tool_calls", toolCalls: [{ id: "write", name: "write_file", arguments: { path: "brief.md" } }] };
          return text("Which alternate source may I use?");
        }),
      };
      const safety = { assess: async (): Promise<Verdict> => ({ risk: "allow", needsHuman: false, reason: "fixture" }), logEvent: vi.fn() } as unknown as AgentDeps["safety"];
      const messages: Message[] = [{ role: "system", content: "sys" }];
      const deps: AgentDeps = { root, provider, safety, registry, requestApproval: async () => true };
      const outcome = await runTurn({ messages, ctx: { root, safety, requestApproval: deps.requestApproval }, deps, userText: "Research the specified source, write a cited brief, and verify it. Do not substitute sources." });
      expect(provider.complete).toHaveBeenCalledTimes(2);
      expect(write).not.toHaveBeenCalled();
      expect(outcome.stoppedReason).toBe("blocked");
      expect(outcome.completionState).toBe("waiting");
      expect(receiptStatusForStoppedReason(outcome.stoppedReason).status).toBe("failed");
      expect(messages.some((message) => message.role === "user" && message.content.startsWith("Continue —"))).toBe(false);
      expect(outcome.finalText).toContain("No brief was written");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
