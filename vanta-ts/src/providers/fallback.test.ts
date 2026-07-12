import { describe, it, expect, vi } from "vitest";
import { FallbackChain, buildFallbackChain } from "./fallback.js";
import type { BillingMode, LLMProvider, CompletionResult, StreamChunk } from "./interface.js";
import type { Message } from "../types.js";
import type { ToolSchema } from "./interface.js";

// ---------------------------------------------------------------------------
// Stub providers
// ---------------------------------------------------------------------------

const GOOD_RESULT: CompletionResult = {
  text: "ok",
  toolCalls: [],
  finishReason: "stop",
};

function makeProvider(opts: {
  id?: string;
  window?: number;
  complete?: (msgs: Message[], tools: ToolSchema[]) => Promise<CompletionResult>;
  stream?: (msgs: Message[], tools: ToolSchema[]) => AsyncIterable<StreamChunk>;
  provider?: string;
  baseRoute?: string;
  billingMode?: BillingMode;
}): LLMProvider {
  return {
    modelId: () => opts.id ?? "test-model",
    contextWindow: () => opts.window ?? 4096,
    complete: opts.complete ?? (() => Promise.resolve(GOOD_RESULT)),
    routeInfo: () => ({ provider: opts.provider ?? "test", model: opts.id ?? "test-model", baseRoute: opts.baseRoute ?? "https://test.invalid/v1", billingMode: opts.billingMode ?? "unknown" }),
    ...(opts.stream !== undefined ? { stream: opts.stream } : {}),
  };
}

function transientError(): Error {
  return Object.assign(new Error("429 too many requests"), {});
}

function authError(): Error {
  return Object.assign(new Error("401 Unauthorized"), {});
}

function nonTransientError(): Error {
  return Object.assign(new Error("ENOENT: file not found"), {});
}

// ---------------------------------------------------------------------------
// FallbackChain tests
// ---------------------------------------------------------------------------

describe("FallbackChain.complete()", () => {
  it("returns primary result when primary succeeds", async () => {
    const p0 = makeProvider({ complete: () => Promise.resolve(GOOD_RESULT) });
    const p1 = makeProvider({
      complete: () => { throw new Error("should not be called"); },
    });
    const chain = new FallbackChain([p0, p1]);
    const result = await chain.complete([], []);
    expect(result.text).toBe("ok");
  });

  it("falls back to provider[1] when provider[0] throws a transient error", async () => {
    const p1Result: CompletionResult = { text: "fallback", toolCalls: [], finishReason: "stop" };
    const p0 = makeProvider({
      complete: () => Promise.reject(transientError()),
    });
    const p1 = makeProvider({
      id: "fallback-model",
      provider: "included-subscription",
      baseRoute: "subscription://fallback",
      billingMode: "included",
      complete: () => Promise.resolve(p1Result),
    });
    const chain = new FallbackChain([p0, p1]);
    const result = await chain.complete([], []);
    expect(result.text).toBe("fallback");
    expect(result.servedRoute).toEqual({
      provider: "included-subscription",
      model: "fallback-model",
      baseRoute: "subscription://fallback",
      billingMode: "included",
      fallbackDepth: 1,
    });
  });

  it("does NOT retry when provider[0] throws a non-retryable auth error (401)", async () => {
    const p1Complete = vi.fn().mockResolvedValue(GOOD_RESULT);
    const p0 = makeProvider({
      complete: () => Promise.reject(authError()),
    });
    const p1 = makeProvider({ complete: p1Complete });
    const chain = new FallbackChain([p0, p1]);
    await expect(chain.complete([], [])).rejects.toThrow("401");
    expect(p1Complete).not.toHaveBeenCalled();
  });

  it("does NOT retry when provider[0] throws a non-transient error (ENOENT)", async () => {
    const p1Complete = vi.fn().mockResolvedValue(GOOD_RESULT);
    const p0 = makeProvider({
      complete: () => Promise.reject(nonTransientError()),
    });
    const p1 = makeProvider({ complete: p1Complete });
    const chain = new FallbackChain([p0, p1]);
    await expect(chain.complete([], [])).rejects.toThrow("ENOENT");
    expect(p1Complete).not.toHaveBeenCalled();
  });

  it("re-throws last transient error when all providers fail", async () => {
    const p0 = makeProvider({ complete: () => Promise.reject(transientError()) });
    const p1 = makeProvider({ complete: () => Promise.reject(new Error("503 service unavailable")) });
    const chain = new FallbackChain([p0, p1]);
    await expect(chain.complete([], [])).rejects.toThrow(/503/);
  });

  it("modelId() returns primary provider's value", () => {
    const primary = makeProvider({ id: "primary-model" });
    const fallback = makeProvider({ id: "fallback-model" });
    const chain = new FallbackChain([primary, fallback]);
    expect(chain.modelId()).toBe("primary-model");
  });

  it("contextWindow() returns primary provider's value", () => {
    const primary = makeProvider({ window: 128_000 });
    const fallback = makeProvider({ window: 4_096 });
    const chain = new FallbackChain([primary, fallback]);
    expect(chain.contextWindow()).toBe(128_000);
  });
});

