import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTurn } from "./turn-loop.js";
import type { AgentDeps } from "./agent-types.js";
import type { CompletionResult, LLMProvider, StreamChunk } from "../providers/interface.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import { receiptStatusForStoppedReason } from "../desktop/handler-chat-receipts.js";

const usage = { inputTokens: 123, outputTokens: 17 };
const partial: CompletionResult = { text: "Partial answer", toolCalls: [], finishReason: "stop", usage };

async function run(provider: LLMProvider, controller: AbortController, registry = new InMemoryToolRegistry()) {
  const root = mkdtempSync(join(tmpdir(), "vanta-turn-cancel-"));
  const safety = { logEvent: vi.fn(async () => {}) } as unknown as AgentDeps["safety"];
  const deps: AgentDeps = {
    provider,
    safety,
    registry,
    root,
    requestApproval: async () => false,
    ...(provider.stream ? { onTextDelta: vi.fn() } : {}),
  };
  try {
    return await runTurn({
      messages: [{ role: "system", content: "test" }],
      ctx: { root: deps.root, safety, requestApproval: deps.requestApproval },
      deps,
      userText: "hello",
      signal: controller.signal,
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function provider(complete: LLMProvider["complete"]): LLMProvider {
  return { modelId: () => "fixture", contextWindow: () => 100_000, complete };
}

describe("cancelled provider settlement", () => {
  it("does not settle done when abort arrives after the final chunk before EOF", async () => {
    const controller = new AbortController();
    const complete = vi.fn(async () => partial);
    const model = provider(complete);
    model.stream = async function* (): AsyncIterable<StreamChunk> {
      yield { type: "text", delta: partial.text };
      yield { type: "done", result: partial };
      controller.abort();
    };
    const outcome = await run(model, controller);
    expect(outcome.stoppedReason).toBe("interrupted");
    expect(outcome.completionState).toBe("stopped");
    expect(outcome.usage).toEqual(usage);
    expect(receiptStatusForStoppedReason(outcome.stoppedReason).status).toBe("interrupted");
    expect(complete).not.toHaveBeenCalled();
  });

  it("does not settle done when a non-stream provider resolves after abort", async () => {
    const controller = new AbortController();
    const complete = vi.fn(async () => { controller.abort(); return partial; });
    const outcome = await run(provider(complete), controller);
    expect(outcome.stoppedReason).toBe("interrupted");
    expect(outcome.finalText).toBe("Interrupted.");
    expect(outcome.iterations).toBe(1);
    expect(outcome.usage).toEqual(usage);
    expect(receiptStatusForStoppedReason(outcome.stoppedReason).status).toBe("interrupted");
    expect(complete).toHaveBeenCalledOnce();
  });

  it("retains AbortError when partial done is yielded after an in-stream abort", async () => {
    const controller = new AbortController();
    const complete = vi.fn(async () => partial);
    const model = provider(complete);
    model.stream = async function* (): AsyncIterable<StreamChunk> {
      yield { type: "text", delta: partial.text };
      controller.abort();
      yield { type: "done", result: partial };
    };
    await expect(run(model, controller)).rejects.toMatchObject({ name: "AbortError" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("keeps an uncancelled completion successful", async () => {
    const outcome = await run(provider(async () => partial), new AbortController());
    expect(outcome.stoppedReason).toBe("done");
    expect(receiptStatusForStoppedReason(outcome.stoppedReason).status).toBe("done");
  });
});

describe("cancelled returned tools", () => {
  it("retains usage but never dispatches a tool returned after Stop", async () => {
    const controller = new AbortController();
    const registry = new InMemoryToolRegistry();
    const execute = vi.fn(async () => ({ ok: true, output: "must not execute" }));
    registry.register({
      schema: { name: "write_file", description: "fixture", parameters: { type: "object", properties: {} } },
      execute,
    });
    const model = provider(async () => {
      controller.abort();
      return { ...partial, toolCalls: [{ id: "cancelled-tool", name: "write_file", arguments: {} }] };
    });
    const outcome = await run(model, controller, registry);
    expect(outcome.stoppedReason).toBe("interrupted");
    expect(outcome.usage).toEqual(usage);
    expect(outcome.toolIterations).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });
});
