import type { RoadmapItem, Tier } from "../roadmap/schema.js";

export const MAX_VISIBLE_CHOICES = 3;

const TIER_RANK: Record<Tier, number> = { sand: 0, pebble: 1, rock: 2 };
// Advisory size labels — smaller effort wins
const SIZE_RANK: Record<string, number> = { XS: 0, S: 1, M: 2, L: 3, XL: 4 };

function itemScore(item: RoadmapItem, index: number): number {
  const t = item.tier ? TIER_RANK[item.tier] : 1;
  const s = SIZE_RANK[item.size] ?? 2;
  return t * 100 + s * 10 + (index % 10); // index as a tiebreaker
}

/**
 * Return the top N items from a list, ranked by effort (sand < pebble < rock,
 * then size, then original order). Pure — no I/O.
 */
export function topNextItems(
  items: RoadmapItem[],
  n: number = MAX_VISIBLE_CHOICES,
): RoadmapItem[] {
  return [...items]
    .map((item, i) => ({ item, score: itemScore(item, i) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, n)
    .map(({ item }) => item);
}

/** True when the visible list was truncated (caller should note the hidden count). */
export function wasReduced(total: number): boolean {
  return total > MAX_VISIBLE_CHOICES;
}
