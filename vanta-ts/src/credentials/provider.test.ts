import { describe, expect, it, vi } from "vitest";
import { CredentialPoolProvider } from "./provider.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";
import { FallbackChain } from "../providers/fallback.js";

const good = (text: string): CompletionResult => ({ text, toolCalls: [], finishReason: "stop" });
const provider = (complete: LLMProvider["complete"]): LLMProvider => ({ complete, modelId: () => "gpt-test", contextWindow: () => 1000 });

describe("CredentialPoolProvider", () => {
  it("rotates same-provider credentials before surfacing an error to fallback", async () => {
    const attempts: string[] = [];
    const pooled = new CredentialPoolProvider(provider(() => Promise.reject(new Error("base should not run"))), {
      providerId: "openai",
      lease: vi.fn()
        .mockResolvedValueOnce({ leaseId: "l1", id: "one", source: "env", ref: "ONE" })
        .mockResolvedValueOnce({ leaseId: "l2", id: "two", source: "env", ref: "TWO" })
        .mockResolvedValueOnce(null),
      resolve: async (lease) => lease.id,
      makeProvider: (key) => provider(async () => { attempts.push(key); if (key === "one") throw new Error("429 rate limit"); return good("second key"); }),
      failure: vi.fn(), release: vi.fn(), owner: "agent:a",
    });
    expect((await pooled.complete([], [])).text).toBe("second key");
    expect(attempts).toEqual(["one", "two"]);
  });

  it("uses the base provider when no pool credentials exist", async () => {
    const base = provider(async () => good("base"));
    const pooled = new CredentialPoolProvider(base, {
      providerId: "openai", lease: async () => null, resolve: async () => null,
      makeProvider: () => base, failure: async () => {}, release: async () => {}, owner: "agent:a",
    });
    expect((await pooled.complete([], [])).text).toBe("base");
  });

  it("falls back cross-provider only after every same-provider key is exhausted", async () => {
    const order: string[] = [];
    const pooled = new CredentialPoolProvider(provider(async () => { order.push("base"); throw new Error("401 unauthorized"); }), {
      providerId: "openai", owner: "agent:a",
      lease: vi.fn().mockResolvedValueOnce({ leaseId: "l1", id: "one", source: "env", ref: "ONE" }).mockResolvedValueOnce(null),
      resolve: async () => "one", makeProvider: () => provider(async () => { order.push("pool"); throw new Error("402 payment required"); }),
      failure: vi.fn(), release: vi.fn(),
    });
    const fallback = provider(async () => { order.push("fallback"); return good("fallback"); });
    expect((await new FallbackChain([pooled, fallback]).complete([], [])).text).toBe("fallback");
    expect(order).toEqual(["pool", "base", "fallback"]);
  });
});
