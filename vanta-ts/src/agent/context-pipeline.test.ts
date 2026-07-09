import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LLMProvider, ToolSchema } from "../providers/interface.js";
import type { Message } from "../types.js";

const mockGraduatedCompaction = vi.hoisted(() => vi.fn());

vi.mock("../context/graduated-compaction.js", () => ({
  graduatedCompaction: mockGraduatedCompaction,
}));

import {
  isContextLengthError,
  persistCompaction,
  prepareCallMessages,
  resetSavingsHistory,
  resolveCompactThresholdPct,
} from "./context-pipeline.js";

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
  // The savings-history WeakMap is keyed by the (shared) MESSAGES array and
  // persists across tests in this file — clear it so the anti-thrash gate starts
  // empty (and `shouldCompact` returns true) for each test.
  resetSavingsHistory(MESSAGES);
  // A healthy pass: 1000 → 500 tokens = 50% savings (>10%), so the gate stays open.
  mockGraduatedCompaction.mockResolvedValue({ messages: MESSAGES, layers: [], beforeTokens: 1_000, afterTokens: 500 });
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

describe("prepareCallMessages — anti-thrash gate", () => {
  // A private conversation array so this block owns its savings history.
  const convo: Message[] = [{ role: "user", content: "thrash" }];
  const deps = { provider: makeProvider(), root: "/tmp", currentTools: TOOLS };

  function mockSavings(beforeTokens: number, afterTokens: number): void {
    mockGraduatedCompaction.mockResolvedValue({ messages: convo, layers: [], beforeTokens, afterTokens });
  }

  beforeEach(() => {
    resetSavingsHistory(convo);
  });

  it("runs compaction on the first pass when no savings history exists", async () => {
    // Arrange: empty history → shouldCompact() returns true.
    mockSavings(1_000, 100); // 90% — healthy

    // Act
    await prepareCallMessages(convo, deps, 2, IDLE_TC);

    // Assert: the default/empty-history path keeps the prior behavior — it runs.
    expect(mockGraduatedCompaction).toHaveBeenCalledOnce();
  });

  it("skips the next pass after two consecutive sub-10% passes", async () => {
    // Arrange: two passes each saving < 10% (1000 → 990 = 1%).
    mockSavings(1_000, 990);
    await prepareCallMessages(convo, deps, 2, IDLE_TC); // pass 1 (low)
    await prepareCallMessages(convo, deps, 2, IDLE_TC); // pass 2 (low)
    expect(mockGraduatedCompaction).toHaveBeenCalledTimes(2);

    // Act: a third call — the gate window is now two low-savings passes.
    await prepareCallMessages(convo, deps, 2, IDLE_TC);

    // Assert: the pass is skipped (the compactor is NOT invoked again).
    expect(mockGraduatedCompaction).toHaveBeenCalledTimes(2);
  });

  it("keeps running compaction while savings stay healthy", async () => {
    // Arrange: every pass saves > 10% (1000 → 500 = 50%).
    mockSavings(1_000, 500);

    // Act: three healthy passes back to back.
    await prepareCallMessages(convo, deps, 2, IDLE_TC);
    await prepareCallMessages(convo, deps, 2, IDLE_TC);
    await prepareCallMessages(convo, deps, 2, IDLE_TC);

    // Assert: a healthy window never trips the gate — behavior unchanged.
    expect(mockGraduatedCompaction).toHaveBeenCalledTimes(3);
  });

  it("does not skip when only one of the last two passes is low-savings", async () => {
    // Arrange: a low pass followed by a healthy pass — the window is mixed.
    mockSavings(1_000, 990); // 1% — low
    await prepareCallMessages(convo, deps, 2, IDLE_TC);
    mockSavings(1_000, 400); // 60% — healthy
    await prepareCallMessages(convo, deps, 2, IDLE_TC);
    expect(mockGraduatedCompaction).toHaveBeenCalledTimes(2);

    // Act: the trailing window is [low, healthy] → not all below the floor.
    mockSavings(1_000, 400);
    await prepareCallMessages(convo, deps, 2, IDLE_TC);

    // Assert: the pass still runs.
    expect(mockGraduatedCompaction).toHaveBeenCalledTimes(3);
  });

  it("returns the shaped messages unchanged when a pass is skipped", async () => {
    // Arrange: drive two low passes so the next is skipped.
    mockSavings(1_000, 995);
    await prepareCallMessages(convo, deps, 2, IDLE_TC);
    await prepareCallMessages(convo, deps, 2, IDLE_TC);
    mockGraduatedCompaction.mockClear();

    // Act: the skipped pass returns without calling the compactor.
    const out = await prepareCallMessages(convo, deps, 2, IDLE_TC);

    // Assert: no compaction ran, and the call still resolves with a message list.
    expect(mockGraduatedCompaction).not.toHaveBeenCalled();
    expect(out).toEqual(convo);
  });
});

describe("persistCompaction — visible compaction state", () => {
  it("sets compacting true before summarizing and false after the pass", async () => {
    const messages: Message[] = [
      { role: "system", content: "sys" },
      ...Array.from({ length: 12 }, (_, i): Message => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `message ${i} ${"x".repeat(120)}`,
      })),
    ];
    const events: boolean[] = [];
    const summaryEvents: boolean[][] = [];

    await persistCompaction(messages, {
      provider: { ...makeProvider(), contextWindow: () => 100 },
      root: mkdtempSync(join(tmpdir(), "vanta-compact-state-")),
      summarize: async () => {
        summaryEvents.push([...events]);
        return "short summary";
      },
      onCompacting: (active) => events.push(active),
    });

    expect(summaryEvents[0]).toEqual([true]);
    expect(events).toEqual([true, false]);
  });
});
