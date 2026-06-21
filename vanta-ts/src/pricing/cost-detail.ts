// VANTA-COST-TRACKER-DETAIL — a detailed per-MODEL session cost/usage tracker.
//
// Pure + immutable: accumulation (`addTurnUsage`/`addLinesChanged`/`addToolMs`)
// returns a NEW CostDetail and never mutates its input; rendering
// (`formatCostDetail`) is a pure formatter. Reuses the shipped cost estimator
// (`estimateCostUsd`) + USD formatter (`formatUsd`) from `../pricing.js` rather
// than re-deriving either.
//
// Per the card example, the render is one line per model + a totals line:
//   gpt-4o: 12k in / 3k out / 8k cached · 4.2s api · $0.04
//   total: 12k in / 3k out / 8k cached · 4.2s api + 0.0s tool · $0.04 · 0 lines
// Cache tokens are display-only (the estimator prices in/out); an empty tracker
// renders the minimal "no usage yet" view, mirroring usage-view's empty case.

import { estimateCostUsd, formatUsd } from "../pricing.js";

/** Accumulated token + API-time usage for ONE model across a session. */
export type ModelUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Cached input tokens — displayed, not separately priced. */
  cacheTokens: number;
  /** Provider API time in ms attributed to this model. */
  apiMs: number;
};

/** One turn's contribution; cache/api default to 0 when absent. */
export type TurnUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheTokens?: number;
  apiMs?: number;
};

/** The whole-session detailed tracker: per-model usage + cross-model totals. */
export type CostDetail = {
  byModel: Record<string, ModelUsage>;
  linesChanged: number;
  toolMs: number;
};

/** The minimal empty view — no usage on any axis yet. */
const EMPTY_VIEW = "  (no usage yet)";

/** A fresh, zeroed tracker. */
export function emptyCostDetail(): CostDetail {
  return { byModel: {}, linesChanged: 0, toolMs: 0 };
}

/** Fold one turn's usage into a model's running total. Pure (returns a new ModelUsage). */
function accumulateModel(prev: ModelUsage | undefined, turn: TurnUsage): ModelUsage {
  const base = prev ?? { model: turn.model, inputTokens: 0, outputTokens: 0, cacheTokens: 0, apiMs: 0 };
  return {
    model: turn.model,
    inputTokens: base.inputTokens + turn.inputTokens,
    outputTokens: base.outputTokens + turn.outputTokens,
    cacheTokens: base.cacheTokens + (turn.cacheTokens ?? 0),
    apiMs: base.apiMs + (turn.apiMs ?? 0),
  };
}

/**
 * Accumulate one turn's usage onto the tracker, keyed by model. Two turns on
 * the same model sum; different models stay separate. Never mutates `detail`.
 */
export function addTurnUsage(detail: CostDetail, turn: TurnUsage): CostDetail {
  const next = accumulateModel(detail.byModel[turn.model], turn);
  return { ...detail, byModel: { ...detail.byModel, [turn.model]: next } };
}

/** Add `n` changed lines to the session total. Never mutates `detail`. */
export function addLinesChanged(detail: CostDetail, n: number): CostDetail {
  return { ...detail, linesChanged: detail.linesChanged + n };
}

/** Add `ms` of tool execution time to the session total. Never mutates `detail`. */
export function addToolMs(detail: CostDetail, ms: number): CostDetail {
  return { ...detail, toolMs: detail.toolMs + ms };
}

/** Cost in USD for a model's accumulated usage (reuses the estimator), or null if unpriced. */
export function modelCostUsd(usage: ModelUsage): number | null {
  return estimateCostUsd(usage.model, usage.inputTokens, usage.outputTokens);
}

/** Compact token count: `12k` for ≥1000 (one decimal dropped when whole), else the raw number. */
function fmtTokens(n: number): string {
  if (n < 1000) return `${n}`;
  const k = n / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}

/** Seconds with one decimal, e.g. `4.2s`. */
function fmtSecs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** The token+cache fragment shared by per-model and totals lines. */
function tokensFragment(input: number, output: number, cache: number): string {
  return `${fmtTokens(input)} in / ${fmtTokens(output)} out / ${fmtTokens(cache)} cached`;
}

/** One per-model line: `model: 12k in / 3k out / 8k cached · 4.2s api · $0.04`. */
function modelLine(usage: ModelUsage): string {
  const cost = modelCostUsd(usage);
  const costStr = cost === null ? "~?" : formatUsd(cost);
  return `  ${usage.model}: ${tokensFragment(usage.inputTokens, usage.outputTokens, usage.cacheTokens)} · ${fmtSecs(usage.apiMs)} api · ${costStr}`;
}

/** Summed totals across every model, plus tool time + lines changed. */
type Totals = { input: number; output: number; cache: number; apiMs: number; cost: number; allPriced: boolean };

/** Fold all per-model usage into cross-model totals. */
function computeTotals(detail: CostDetail): Totals {
  const acc: Totals = { input: 0, output: 0, cache: 0, apiMs: 0, cost: 0, allPriced: true };
  for (const usage of Object.values(detail.byModel)) {
    acc.input += usage.inputTokens;
    acc.output += usage.outputTokens;
    acc.cache += usage.cacheTokens;
    acc.apiMs += usage.apiMs;
    const cost = modelCostUsd(usage);
    if (cost === null) acc.allPriced = false;
    else acc.cost += cost;
  }
  return acc;
}

/** The totals line: summed tokens · api+tool time · total $ · lines changed. */
function totalsLine(detail: CostDetail, t: Totals): string {
  const costStr = t.allPriced ? formatUsd(t.cost) : `${formatUsd(t.cost)}+~?`;
  const time = `${fmtSecs(t.apiMs)} api + ${fmtSecs(detail.toolMs)} tool`;
  const lines = `${detail.linesChanged} line${detail.linesChanged === 1 ? "" : "s"}`;
  return `  total: ${tokensFragment(t.input, t.output, t.cache)} · ${time} · ${costStr} · ${lines}`;
}

/**
 * Render the detailed breakdown: one line per model (highest input first, ties
 * alphabetical for determinism) + a totals line. An empty tracker → the minimal
 * "no usage yet" view. Pure — no I/O, no clock.
 */
export function formatCostDetail(detail: CostDetail): string {
  const models = Object.values(detail.byModel);
  if (models.length === 0) return EMPTY_VIEW;
  const sorted = [...models].sort((a, b) => b.inputTokens - a.inputTokens || a.model.localeCompare(b.model));
  const lines = sorted.map(modelLine);
  lines.push(totalsLine(detail, computeTotals(detail)));
  return lines.join("\n");
}
