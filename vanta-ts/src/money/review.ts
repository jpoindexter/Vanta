import type { MoneyRecord, Revenue, Prospect } from "./store.js";
import { latestProspects } from "./store.js";

// Pure pricing-suggestion + weekly-review helpers for the Money OS.
// No I/O; `now` is always passed in so these are deterministic.

/** A three-band price suggestion derived from comparable prices. */
export type PriceSuggestion = {
  low: number;
  median: number;
  high: number;
  note: string;
};

/** Weekly revenue + open pipeline snapshot. */
export type WeeklyReview = {
  revenueThisWeek: number;
  pipelineValue: number;
  topProspect: string | null;
  newOffersThisWeek: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Median of a sorted array (index based). */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

/**
 * Suggest a price band from comparable prices.
 * Pure + deterministic. Handles empty comparables gracefully.
 */
export function suggestPrice(input: { offer: string; comparables: number[] }): PriceSuggestion {
  const { offer, comparables } = input;
  if (comparables.length === 0) {
    return {
      low: 0,
      median: 0,
      high: 0,
      note: `No comparables provided for "${offer}". Add real market comps to get a useful band.`,
    };
  }
  const sorted = [...comparables].sort((a, b) => a - b);
  const med = median(sorted);
  const low = sorted[0]!;
  const high = sorted[sorted.length - 1]!;
  return {
    low,
    median: med,
    high,
    note: `Price band for "${offer}" from ${comparables.length} comparable(s): low=$${low} / median=$${med} / high=$${high}.`,
  };
}

function isRevenue(r: MoneyRecord): r is Revenue {
  return r.kind === "revenue";
}

function isProspect(r: MoneyRecord): r is Prospect {
  return r.kind === "prospect";
}

function inWeek(ts: string, now: number): boolean {
  const t = new Date(ts).getTime();
  return !Number.isNaN(t) && now - t <= WEEK_MS && t <= now;
}

/** Estimate open pipeline value by counting non-won/lost prospects. */
function openPipelineValue(prospects: Prospect[]): number {
  return prospects.filter((p) => p.stage !== "won" && p.stage !== "lost").length;
}

/**
 * Compute the weekly review from store records.
 * Pure + deterministic; `now` is epoch ms injected by the caller.
 */
export function weeklyReview(records: MoneyRecord[], now: number): WeeklyReview {
  const weekRevenue = records
    .filter(isRevenue)
    .filter((r) => inWeek(r.ts, now))
    .reduce((sum, r) => sum + r.amount, 0);

  const prospects = latestProspects(records);
  const pipelineValue = openPipelineValue(prospects);

  const topProspect = prospects
    .filter((p) => p.stage !== "won" && p.stage !== "lost")
    .sort((a, b) => {
      const order: Record<string, number> = { booked: 0, replied: 1, contacted: 2, lead: 3 };
      return (order[a.stage] ?? 9) - (order[b.stage] ?? 9);
    })[0]?.name ?? null;

  const newOffersThisWeek = records
    .filter((r) => r.kind === "offer")
    .filter((r) => inWeek(r.ts, now))
    .length;

  return { revenueThisWeek: weekRevenue, pipelineValue, topProspect, newOffersThisWeek };
}
