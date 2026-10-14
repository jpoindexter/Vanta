import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listRouteUsage } from "../cost/route-ledger.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";
import { forkProvider } from "./fork-provider.js";

function fakeProvider(model: string, impl?: () => Promise<CompletionResult>): LLMProvider & { complete: ReturnType<typeof vi.fn> } {
  const complete = vi.fn(impl ?? (async () => ({ text: `from ${model}`, toolCalls: [], finishReason: "stop", usage: { inputTokens: 100, outputTokens: 10 } })));
  return {
    complete,
    modelId: () => model,
    contextWindow: () => 8000,
    routeInfo: () => ({ provider: "openai", model, baseRoute: "https://stand-in.test/v1", billingMode: "metered" as const }),
  } as unknown as LLMProvider & { complete: ReturnType<typeof vi.fn> };
}

const ASK = [{ role: "user" as const, content: "hi" }];

describe("forkProvider", () => {
  let dataDir: string;
  beforeEach(async () => { dataDir = await mkdtemp(join(tmpdir(), "vanta-fork-provider-")); });
  afterEach(async () => { await rm(dataDir, { recursive: true, force: true }); });
  const ledger = () => ({ dataDir, sessionId: "s1", agent: "interactive" });

  it("returns the main provider untouched when nothing is configured and no ledger is given", () => {
    const main = fakeProvider("main-model");
    expect(forkProvider(main, { purpose: "learn", env: {} })).toBe(main);
  });

  it("calls the main provider and records purpose=learn when the env var is unset", async () => {
    const main = fakeProvider("main-model");
    const fork = forkProvider(main, { purpose: "learn", env: {}, ledger: ledger() });
    expect((await fork.complete(ASK, [])).text).toBe("from main-model");
    const rows = await listRouteUsage(dataDir);
    expect(rows.map((r) => [r.purpose, r.model, r.fallbackDepth])).toEqual([["learn", "main-model", 0]]);
  });

  it("routes the fork to the cheap provider when VANTA_MODEL_LEARN is set, and records its model", async () => {
    const main = fakeProvider("main-model");
    const cheap = fakeProvider("cheap-model");
    const fork = forkProvider(main, { purpose: "learn", env: { VANTA_MODEL_LEARN: "cheap-model" }, ledger: ledger(), resolveRouted: () => cheap });
    expect((await fork.complete(ASK, [])).text).toBe("from cheap-model");
    expect(main.complete).not.toHaveBeenCalled();
    const rows = await listRouteUsage(dataDir);
    expect(rows.map((r) => [r.purpose, r.model])).toEqual([["learn", "cheap-model"]]);
  });

  it("records purpose=verify for verifier forks", async () => {
    const fork = forkProvider(fakeProvider("main-model"), { purpose: "verify", env: {}, ledger: ledger() });
    await fork.complete(ASK, []);
    expect((await listRouteUsage(dataDir)).map((r) => r.purpose)).toEqual(["verify"]);
  });

  it("falls back to the main provider with one actionable warning when the override cannot be resolved", async () => {
    const main = fakeProvider("main-model");
    const warn = vi.fn();
    const fork = forkProvider(main, {
      purpose: "learn", env: { VANTA_LEARN_PROVIDER: "nope" }, ledger: ledger(), warn,
      resolveRouted: () => { throw new Error('Unknown VANTA_PROVIDER "nope".'); },
    });
    await fork.complete(ASK, []);
    await fork.complete(ASK, []);
    expect(main.complete).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0]![0] as string;
    expect(line).not.toContain("\n");
    expect(line).toContain("VANTA_LEARN_PROVIDER=nope");
    expect(line).toContain("main-model");
    expect(line).toContain("Fix or unset");
    expect((await listRouteUsage(dataDir)).map((r) => r.model)).toEqual(["main-model", "main-model"]);
  });

  it("retries on the main provider when the cheap model rejects the call, marking fallbackDepth=1", async () => {
    const main = fakeProvider("main-model");
    const cheap = fakeProvider("typo-model", async () => { throw new Error("404 model_not_found"); });
    const warn = vi.fn();
    const fork = forkProvider(main, { purpose: "learn", env: { VANTA_MODEL_LEARN: "typo-model" }, ledger: ledger(), warn, resolveRouted: () => cheap });
    expect((await fork.complete(ASK, [])).text).toBe("from main-model");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("404 model_not_found"));
    expect((await listRouteUsage(dataDir)).map((r) => [r.model, r.fallbackDepth])).toEqual([["main-model", 1]]);
  });

  it("does not retry on main when the caller aborted", async () => {
    const main = fakeProvider("main-model");
    const cheap = fakeProvider("cheap-model", async () => { throw new Error("aborted"); });
    const controller = new AbortController();
    controller.abort();
    const fork = forkProvider(main, { purpose: "learn", env: { VANTA_MODEL_LEARN: "cheap-model" }, resolveRouted: () => cheap, warn: vi.fn() });
    await expect(fork.complete(ASK, [], { signal: controller.signal })).rejects.toThrow("aborted");
    expect(main.complete).not.toHaveBeenCalled();
  });

  it("does not resolve the routed provider until the fork is used", () => {
    const resolveRouted = vi.fn(() => fakeProvider("cheap-model"));
    forkProvider(fakeProvider("main-model"), { purpose: "learn", env: { VANTA_MODEL_LEARN: "cheap-model" }, resolveRouted });
    expect(resolveRouted).not.toHaveBeenCalled();
  });
});