// ---------------------------------------------------------------------------
// buildFallbackChain tests
// ---------------------------------------------------------------------------

describe("buildFallbackChain()", () => {
  it("returns the primary unchanged when VANTA_FALLBACK_PROVIDERS is not set", () => {
    const primary = makeProvider({});
    const result = buildFallbackChain(primary, {});
    expect(result).toBe(primary); // identity — no wrapping
  });

  it("returns the primary unchanged when VANTA_FALLBACK_PROVIDERS is empty", () => {
    const primary = makeProvider({});
    const result = buildFallbackChain(primary, { VANTA_FALLBACK_PROVIDERS: "  " });
    expect(result).toBe(primary);
  });

  it("returns the primary unchanged when all fallback ids fail to resolve (no keys)", () => {
    const primary = makeProvider({});
    // 'openai' requires OPENAI_API_KEY; missing key → resolveProvider throws → skipped.
    const result = buildFallbackChain(primary, {
      VANTA_FALLBACK_PROVIDERS: "openai",
      // intentionally no OPENAI_API_KEY
    });
    expect(result).toBe(primary);
  });

  it("returns a FallbackChain when a valid fallback id resolves", () => {
    const primary = makeProvider({});
    // 'ollama' is keyless and always resolves.
    const result = buildFallbackChain(primary, {
      VANTA_FALLBACK_PROVIDERS: "ollama",
    });
    expect(result).toBeInstanceOf(FallbackChain);
  });

  it("skips invalid fallback ids and keeps valid ones", () => {
    const primary = makeProvider({});
    const result = buildFallbackChain(primary, {
      VANTA_FALLBACK_PROVIDERS: "openai,ollama", // openai needs key → skipped; ollama resolves
    });
    // ollama resolved → chain wraps primary + 1 fallback
    expect(result).toBeInstanceOf(FallbackChain);
  });
});

// ---------------------------------------------------------------------------
// stream() tests
// ---------------------------------------------------------------------------

async function collectStream(iter: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const c of iter) chunks.push(c);
  return chunks;
}

describe("FallbackChain.stream()", () => {
  it("streams from primary when primary succeeds", async () => {
    async function* goodStream(): AsyncIterable<StreamChunk> {
      yield { type: "text", delta: "hello" };
      yield { type: "done", result: GOOD_RESULT };
    }
    const p0 = makeProvider({ stream: goodStream });
    const p1 = makeProvider({
      stream: () => { throw new Error("should not be called"); },
    });
    const chain = new FallbackChain([p0, p1]);
    const chunks = await collectStream(chain.stream!([], []));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: "text", delta: "hello" });
  });

  it("falls back to provider[1] stream when provider[0] stream throws before first yield", async () => {
    async function* failStream(): AsyncIterable<StreamChunk> {
      throw transientError();
      yield { type: "text", delta: "x" }; // unreachable, quiets TS
    }
    async function* goodStream(): AsyncIterable<StreamChunk> {
      yield { type: "done", result: { text: "fallback-stream", toolCalls: [], finishReason: "stop" } };
    }
    const p0 = makeProvider({ stream: failStream });
    const p1 = makeProvider({ stream: goodStream });
    const chain = new FallbackChain([p0, p1]);
    const chunks = await collectStream(chain.stream!([], []));
    expect(chunks[0]).toMatchObject({ type: "done" });
    if (chunks[0]?.type === "done") {
      expect(chunks[0].result.text).toBe("fallback-stream");
      expect(chunks[0].result.servedRoute?.fallbackDepth).toBe(1);
    }
  });
});
