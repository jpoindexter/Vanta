import type { RoadmapItem, Tier } from "./schema.js";

// NOW-QUEUE — pure selection of the best 1-2 "next"-status items to move to
// "building". Ordering: tier rock > pebble > sand; within tier: size S > M > L;
// within size: id alphabetical. Respects WIP limit (remaining-capacity semantics).

const TIER_RANK: Record<Tier, number> = { rock: 0, pebble: 1, sand: 2 };
const SIZE_RANK: Record<string, number> = { S: 0, M: 1, L: 2 };

function tierRank(t: Tier | undefined): number {
  return t !== undefined ? (TIER_RANK[t] ?? 3) : 3;
}

function sizeRank(s: string): number {
  return SIZE_RANK[s] ?? 3;
}

/**
 * Picks the best next items to move to "building".
 * - Only considers items with status === "next".
 * - Respects remaining WIP capacity: slots = wipLimit - buildingCount.
 *   If slots ≤ 0, returns [].
 * - Ordering: tier rock < pebble < sand; within tier: S < M < L; within size: id asc.
 */
export function selectNowCandidates(items: RoadmapItem[], wipLimit = 2): RoadmapItem[] {
  const buildingCount = items.filter((i) => i.status === "building").length;
  const slots = wipLimit - buildingCount;
  if (slots <= 0) return [];

  const candidates = items
    .filter((i) => i.status === "next")
    .slice()
    .sort((a, b) => {
      const byTier = tierRank(a.tier) - tierRank(b.tier);
      if (byTier !== 0) return byTier;
      const bySize = sizeRank(a.size) - sizeRank(b.size);
      if (bySize !== 0) return bySize;
      return a.id.localeCompare(b.id);
    });

  return candidates.slice(0, slots);
}

/**
 * Formats a human-readable proposal for the selected candidates.
 * Returns "nothing to propose" when the list is empty.
 */
export function formatNowQueue(candidates: RoadmapItem[]): string {
  if (candidates.length === 0) return "nothing to propose";
  return candidates
    .map((c) => {
      const tier = c.tier ?? "—";
      return `Move to Now: ${c.id} — ${c.title} (${tier}/${c.size})`;
    })
    .join("\n");
}
