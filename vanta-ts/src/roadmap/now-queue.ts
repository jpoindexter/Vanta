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

function priorityItems(items: RoadmapItem[]): RoadmapItem[] {
  return items.slice().sort((a, b) => {
    const byTier = tierRank(a.tier) - tierRank(b.tier);
    if (byTier !== 0) return byTier;
    const bySize = sizeRank(a.size) - sizeRank(b.size);
    if (bySize !== 0) return bySize;
    return a.id.localeCompare(b.id);
  });
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

function hiddenSuffix(label: string): string {
  if (label === "parked") return "review with `vanta roadmap unblock` before reviving";
  if (label === "needs decision") return "decide one before reviving";
  return "clear one first";
}

function parkedReason(item: RoadmapItem): string {
  return item.parkedReason ?? "review";
}

function parkedBreakdown(items: RoadmapItem[]): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(parkedReason(item), (counts.get(parkedReason(item)) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => `${reason} ${count}`)
    .join(" · ");
}

function formatTopItems(label: string, items: RoadmapItem[], limit = 3): string[] {
  if (items.length === 0) return [];
  const shown = priorityItems(items).slice(0, limit);
  const lines = [`${label}: ${items.length}`];
  if (label === "parked") lines.push(`  types: ${parkedBreakdown(items)}`);
  lines.push(...shown.map((item) => `- ${item.id} - ${item.title}`));
  const hidden = items.length - shown.length;
  if (hidden > 0) lines.push(`- (${hidden} more hidden - ${hiddenSuffix(label)})`);
  return lines;
}

/**
 * Explains why the Now queue is empty. This is the operator-facing dead-end
 * message for a fully drained local board: it names external blockers and
 * parked/strategy-only work instead of hiding behind "nothing to propose".
 */
export function formatNowEmptyState(items: RoadmapItem[]): string {
  const lines = ["nothing to propose"];
  const blocked = items.filter((i) => i.status === "blocked");
  const horizon = items.filter((i) => i.status === "horizon");
  const parked = items.filter((i) => i.status === "parked");
  lines.push(...formatTopItems("blocked", blocked));
  lines.push(...formatTopItems("parked", parked));
  lines.push(...formatTopItems("needs decision", horizon));
  if (lines.length === 1) return "nothing to propose";
  return lines.join("\n");
}
