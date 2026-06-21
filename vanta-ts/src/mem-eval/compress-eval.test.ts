import { describe, it, expect } from "vitest";
import {
  buildControlTreatment,
  computeCNG,
  runCompressEvalCase,
  aggregateCompressEval,
  formatCompressEvalReport,
  type CompressEvalCase,
  type CompressEvalResult,
} from "./compress-eval.js";

// A long fixture text so estTokens differences are meaningful, with a fact to recall.
const TEXT =
  "The deploy ran at 14:03. " +
  "padding padding padding padding padding padding padding padding. ".repeat(20) +
  "The server returned status code 500 for /api/checkout. " +
  "padding padding padding padding padding padding padding padding. ".repeat(20);

const CASE: CompressEvalCase = {
  id: "c1",
  text: TEXT,
  question: "What status code did /api/checkout return?",
  expectedAnswer: "500",
  dim: "log",
};

/** A real compressor: drops the filler, keeps the answer-bearing lines. */
const goodCompress = (t: string): string =>
  t
    .split(". ")
    .filter((s) => !s.startsWith("padding"))
    .join(". ");

/** A no-op compressor: returns the input unchanged. */
const noopCompress = (t: string): string => t;

/** A harmful compressor: shrinks a lot but strips the answer-bearing line. */
const harmfulCompress = (t: string): string =>
  t
    .split(". ")
    .filter((s) => !s.includes("status code") && !s.startsWith("padding"))
    .join(". ");

describe("buildControlTreatment", () => {
  it("reports tokensSavedRatio > 0 when the compressed text is shorter", () => {
    const ct = buildControlTreatment(CASE, goodCompress);
    expect(ct.control).toBe(TEXT);
    expect(ct.treatmentTokens).toBeLessThan(ct.controlTokens);
    expect(ct.tokensSavedRatio).toBeGreaterThan(0);
    expect(ct.tokensSavedRatio).toBeLessThanOrEqual(1);
  });

  it("reports ~0 saved for a no-op compression", () => {
    const ct = buildControlTreatment(CASE, noopCompress);
    expect(ct.treatment).toBe(ct.control);
    expect(ct.tokensSavedRatio).toBe(0);
  });

  it("clamps to 0 when the compression GREW the text (never negative)", () => {
    const grow = (t: string): string => t + t;
    const ct = buildControlTreatment(CASE, grow);
    expect(ct.tokensSavedRatio).toBe(0);
  });
});

describe("computeCNG", () => {
  it("is high when tokens-saved is high AND quality is high", () => {
    const cng = computeCNG(0.5, 1.0);
    expect(cng).toBeCloseTo(0.5, 5);
    expect(cng).toBeGreaterThan(0.4);
  });

  it("is low/negative when tokens-saved is high but quality is LOW", () => {
    const cng = computeCNG(0.5, 0.1);
    expect(cng).toBeLessThan(0);
  });

  it("is ~0 when nothing was saved, regardless of quality", () => {
    expect(computeCNG(0, 1)).toBe(0);
    expect(computeCNG(0, 0)).toBe(0);
  });

  it("rewards a token win that keeps quality over one that destroys it", () => {
    expect(computeCNG(0.5, 1.0)).toBeGreaterThan(computeCNG(0.5, 0.1));
  });

  it("clamps out-of-range inputs instead of producing nonsense", () => {
    expect(computeCNG(2, 2)).toBe(computeCNG(1, 1));
    expect(computeCNG(-1, 0.5)).toBe(0);
  });
});

describe("runCompressEvalCase", () => {
  /** Deterministic judge: 1.0 only if the expected answer survives in the text. */
  const factJudge = (_q: string, expected: string, fromText: string): Promise<number> =>
    Promise.resolve(fromText.includes(expected) ? 1 : 0);

  it("judges from the TREATMENT text and yields a high CNG when the answer survives", async () => {
    const r = await runCompressEvalCase(CASE, { compress: goodCompress, judge: factJudge });
    expect(r.id).toBe("c1");
    expect(r.tokensSavedRatio).toBeGreaterThan(0);
    expect(r.qualityRetained).toBe(1);
    expect(r.cng).toBeGreaterThan(0);
  });

  it("catches a HARMFUL compression: answer dropped → low quality → negative CNG", async () => {
    const r = await runCompressEvalCase(CASE, { compress: harmfulCompress, judge: factJudge });
    expect(r.tokensSavedRatio).toBeGreaterThan(0);
    expect(r.qualityRetained).toBe(0);
    expect(r.cng).toBeLessThan(0);
  });

  it("is repeatable: same case + same deps → identical result", async () => {
    const deps = { compress: goodCompress, judge: factJudge };
    const a = await runCompressEvalCase(CASE, deps);
    const b = await runCompressEvalCase(CASE, deps);
    expect(a).toEqual(b);
  });

  it("clamps an out-of-range judge score", async () => {
    const r = await runCompressEvalCase(CASE, {
      compress: goodCompress,
      judge: () => Promise.resolve(99),
    });
    expect(r.qualityRetained).toBe(1);
  });
});

describe("aggregateCompressEval", () => {
  const results: CompressEvalResult[] = [
    { id: "ok", tokensSavedRatio: 0.5, qualityRetained: 1, cng: 0.5 },
    { id: "meh", tokensSavedRatio: 0.2, qualityRetained: 0.8, cng: 0.16 },
    { id: "bad", tokensSavedRatio: 0.6, qualityRetained: 0.1, cng: -0.3 },
  ];

  it("means the three metrics and lists harmful (cng<0) ids", () => {
    const agg = aggregateCompressEval(results);
    expect(agg.meanCNG).toBeCloseTo(0.12, 2);
    expect(agg.meanTokensSaved).toBeCloseTo(0.433, 2);
    expect(agg.meanQuality).toBeCloseTo(0.633, 2);
    expect(agg.harmful).toEqual(["bad"]);
  });

  it("returns an empty harmful list when nothing regressed", () => {
    const agg = aggregateCompressEval(results.slice(0, 2));
    expect(agg.harmful).toEqual([]);
  });

  it("handles an empty result set without dividing by zero", () => {
    const agg = aggregateCompressEval([]);
    expect(agg.meanCNG).toBe(0);
    expect(agg.harmful).toEqual([]);
  });
});

describe("formatCompressEvalReport", () => {
  it("renders the CNG headline, percentages, and a 'none' harmful line when clean", () => {
    const out = formatCompressEvalReport(aggregateCompressEval([
      { id: "ok", tokensSavedRatio: 0.5, qualityRetained: 1, cng: 0.5 },
    ]));
    expect(out).toContain("CNG");
    expect(out).toContain("50.0%");
    expect(out).toContain("none");
  });

  it("lists harmful ids when a compression regressed", () => {
    const out = formatCompressEvalReport(aggregateCompressEval([
      { id: "bad", tokensSavedRatio: 0.6, qualityRetained: 0.1, cng: -0.3 },
    ]));
    expect(out).toContain("bad");
  });
});
