import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LLMProvider, ToolSchema } from "../providers/interface.js";
import type { Message } from "../types.js";

const mockGraduatedCompaction = vi.hoisted(() => vi.fn());

vi.mock("../context/graduated-compaction.js", () => ({
  graduatedCompaction: mockGraduatedCompaction,
}));

import { isContextLengthError, prepareCallMessages, resolveCompactThresholdPct } from "./context-pipeline.js";

const MESSAGES: Message[] = [{ role: "user", content: "hello" }];
const TOOLS: ToolSchema[] = [{ name: "shell", description: "run", parameters: {} }];
const CONTEXT_WINDOW = 200_000;

function makeProvider(countResult?: number | Error): LLMProvider {
  const provider: LLMProvider = {
    complete: vi.fn() as LLMProvider["complete"],
    modelId: () => "test-model",
    contextWindow: () => CONTEXT_WINDOW,
  };
  if (countResult !== undefined) {
    provider.countTokens = async () => {
      if (countResult instanceof Error) throw countResult;
      return countResult;
    };
  }
  return provider;
}

const IDLE_TC = {
  idleMs: NaN,
  idleCfg: { thresholdMs: 3_600_000, keepRecent: 4 },
  trackedSummarize: undefined,
  thresholdPct: undefined,
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mockGraduatedCompaction.mockResolvedValue({ messages: MESSAGES, layers: [], beforeTokens: 0, afterTokens: 0 });
});

describe("resolveCompactThresholdPct", () => {
  it("returns undefined when env var is absent", () => {
    expect(resolveCompactThresholdPct({})).toBeUndefined();
  });

  it("converts the decimal env var to an integer percent", () => {
    expect(resolveCompactThresholdPct({ VANTA_AUTO_COMPACT_THRESHOLD: "0.85" })).toBe(85);
  });
});

describe("isContextLengthError", () => {
  it("detects common provider context-window failures", () => {
    expect(isContextLengthError(new Error("maximum context length exceeded"))).toBe(true);
    expect(isContextLengthError(new Error("prompt is too long"))).toBe(true);
    expect(isContextLengthError(new Error("network timeout"))).toBe(false);
  });
});

describe("prepareCallMessages — token counting", () => {
  it("passes overrideThresholdPct when exact count >= 80% of window", async () => {
    const exactCount = Math.round(CONTEXT_WINDOW * 0.85); // 85%
    const deps = { provider: makeProvider(exactCount), root: "/tmp", currentTools: TOOLS };

    await prepareCallMessages(MESSAGES, deps, 2, IDLE_TC);

    const callOpts = mockGraduatedCompaction.mock.calls[0]![1] as Record<string, unknown>;
    // pct = 85 → overrideThresholdPct = Math.min(85-5, 80) = 80
    expect(callOpts["thresholdPct"]).toBe(80);
  });

  it("does not override threshold when exact count < 80% of window", async () => {
    const exactCount = Math.round(CONTEXT_WINDOW * 0.50); // 50%
    const deps = { provider: makeProvider(exactCount), root: "/tmp", currentTools: TOOLS };

    await prepareCallMessages(MESSAGES, deps, 2, IDLE_TC);

    const callOpts = mockGraduatedCompaction.mock.calls[0]![1] as Record<string, unknown>;
    // tc.thresholdPct is undefined → passed straight through
    expect(callOpts["thresholdPct"]).toBeUndefined();
  });

  it("skips token counting when countTokens not implemented", async () => {
    const deps = { provider: makeProvider(), root: "/tmp", currentTools: TOOLS };

    await prepareCallMessages(MESSAGES, deps, 2, IDLE_TC);

    expect(mockGraduatedCompaction).toHaveBeenCalledOnce();
  });

  it("falls through to estimate when countTokens throws", async () => {
    const deps = { provider: makeProvider(new Error("API down")), root: "/tmp", currentTools: TOOLS };

    await expect(prepareCallMessages(MESSAGES, deps, 2, IDLE_TC)).resolves.toBeDefined();
  });

  it("skips token counting when currentTools is absent", async () => {
    const countSpy = vi.fn().mockResolvedValue(99_999);
    const provider = makeProvider();
    provider.countTokens = countSpy;
    const deps = { provider, root: "/tmp" }; // no currentTools

    await prepareCallMessages(MESSAGES, deps, 2, IDLE_TC);

    expect(countSpy).not.toHaveBeenCalled();
  });
});
