import { describe, it, expect } from "vitest";
import { computeCng, decideFlip, reportObservations, formatVerdict, MIN_FLIP_OBSERVATIONS } from "./compress-cng.js";
import type { EvalReport } from "./types.js";

// Fabricated reports — the CNG math is pure, so we feed it fake baseline/treatment
// results and assert the verdict + flip decision directly (no agent, no provider).

function report(o: { passAt1: number; outputTokens: number; runs?: number; tasks?: number }): EvalReport {
  const tasks = o.tasks ?? 1;
  const runs = o.runs ?? 2;
  const results = Array.from({ length: tasks }, (_, i) => ({ id: `t${i}`, pass: true, passes: runs, runs, detail: "", outputTokens: Math.round(o.outputTokens / tasks) }));
  return { total: tasks, passed: tasks, passAt1: o.passAt1, outputTokens: o.outputTokens, results };
}

describe("computeCng", () => {
  it("is net-positive when tokens drop and pass@1 holds", () => {
    const v = computeCng(report({ passAt1: 100, outputTokens: 1000 }), report({ passAt1: 100, outputTokens: 700 }));
    expect(v.tokensSaved).toBe(300);
    expect(v.passDelta).toBe(0);
    expect(v.netPositive).toBe(true);
  });

  it("is net-positive when tokens drop and pass@1 IMPROVES", () => {
    const v = computeCng(report({ passAt1: 80, outputTokens: 1000 }), report({ passAt1: 90, outputTokens: 800 }));
    expect(v.tokensSaved).toBe(200);
    expect(v.passDelta).toBe(10);
    expect(v.netPositive).toBe(true);
  });

  it("is NOT net-positive when pass@1 regresses even if tokens drop", () => {
    const v = computeCng(report({ passAt1: 100, outputTokens: 1000 }), report({ passAt1: 90, outputTokens: 600 }));
    expect(v.tokensSaved).toBe(400);
    expect(v.passDelta).toBe(-10);
    expect(v.netPositive).toBe(false);
  });

  it("is NOT net-positive when tokens do not drop", () => {
    const v = computeCng(report({ passAt1: 100, outputTokens: 1000 }), report({ passAt1: 100, outputTokens: 1000 }));
    expect(v.tokensSaved).toBe(0);
    expect(v.netPositive).toBe(false);
  });

  it("rounds passDelta to one decimal", () => {
    const v = computeCng(report({ passAt1: 33.3, outputTokens: 100 }), report({ passAt1: 66.7, outputTokens: 80 }));
    expect(v.passDelta).toBe(33.4);
  });
});

describe("reportObservations", () => {
  it("sums rollouts across tasks", () => {
    expect(reportObservations(report({ passAt1: 100, outputTokens: 10, tasks: 3, runs: 2 }))).toBe(6);
  });
});

describe("decideFlip", () => {
  const okVerdict = { tokensSaved: 300, passDelta: 0, netPositive: true };

  it("flips ON when net-positive AND signal is sufficient", () => {
    const d = decideFlip("prune", okVerdict, MIN_FLIP_OBSERVATIONS);
    expect(d.flip).toBe(true);
    expect(d.reason).toContain("net-positive");
  });

  it("does NOT flip on an insufficient signal, even when net-positive", () => {
    const d = decideFlip("prune", okVerdict, MIN_FLIP_OBSERVATIONS - 1);
    expect(d.flip).toBe(false);
    expect(d.reason).toContain("insufficient signal");
  });

  it("does NOT flip when not net-positive (token loss)", () => {
    const d = decideFlip("prune", { tokensSaved: 0, passDelta: 0, netPositive: false }, 100);
    expect(d.flip).toBe(false);
    expect(d.reason).toContain("no token saving");
  });

  it("does NOT flip when pass@1 regressed", () => {
    const d = decideFlip("prune", { tokensSaved: 500, passDelta: -10, netPositive: false }, 100);
    expect(d.flip).toBe(false);
    expect(d.reason).toContain("regressed");
  });
});

describe("formatVerdict", () => {
  it("renders a one-line verdict with the token + pass deltas", () => {
    const line = formatVerdict({
      name: "skill-subset",
      baseline: report({ passAt1: 100, outputTokens: 1000 }),
      treatment: report({ passAt1: 100, outputTokens: 700 }),
      verdict: { tokensSaved: 300, passDelta: 0, netPositive: true },
    });
    expect(line).toContain("skill-subset");
    expect(line).toContain("+300 saved");
    expect(line).toContain("100% → 100%");
    expect(line).toContain("net-positive");
  });
});
