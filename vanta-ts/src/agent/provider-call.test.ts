import { afterEach, describe, expect, it } from "vitest";
import { getCompletionWithContextRetry } from "./provider-call.js";

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
