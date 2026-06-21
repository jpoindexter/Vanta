import { estTokens } from "../compress/types.js";

// COMPRESSION-EVAL-RUNNER — does a compression dimension actually HELP, or does it
// quietly destroy the answer while looking like a token win? This eval answers that
// per fixture by running CONTROL (the original text) vs TREATMENT (the compressed
// text): it measures BOTH how many tokens the compression saved AND whether the
// answer survives — a question answered correctly from the (compressed) text. CNG
// (Compression Net Gain) weights tokens-saved by quality-kept, so a compression that
// saves 50% but loses the answer scores LOW/NEGATIVE while one that saves 50% with
// the answer intact scores HIGH. That asymmetry is the whole point: the eval catches
// harmful compression rather than rewarding raw token reduction.
//
// PURE + INJECTABLE: control/treatment construction, CNG, and aggregation are pure
// and fully unit-tested; the only impure boundary — the LLM quality judge — is
// injected, so the eval is repeatable/deterministic given a fixed judge (no
// Math.random, no Date.now). A real run injects `compressContent` + a live judge.

/** The compression dimensions an eval case targets (mirrors the router's content
 * classes plus the winnow prune pass). The dim is descriptive — the actual
 * compressor is INJECTED, so the eval never reaches into the compress layer. */
export type CompressDim = "json" | "log" | "text" | "winnow-prune";

/** One fixture: a text, a question whose answer lives in that text, the expected
 * answer, and the compression dimension under test. */
export interface CompressEvalCase {
  id: string;
  text: string;
  question: string;
  expectedAnswer: string;
  dim: CompressDim;
}

/** A compressor: original text → compressed text. Injected (the thing under test).
 * A no-op compressor returns its input unchanged → ~0 tokens saved. */
export type CompressFn = (text: string) => string;

/** The quality judge: did `fromText` support answering `question` with `expected`?
 * Returns 0..1 (1 = fully answerable, 0 = the answer is gone). INJECTED — the live
 * judge is an LLM; tests inject a deterministic stand-in. */
export type QualityJudge = (
  question: string,
  expected: string,
  fromText: string,
) => Promise<number>;

/** Dependencies for running one case: the compressor + the quality judge. Both are
 * injected so the runner is pure orchestration over real boundaries. */
export interface CompressEvalDeps {
  compress: CompressFn;
  judge: QualityJudge;
}

/** The CONTROL vs TREATMENT pair for one case, with token accounting. */
export interface ControlTreatment {
  /** The original, uncompressed text. */
  control: string;
  /** The compressed text (control run through the injected compressor). */
  treatment: string;
  controlTokens: number;
  treatmentTokens: number;
  /** (controlTokens − treatmentTokens) / controlTokens, clamped to [0,1].
   * 0 = nothing saved (no-op compression); 0.5 = the treatment is half the size. */
  tokensSavedRatio: number;
}

/** Per-case result: how much was saved, how much quality survived, and the CNG. */
export interface CompressEvalResult {
  id: string;
  tokensSavedRatio: number;
  /** 0..1 quality the judge read from the TREATMENT text. */
  qualityRetained: number;
  cng: number;
}

/** The aggregate report over many cases. */
export interface CompressEvalAggregate {
  meanCNG: number;
  meanTokensSaved: number;
  meanQuality: number;
  /** Ids of cases whose CNG went negative — the harmful compressions. */
  harmful: string[];
}

/** Below-this quality is treated as "the answer was lost" — CNG penalizes it hard. */
const QUALITY_FLOOR = 0.5;
/** How steeply low quality is penalized once it drops below the floor. */
const PENALTY_WEIGHT = 1.5;

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Build the CONTROL (original) / TREATMENT (compressed) pair for one case and
 * measure tokens on each via `estTokens`. PURE given `compress`.
 * - A compression that shrinks the text → tokensSavedRatio > 0.
 * - A no-op compression (treatment === control, or larger) → tokensSavedRatio ~0.
 */
export function buildControlTreatment(
  ec: CompressEvalCase,
  compress: CompressFn,
): ControlTreatment {
  const control = ec.text;
  const treatment = compress(control);
  const controlTokens = estTokens(control);
  const treatmentTokens = estTokens(treatment);
  const saved = controlTokens - treatmentTokens;
  const tokensSavedRatio = controlTokens > 0 ? clamp01(saved / controlTokens) : 0;
  return { control, treatment, controlTokens, treatmentTokens, tokensSavedRatio };
}

/**
 * CNG (Compression Net Gain) — tokens saved WEIGHTED by quality kept. PURE.
 *
 * Formula: `cng = tokensSavedRatio × qualityRetained − penalty`, where
 * `penalty = PENALTY_WEIGHT × tokensSavedRatio × max(0, QUALITY_FLOOR − qualityRetained)`.
 *
 * The shape this gives:
 * - high tokens-saved + high quality → high CNG (the win we want).
 * - high tokens-saved + LOW quality → low / NEGATIVE CNG: the penalty scales with how
 *   much was thrown away AND how far quality fell, so an aggressive compression that
 *   destroys the answer scores worse than doing nothing.
 * - zero tokens-saved → ~0 regardless of quality (nothing gained, nothing risked).
 */
export function computeCNG(tokensSavedRatio: number, qualityRetained: number): number {
  const saved = clamp01(tokensSavedRatio);
  const quality = clamp01(qualityRetained);
  const base = saved * quality;
  const penalty = PENALTY_WEIGHT * saved * Math.max(0, QUALITY_FLOOR - quality);
  return base - penalty;
}

/**
 * Run one eval case end-to-end: build control/treatment, judge the answer FROM the
 * TREATMENT text (the compressed view the agent would actually see), then compute
 * CNG. Repeatable/deterministic given a deterministic injected judge.
 */
export async function runCompressEvalCase(
  ec: CompressEvalCase,
  deps: CompressEvalDeps,
): Promise<CompressEvalResult> {
  const ct = buildControlTreatment(ec, deps.compress);
  const raw = await deps.judge(ec.question, ec.expectedAnswer, ct.treatment);
  const qualityRetained = clamp01(raw);
  const cng = computeCNG(ct.tokensSavedRatio, qualityRetained);
  return { id: ec.id, tokensSavedRatio: ct.tokensSavedRatio, qualityRetained, cng };
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/**
 * Aggregate per-case results into the report: mean CNG / tokens-saved / quality and
 * the `harmful` list (every case whose CNG went negative — a compression that hurt
 * more than it helped). PURE.
 */
export function aggregateCompressEval(
  results: CompressEvalResult[],
): CompressEvalAggregate {
  return {
    meanCNG: round(mean(results.map((r) => r.cng))),
    meanTokensSaved: round(mean(results.map((r) => r.tokensSavedRatio))),
    meanQuality: round(mean(results.map((r) => r.qualityRetained))),
    harmful: results.filter((r) => r.cng < 0).map((r) => r.id),
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** Render the aggregate as readable lines (the report surface a CLI would print). */
export function formatCompressEvalReport(agg: CompressEvalAggregate): string {
  const lines = [
    "compression eval — CNG (Compression Net Gain: tokens saved × quality kept)",
    "",
    `  mean CNG          ${agg.meanCNG.toFixed(3)}`,
    `  mean tokens saved ${pct(agg.meanTokensSaved)}`,
    `  mean quality kept ${pct(agg.meanQuality)}`,
    `  harmful (cng<0)   ${agg.harmful.length ? agg.harmful.join(", ") : "none"}`,
  ];
  return lines.join("\n");
}
