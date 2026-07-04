import { describe, it, expect } from "vitest";
import { summarizeSpend, filterSpendSince, formatSpendBreakdown } from "./attribution.js";
import type { SpendEntry } from "./ledger.js";

function entry(o: Partial<SpendEntry> & { costUsd: number }): SpendEntry {
  return { ts: "2026-07-01T00:00:00.000Z", agent: "interactive", provider: "openai", model: "gpt-5", inputTokens: 0, outputTokens: 0, ...o };
}

describe("summarizeSpend", () => {
  it("rolls up total + all four attribution dimensions", () => {
    const entries: SpendEntry[] = [
      entry({ costUsd: 1, goal: 1, agent: "interactive", provider: "openai", model: "gpt-5" }),
      entry({ costUsd: 2, goal: 1, agent: "interactive", provider: "anthropic", model: "claude-sonnet" }),
      entry({ costUsd: 3, goal: 2, agent: "gateway", provider: "openai", model: "gpt-5" }),
    ];
    const s = summarizeSpend(entries);
    expect(s.totalUsd).toBe(6);
    expect(s.entries).toBe(3);
    expect(s.byGoal).toEqual({ "1": 3, "2": 3 });
    expect(s.byAgent).toEqual({ interactive: 3, gateway: 3 });
    expect(s.byProvider).toEqual({ openai: 4, anthropic: 2 });
    expect(s.byModel).toEqual({ "gpt-5": 4, "claude-sonnet": 2 });
  });

  it("groups a missing goal under a stable '(no goal)' bucket", () => {
    const s = summarizeSpend([entry({ costUsd: 1 }), entry({ costUsd: 2, goal: 5 })]);
    expect(s.byGoal).toEqual({ "(no goal)": 1, "5": 2 });
  });

  it("returns all-zero for an empty entry set", () => {
    expect(summarizeSpend([])).toEqual({ totalUsd: 0, entries: 0, byGoal: {}, byAgent: {}, byProvider: {}, byModel: {} });
  });
});

describe("filterSpendSince", () => {
  it("keeps only entries at/after the cutoff, inclusive", () => {
    const entries: SpendEntry[] = [
      entry({ costUsd: 1, ts: "2026-01-01T00:00:00.000Z" }),
      entry({ costUsd: 2, ts: "2026-06-01T00:00:00.000Z" }),
    ];
    const cutoff = Date.parse("2026-06-01T00:00:00.000Z");
    expect(filterSpendSince(entries, cutoff).map((e) => e.costUsd)).toEqual([2]);
    expect(filterSpendSince(entries, cutoff + 1)).toEqual([]);
    expect(filterSpendSince(entries, 0).map((e) => e.costUsd)).toEqual([1, 2]);
  });
});

describe("formatSpendBreakdown", () => {
  it("renders the total + each dimension, largest spend first", () => {
    const entries: SpendEntry[] = [
      entry({ costUsd: 1, goal: 1, agent: "interactive", provider: "openai", model: "gpt-5" }),
      entry({ costUsd: 5, goal: 2, agent: "gateway", provider: "anthropic", model: "claude-sonnet" }),
    ];
    const out = formatSpendBreakdown(summarizeSpend(entries));
    expect(out).toContain("Total: $6.00 across 2 priced turns");
    // The larger spend (gateway/anthropic/claude-sonnet, $5) sorts before the smaller ($1).
    const byAgentSection = out.slice(out.indexOf("By agent"));
    expect(byAgentSection.indexOf("gateway")).toBeLessThan(byAgentSection.indexOf("interactive"));
  });

  it("renders a clean empty-window message", () => {
    expect(formatSpendBreakdown(summarizeSpend([]))).toBe("No priced spend recorded for this window.");
  });
});
