import type { ReplCtx, SlashHandler } from "./types.js";

// ND-TIME-RANGES — counter time-blindness: an effort estimate is ALWAYS a
// best/realistic/worst range with named hidden costs (never a single point), and
// the session surfaces elapsed + time-since-last-action. Pure formatters + a
// /time command. The estimate-range shape mirrors the outside-view correction
// (best ≈ 0.6× the naive guess, worst ≈ 2×).

export type EstimateRange = { best: number; realistic: number; worst: number };

/** Derive a best/realistic/worst range (minutes) from a naive realistic guess.
 * best = 0.6×, worst = 2× — the planning-fallacy correction. Pure. */
export function estimateRange(realisticMinutes: number): EstimateRange {
  const r = Math.max(1, Math.round(realisticMinutes));
  return { best: Math.max(1, Math.round(r * 0.6)), realistic: r, worst: Math.round(r * 2) };
}

/** Format a duration in minutes as "45m" / "1h 12m" / "2h". Pure. */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

/**
 * Format an effort estimate as a range with named hidden costs — the ND-TIME-
 * RANGES contract: never a single point. Pure. */
export function formatEstimateRange(realisticMinutes: number, hiddenCosts: string[] = []): string {
  const { best, realistic, worst } = estimateRange(realisticMinutes);
  const costs = hiddenCosts.length ? ` · watch: ${hiddenCosts.join(", ")}` : "";
  return `best ${formatMinutes(best)} / realistic ${formatMinutes(realistic)} / worst ${formatMinutes(worst)}${costs}`;
}

/** Format a millisecond span as "12m" / "1h 3m" / "8s". Pure. */
export function formatSpan(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  return formatMinutes(s / 60);
}

/** The session's elapsed + since-last-action line. `lastActionMs` null → no since-last. Pure. */
export function sessionTimes(startedMs: number, lastActionMs: number | null, now: number): string {
  const elapsed = `elapsed ${formatSpan(now - startedMs)}`;
  const since = lastActionMs === null ? "" : ` · ${formatSpan(now - lastActionMs)} since last action`;
  return `${elapsed}${since}`;
}

/** `/time` — show the session's elapsed time (and since-last when known). */
export const time: SlashHandler = async (_arg, ctx: ReplCtx) => {
  const startedMs = Date.parse(ctx.state.started) || ctx.now().getTime();
  const last = ctx.state.lastActionAt ? Date.parse(ctx.state.lastActionAt) : null;
  return { output: sessionTimes(startedMs, Number.isNaN(last as number) ? null : last, ctx.now().getTime()) };
};
