import { describe, it, expect } from "vitest";
import { classifyTrend, computeRecursionMetrics, formatRecursionMetrics } from "./recursion-metrics.js";
import type { EvolveIteration } from "./types.js";

// ASI-RECURSION-METRICS — observable self-evolve returns.

const iter = (o: Partial<EvolveIteration> & { iter: number; before: number; after: number; kept: boolean }): EvolveIteration => ({
  predictedFix: [], actualFix: [], regressions: [], predictionPrecision: 0, note: "", ...o,
});

describe("classifyTrend", () => {
  it("rising marginal lifts → compounding", () => {
    expect(classifyTrend([1, 2, 5, 8])).toBe("compounding");
  });
  it("falling marginal lifts toward 0 → tapering", () => {
    expect(classifyTrend([8, 6, 2, 1])).toBe("tapering");
  });
  it("steady lifts → flat", () => {
    expect(classifyTrend([3, 3, 3, 3])).toBe("flat");
  });
  it("fewer than two points → insufficient", () => {
    expect(classifyTrend([5])).toBe("insufficient");
    expect(classifyTrend([])).toBe("insufficient");
  });
});

describe("computeRecursionMetrics", () => {
  const iterations = [
    iter({ iter: 1, before: 40, after: 50, kept: true, spendUsd: 0.2, humanInLoop: false }),
    iter({ iter: 2, before: 50, after: 48, kept: false, spendUsd: 0.3, humanInLoop: true }), // reverted
    iter({ iter: 3, before: 50, after: 62, kept: true, spendUsd: 0.5, humanInLoop: false }),
  ];

  it("computes lift-vs-baseline and marginal lift per iteration", () => {
    const m = computeRecursionMetrics(40, iterations);
    expect(m.perIter[0]).toMatchObject({ liftVsBaseline: 10, marginalLift: 10, kept: true });
    expect(m.perIter[2]).toMatchObject({ liftVsBaseline: 22, marginalLift: 12, kept: true });
    expect(m.final).toBe(62);
  });

  it("computes human-in-loop ratio and total spend + efficiency", () => {
    const m = computeRecursionMetrics(40, iterations);
    expect(m.humanInLoopRatio).toBeCloseTo(1 / 3);
    expect(m.totalSpendUsd).toBeCloseTo(1.0);
    expect(m.liftPerUsd).toBeCloseTo(22); // (62-40)/1.0
  });

  it("liftPerUsd is null when no spend was recorded (honest, not a divide-by-zero)", () => {
    const m = computeRecursionMetrics(40, [iter({ iter: 1, before: 40, after: 45, kept: true })]);
    expect(m.liftPerUsd).toBeNull();
    expect(m.humanInLoopRatio).toBe(0); // absent humanInLoop → autonomous
  });

  it("classifies the kept-iterations trend", () => {
    // kept marginal lifts: [10, 12] → later ≥ earlier → compounding
    expect(computeRecursionMetrics(40, iterations).trend).toBe("compounding");
  });
});

describe("formatRecursionMetrics", () => {
  it("renders the trend headline + per-iter rows", () => {
    const out = formatRecursionMetrics(computeRecursionMetrics(40, [iter({ iter: 1, before: 40, after: 50, kept: true, spendUsd: 0.2 })]));
    expect(out).toContain("recursion metrics");
    expect(out).toContain("baseline 40% → final 50%");
    expect(out).toContain("human-in-loop 0%");
  });
});
