import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAcpRunner } from "./serve.js";
import type { AgentOutcome } from "../agent/agent-types.js";
import { InMemoryToolRegistry } from "../tools/registry.js";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../agent.js", () => ({ createConversation: () => ({ send }) }));
afterEach(() => send.mockReset());

async function runOutcome(outcome: AgentOutcome) {
  send.mockResolvedValue(outcome);
  const setup: Parameters<typeof buildAcpRunner>[0] = {
    systemPrompt: "private fixture",
    provider: { modelId: () => "fixture", contextWindow: () => 100000, complete: vi.fn() },
    safety: {} as Parameters<typeof buildAcpRunner>[0]["safety"],
    registry: new InMemoryToolRegistry(),
  };
  const emit = vi.fn();
  const runner = buildAcpRunner(setup, "/private-fixture", () => undefined);
  const result = await runner({ sessionId: "fixture", prompt: "Handle request", mcpServers: [],
    signal: new AbortController().signal, emit, approve: async () => false });
  return { result, emit };
}

describe("ACP outcome classification", () => {
  it.each([
    { stoppedReason: "blocked", needsEffectReview: true },
    { stoppedReason: "blocked" },
    { stoppedReason: "done", needsEffectReview: true },
  ] as const)("refuses instead of reporting success for %j", async status => {
    const outcome: AgentOutcome = { finalText: "Review this action; do not retry.", iterations: 1, toolIterations: 1,
      usage: { inputTokens: 7, outputTokens: 3 }, ...status };
    const { result, emit } = await runOutcome(outcome);
    expect(result).toEqual({ stopReason: "refusal" });
    expect(send).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith({ type: "text_complete", text: outcome.finalText });
    expect(outcome.usage).toEqual({ inputTokens: 7, outputTokens: 3 });
  });

  it.each([
    ["done", "end_turn"], ["interrupted", "cancelled"], ["soft_stopped", "cancelled"],
    ["max_iterations", "max_tokens"], ["repeated_failure", "refusal"],
  ] as const)("preserves %s as %s", async (stoppedReason, stopReason) => {
    const { result } = await runOutcome({ finalText: "Existing result", iterations: 1, toolIterations: 0, stoppedReason });
    expect(result).toEqual({ stopReason });
  });

  it("keeps cancellation classification when an interrupted outcome also needs review", async () => {
    const { result } = await runOutcome({ finalText: "Review before retrying", iterations: 1, toolIterations: 1,
      stoppedReason: "interrupted", needsEffectReview: true });
    expect(result).toEqual({ stopReason: "cancelled" });
  });
});
