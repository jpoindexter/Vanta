import type { EvolveIteration } from "./types.js";

// AHE-REGRESSION-FORESIGHT — the AHE paper's #1 open problem: the evolve loop
// predicts FIXES well but is blind to REGRESSIONS, causing non-monotone
// evolution. Before an edit is committed, predict the tasks it's most likely to
// BREAK, from the journal's history: a task is at-risk if past edits regressed
// it, weighted UP when those edits had a similar scope (overlapping predicted
// fixes) to the edit now being proposed. Pure; backtestable offline on a journal.

export type AtRisk = { id: string; score: number; reason: string };

const overlaps = (a: string[], b: string[]): boolean => {
  const set = new Set(a);
  return b.some((x) => set.has(x));
};

/**
 * Rank tasks most at risk of regressing from an edit whose predicted fixes are
 * `predictedFix`, using prior iterations `history`. Scope-matched regressions
 * (an edit that targeted overlapping tasks and broke this one) weigh 2×; any
 * historical regression weighs 1×. Top `k`, descending. Pure. */
export function predictAtRisk(history: EvolveIteration[], predictedFix: string[], k = 5): AtRisk[] {
  const base = new Map<string, number>();
  const scoped = new Map<string, number>();
  for (const it of history) {
    const sameScope = overlaps(it.predictedFix, predictedFix);
    for (const id of it.regressions) {
      base.set(id, (base.get(id) ?? 0) + 1);
      if (sameScope) scoped.set(id, (scoped.get(id) ?? 0) + 1);
    }
  }
  const ids = [...base.keys()];
  return ids
    .map((id) => {
      const s = (scoped.get(id) ?? 0), b = base.get(id) ?? 0;
      const reason = s > 0 ? `regressed ${s}× under similar edits` : `regressed ${b}× historically`;
      return { id, score: 2 * s + b, reason };
    })
    .sort((a, z) => z.score - a.score || a.id.localeCompare(z.id))
    .slice(0, k);
}

/** Frequency-only baseline: the k most-often-regressed tasks, ignoring edit scope. */
function baselineAtRisk(history: EvolveIteration[], k: number): string[] {
  const freq = new Map<string, number>();
  for (const it of history) for (const id of it.regressions) freq.set(id, (freq.get(id) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, k).map(([id]) => id);
}

/** Fraction of `actual` present in `predicted`. */
function recall(predicted: string[], actual: string[]): number {
  if (actual.length === 0) return 1;
  const set = new Set(predicted);
  return actual.filter((id) => set.has(id)).length / actual.length;
}

export type ForesightBacktest = {
  /** Mean regression-recall of the scope-aware foresight over scored iterations. */
  foresightRecall: number;
  /** Mean regression-recall of the frequency-only baseline. */
  baselineRecall: number;
  /** Iterations that actually had regressions (the ones foresight is scored on). */
  scored: number;
  /** Did foresight beat the baseline? */
  beatsBaseline: boolean;
  /** Is the kept-best-score curve monotone non-decreasing (the loop's goal)? */
  monotone: boolean;
};

/**
 * Backtest regression-foresight over a completed journal: for each iteration
 * that regressed a task, predict at-risk tasks from ONLY the prior iterations (+
 * that edit's predicted fixes) and measure recall against what actually
 * regressed — compared to the frequency-only baseline. Also reports whether the
 * best-score curve was monotone (evolution didn't go backwards). Pure. */
export function backtestRegressionRecall(journal: EvolveIteration[], k = 5): ForesightBacktest {
  let fSum = 0, bSum = 0, scored = 0;
  for (let i = 0; i < journal.length; i++) {
    const it = journal[i]!;
    if (it.regressions.length === 0) continue;
    const history = journal.slice(0, i);
    fSum += recall(predictAtRisk(history, it.predictedFix, k).map((r) => r.id), it.regressions);
    bSum += recall(baselineAtRisk(history, k), it.regressions);
    scored++;
  }
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  const foresightRecall = scored ? round(fSum / scored) : 0;
  const baselineRecall = scored ? round(bSum / scored) : 0;
  return { foresightRecall, baselineRecall, scored, beatsBaseline: foresightRecall > baselineRecall, monotone: isMonotone(journal) };
}

/** The running best score (kept edits raise it, reverts hold) never decreases. */
function isMonotone(journal: EvolveIteration[]): boolean {
  let best = -Infinity;
  for (const it of journal) {
    const after = it.kept ? it.after : it.before; // a reverted edit holds the prior best
    if (after < best) return false;
    best = Math.max(best, after);
  }
  return true;
}

/** Render the at-risk set the loop emits before committing an edit. Pure. */
export function formatAtRisk(risk: AtRisk[]): string {
  if (risk.length === 0) return "  regression foresight: no at-risk tasks predicted (clean history)";
  return ["  ⚠ regression foresight — tasks this edit may break:", ...risk.map((r) => `    · ${r.id} (${r.reason})`)].join("\n");
}
