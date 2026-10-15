import { afterEach, describe, expect, it } from "vitest";
import { getCompletion, getCompletionWithContextRetry } from "./provider-call.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { AgentDeps } from "./agent-types.js";

// Minimal CompletionRetryArgs: providerCall.schemas is pre-set so getCompletion never touches the
// registry, and no onTextDelta means it calls provider.complete (not stream).
function makeArgs(complete: () => Promise<unknown>) {
  const deps = {
    provider: { complete, modelId: () => "m", contextWindow: () => 1000 },
    registry: { schemas: () => [] },
    activeGoalText: undefined,
    outputSchema: undefined,
    onTextDelta: undefined,
    getEffortLevel: () => undefined,
  } as never;
  return {
    deps,
    depsWithTools: { currentTools: [] } as never,
    messages: [{ role: "user", content: "hi" }] as never,
    turnCtx: {} as never,
    signal: undefined,
    providerCall: { ctx: {} as never, prefetched: new Map(), schemas: [] },
  };
}
const OK = { text: "ok", toolCalls: [], finishReason: "stop" };

describe("getCompletionWithContextRetry — transient provider retry", () => {
  afterEach(() => {
    delete process.env.VANTA_PROVIDER_RETRIES;
    delete process.env.VANTA_PROVIDER_RETRY_BACKOFF_MS;
  });

  it("retries a transient provider error then succeeds", async () => {
    process.env.VANTA_PROVIDER_RETRY_BACKOFF_MS = "0";
    let calls = 0;
    const r = await getCompletionWithContextRetry(makeArgs(async () => {
      calls++;
      if (calls < 2) throw new Error("429 Too Many Requests");
      return OK;
    }));
    expect(r).toEqual({ ok: true, result: OK });
    expect(calls).toBe(2);
  });

  it("retries an Undici terminated stream instead of ending the agent turn", async () => {
    process.env.VANTA_PROVIDER_RETRY_BACKOFF_MS = "0";
    let calls = 0;
    const r = await getCompletionWithContextRetry(makeArgs(async () => {
      calls++;
      if (calls === 1) throw new TypeError("terminated");
      return OK;
    }));
    expect(r).toEqual({ ok: true, result: OK });
    expect(calls).toBe(2);
  });

  it("restarts the real streaming path after Undici terminates it", async () => {
    process.env.VANTA_PROVIDER_RETRY_BACKOFF_MS = "0";
    let streamCalls = 0;
    const args = makeArgs(async () => {
      throw new Error("complete fallback should not run");
    });
    const streamDeps = args.deps as unknown as AgentDeps;
    streamDeps.provider.stream = async function* () {
      streamCalls++;
      if (streamCalls === 1) throw new TypeError("terminated");
      yield { type: "done" as const, result: OK };
    };
    streamDeps.onTextDelta = () => {};

    const r = await getCompletionWithContextRetry(args);

    expect(r).toEqual({ ok: true, result: OK });
    expect(streamCalls).toBe(2);
  });

  it("stops gracefully (ok:false) after exhausting retries on a persistent transient error", async () => {
    process.env.VANTA_PROVIDER_RETRIES = "2";
    process.env.VANTA_PROVIDER_RETRY_BACKOFF_MS = "0";
    let calls = 0;
    const r = await getCompletionWithContextRetry(makeArgs(async () => { calls++; throw new Error("ETIMEDOUT connect"); }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/provider error after 3 attempt/);
    expect(calls).toBe(3); // initial + 2 retries
  });

  it("fails fast (throws) on a non-transient error — a real bug, not a hiccup", async () => {
    process.env.VANTA_PROVIDER_RETRY_BACKOFF_MS = "0";
    let calls = 0;
    await expect(getCompletionWithContextRetry(makeArgs(async () => { calls++; throw new Error("400 invalid_request: bad tool schema"); })))
      .rejects.toThrow(/invalid_request/);
    expect(calls).toBe(1); // no retry
  });
});

describe("streamed tool prefetch boundaries", () => {
  it("passes live effort and speed settings to the provider request", async () => {
    let config: unknown;
    const deps = {
      provider: {
        modelId: () => "gpt-5.6-sol",
        contextWindow: () => 100_000,
        complete: async (_messages: unknown, _tools: unknown, received: unknown) => {
          config = received;
          return OK;
        },
      },
      registry: { schemas: () => [] },
      root: "/tmp",
      getEffortLevel: () => "ultra",
      getServiceTier: () => "fast",
    } as unknown as AgentDeps;

    await getCompletion(deps, [{ role: "user", content: "finish" }], undefined, {
      ctx: { root: "/tmp", safety: {} as never, requestApproval: async () => true },
      prefetched: new Map(),
      schemas: [],
    });

    expect(config).toEqual(expect.objectContaining({ effortLevel: "ultra", serviceTier: "fast" }));
  });

  it("does not prefetch a hallucinated tool that is absent from the exposed schema set", async () => {
    let executed = 0;
    const registry = new InMemoryToolRegistry();
    registry.register({
      schema: { name: "web_search", description: "search", parameters: { type: "object", properties: {} } },
      describeForSafety: () => "search",
      execute: async () => {
        executed++;
        return { ok: true, output: "searched" };
      },
    });
    const result = { text: "", toolCalls: [{ id: "late-search", name: "web_search", arguments: { query: "more" } }], finishReason: "tool_calls" as const };
    const deps = {
      provider: {
        modelId: () => "fake",
        contextWindow: () => 100_000,
        complete: async () => result,
        stream: async function* () {
          yield { type: "tool_call" as const, call: result.toolCalls[0]! };
          yield { type: "done" as const, result };
        },
      },
      registry,
      safety: {},
      root: "/tmp",
      requestApproval: async () => true,
      onTextDelta: () => {},
    } as unknown as AgentDeps;
    const prefetched = new Map();

    await getCompletion(deps, [{ role: "user", content: "finish" }], undefined, {
      ctx: { root: "/tmp", safety: {} as never, requestApproval: async () => true },
      prefetched,
      schemas: [{ name: "todo", description: "plan", parameters: { type: "object", properties: {} } }],
      prefetchLimit: 10,
    });

    expect(prefetched.size).toBe(0);
    expect(executed).toBe(0);
  });
});
