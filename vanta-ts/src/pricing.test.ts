import { describe, it, expect } from "vitest";
import { isLocalProvider, estimateCostUsd, formatUsd, formatTurnCost, addTurnCost, formatSessionCost } from "./pricing.js";

describe("isLocalProvider", () => {
  it("treats ollama/lmstudio as local, others as frontier", () => {
    expect(isLocalProvider("ollama")).toBe(true);
    expect(isLocalProvider("LMStudio")).toBe(true);
    expect(isLocalProvider("openai")).toBe(false);
    expect(isLocalProvider(undefined)).toBe(false);
  });
});

describe("estimateCostUsd", () => {
  it("prices a known model by in/out tokens", () => {
    // gpt-4o-mini: 0.15 in, 0.60 out per 1M
    expect(estimateCostUsd("gpt-4o-mini", 1_000_000, 0)).toBeCloseTo(0.15, 5);
    expect(estimateCostUsd("gpt-4o-mini", 0, 1_000_000)).toBeCloseTo(0.6, 5);
  });

  it("matches gpt-4o-mini before the broader gpt-4o entry", () => {
    expect(estimateCostUsd("gpt-4o-mini", 1_000_000, 0)).toBeCloseTo(0.15, 5);
    expect(estimateCostUsd("gpt-4o", 1_000_000, 0)).toBeCloseTo(2.5, 5);
  });

  it("returns null for an unpriced (local/unknown) model", () => {
    expect(estimateCostUsd("qwen2.5:14b", 1000, 1000)).toBeNull();
  });
});

describe("formatUsd / formatTurnCost", () => {
  it("shows sub-cent precision and a tokens+latency+cost footer", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.0004)).toBe("$0.0004");
    expect(formatUsd(1.5)).toBe("$1.50");
    const line = formatTurnCost(1200, 300, 1500, 0.0123);
    expect(line).toContain("1,200 in / 300 out");
    expect(line).toContain("1.5s");
    expect(line).toContain("$0.01");
  });

  it("renders ~? when the model is unpriced", () => {
    expect(formatTurnCost(1, 1, 1000, null)).toContain("~?");
  });
});

describe("addTurnCost / formatSessionCost", () => {
  it("splits local (free, counted) from frontier (metered)", () => {
    let c = addTurnCost(undefined, "ollama", null);     // local
    c = addTurnCost(c, "openai", 0.02);                  // frontier
    c = addTurnCost(c, "openai", 0.03);                  // frontier
    expect(c.localTurns).toBe(1);
    expect(c.frontierTurns).toBe(2);
    expect(c.frontierUsd).toBeCloseTo(0.05, 5);
    const line = formatSessionCost(c);
    expect(line).toContain("frontier $0.05");
    expect(line).toContain("local free (1 turn)");
  });

  it("reports no turns yet for an empty session", () => {
    expect(formatSessionCost(undefined)).toContain("no turns yet");
  });
});
