import { score, latestOpportunities, type Opportunity } from "./store.js";

// Slice 2: ranked scanning + offer drafting. Pure module — no I/O.

export type RankedOpportunity = Opportunity & { compositeScore: number };

/**
 * Sort opportunities by composite score (pain × buyer-signal) descending,
 * with recency (ts) as the tie-break. Deterministic. Pure.
 */
export function rankOpportunities(opps: Opportunity[]): RankedOpportunity[] {
  return latestOpportunities(opps)
    .map((o) => ({ ...o, compositeScore: score(o) }))
    .sort((a, b) => {
      const diff = b.compositeScore - a.compositeScore;
      if (diff !== 0) return diff;
      return b.ts.localeCompare(a.ts);
    });
}

/**
 * Draft a short templated offer pitch from a scored opportunity.
 * Format: problem → proposed solution → who it's for. Pure.
 */
export function draftOffer(opp: Opportunity): string {
  const audience = opp.source ? `buyers from ${opp.source}` : "the right buyer";
  const painLabel = opp.pain !== undefined ? ` (pain ${opp.pain.toFixed(1)})` : "";
  const problem = opp.note ?? opp.title;
  const lines = [
    `Offer draft for: ${opp.title}`,
    ``,
    `Problem${painLabel}: ${problem}`,
    `Solution: Address the core friction in "${opp.title}" with a focused, scoped engagement.`,
    `Audience: ${audience}`,
    ``,
    `Next step: validate with one paying customer before building.`,
  ];
  return lines.join("\n");
}
