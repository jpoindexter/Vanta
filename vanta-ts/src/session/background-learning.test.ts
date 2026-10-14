import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listRouteUsage } from "../cost/route-ledger.js";
import * as backgroundLearning from "./background-learning.js";
import type { KernelClient } from "../kernel/client.js";
import type { LLMProvider } from "../providers/interface.js";

type ChoiceWallApi = {
  isExplicitChoiceWall?: (finalText: string) => boolean;
};

const api = backgroundLearning as ChoiceWallApi & typeof backgroundLearning;

describe("post-turn choice wall", () => {
  it("recognizes an explicit promise to wait for the operator's choice", () => {
    expect(api.isExplicitChoiceWall).toBeTypeOf("function");
    expect(api.isExplicitChoiceWall?.(
      "Choose one of the five workflows. I won't start anything until you choose.",
    )).toBe(true);
  });

  it("does not suppress learning merely because a completed answer uses the word choose", () => {
    expect(api.isExplicitChoiceWall).toBeTypeOf("function");
    expect(api.isExplicitChoiceWall?.(
      "I compared both implementations and chose the safer one. The targeted test passed.",
    )).toBe(false);
  });

  it("does not call the learning provider when mutation is deferred", async () => {
    const complete = vi.fn().mockResolvedValue({ text: "no skill", usage: { inputTokens: 1, outputTokens: 1 } });
    const result = await api.reviewAfterTurn({
      provider: { complete, modelId: () => "fake", contextWindow: () => 1000 } as unknown as LLMProvider,
      safety: {} as KernelClient,
      root: "/tmp/vanta-choice-wall-test",
      transcript: [{ role: "user", content: "check readiness" }, { role: "assistant", content: "pick one; I will wait" }],
      toolIterations: 10,
      turnIndex: 1,
      env: { VANTA_SELF_IMPROVE: "1", VANTA_REVIEW_MIN_TOOLS: "1" },
      deferMutation: true,
    } as Parameters<typeof api.reviewAfterTurn>[0] & { deferMutation: boolean });

    expect(result).toBe("deferred");
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("post-turn fork ledger attribution", () => {
  let dataDir: string;
  beforeEach(async () => { dataDir = await mkdtemp(join(tmpdir(), "vanta-fork-ledger-")); });
  afterEach(async () => { await rm(dataDir, { recursive: true, force: true }); });

  const ledger = () => ({ dataDir, sessionId: "s1", agent: "interactive" });
  const provider = (): LLMProvider => ({
    complete: vi.fn().mockResolvedValue({ text: "[]", toolCalls: [], finishReason: "stop", usage: { inputTokens: 5, outputTokens: 1 } }),
    modelId: () => "main-model",
    contextWindow: () => 8000,
    routeInfo: () => ({ provider: "openai", model: "main-model", baseRoute: "https://stand-in.test/v1", billingMode: "metered" as const }),
  }) as unknown as LLMProvider;
  const transcript = [
    { role: "user" as const, content: "ship the release" },
    { role: "assistant" as const, content: "Done. The release is shipped and the tests pass." },
  ];
  const purposes = async () => (await listRouteUsage(dataDir)).map((r) => [r.purpose, r.model]);

  it("records brain learning as purpose=learn", async () => {
    await api.brainLearnAfterTurn({ provider: provider(), transcript, toolIterations: 9, turnIndex: 1, env: {}, ledger: ledger() });
    expect(await purposes()).toEqual([["learn", "main-model"]]);
  });

  it("records session memory as purpose=learn", async () => {
    await api.sessionMemoryAfterTurn({ provider: provider(), dataDir, transcript, toolIterations: 9, turnIndex: 1, env: {}, ledger: ledger() });
    expect((await purposes()).every(([p]) => p === "learn")).toBe(true);
    expect((await purposes()).length).toBeGreaterThan(0);
  });

  it("records the critic as purpose=verify", async () => {
    const onNote = vi.fn();
    const busy = [
      { role: "user" as const, content: "ship the release" },
      { role: "assistant" as const, content: "", toolCalls: [1, 2, 3].map((n) => ({ id: `c${n}`, name: "read_file", arguments: {} })) },
      ...[1, 2, 3].map((n) => ({ role: "tool" as const, toolCallId: `c${n}`, name: "read_file", content: "ok" })),
      { role: "assistant" as const, content: "Done. The release is shipped." },
    ];
    await api.criticAfterTurn({ provider: provider(), goal: "ship", messages: busy as Parameters<typeof api.criticAfterTurn>[0]["messages"], onNote, env: { VANTA_CRITIC: "1" }, ledger: ledger() });
    expect(await purposes()).toEqual([["verify", "main-model"]]);
  });

  it("records the completion verifier as purpose=verify", async () => {
    const fork = api.completionVerifierAfterTurn;
    const safety = { getGoals: async () => [], logEvent: async () => undefined } as unknown as KernelClient;
    fork({ provider: provider(), safety, transcript: [...transcript], env: { VANTA_VERIFY: "1" }, ledger: ledger() });
    await vi.waitFor(async () => expect(await purposes()).toEqual([["verify", "main-model"]]));
  });

  it("records the skill-review fork as purpose=learn and the follow-on verifier as purpose=verify", async () => {
    const safety = { getGoals: async () => [], logEvent: async () => undefined } as unknown as KernelClient;
    await api.reviewAfterTurn({
      provider: provider(), safety, root: dataDir, transcript: [...transcript], toolIterations: 9, turnIndex: 1,
      env: { VANTA_SELF_IMPROVE: "1", VANTA_REVIEW_MIN_TOOLS: "1", VANTA_VERIFY: "1" }, ledger: ledger(),
    });
    await vi.waitFor(async () => expect((await purposes()).map(([p]) => p).sort()).toEqual(["learn", "verify"]));
  });

  it("falls back to the main model with a warning when the configured fork route is unreachable", async () => {
    const env = { VANTA_PROVIDER: "ollama", VANTA_MODEL: "main-model", VANTA_MODEL_LEARN: "cheap-model", VANTA_OLLAMA_URL: "http://127.0.0.1:9/v1" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await api.brainLearnAfterTurn({ provider: provider(), transcript, toolIterations: 9, turnIndex: 1, env, ledger: ledger() });
    const lines = warn.mock.calls.map((c) => String(c[0]));
    warn.mockRestore();
    expect(lines.some((l) => l.includes("VANTA_MODEL_LEARN=cheap-model") && l.includes("Fix or unset"))).toBe(true);
    expect((await listRouteUsage(dataDir)).map((r) => [r.purpose, r.model, r.fallbackDepth])).toEqual([["learn", "main-model", 1]]);
  });
});
