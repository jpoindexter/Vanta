import type { RoadmapItem } from "./schema.js";

// ROADMAP-PRUNE — pure analysis of roadmap items for pruning candidates.
// No I/O: takes the already-parsed items array and returns ranked candidates.

export type PruneCandidate = {
  id: string;
  title: string;
  reason: string;
  confidence: "high" | "medium" | "low";
};

const CONFIDENCE_RANK: Record<PruneCandidate["confidence"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

// Detects literal placeholders: all-caps TBD/TODO (uppercase only — avoids
// matching "todo" as a common English noun in real card titles like
// "Live todo / progress checklist"), or the word "placeholder" (case-insensitive,
// since it never appears in a real card title as a content word).
const PLACEHOLDER_RE = /\bTBD\b|\bTODO\b|[Pp]laceholder/;

function buildTitlePrefixMap(items: RoadmapItem[]): Map<string, string[]> {
  const map: Map<string, string[]> = new Map();
  for (const item of items.filter((i) => i.status === "next")) {
    const key = item.title.slice(0, 30).toLowerCase();
    const existing = map.get(key) ?? [];
    existing.push(item.id);
    map.set(key, existing);
  }
  return map;
}

function checkThinSpec(item: RoadmapItem): PruneCandidate | null {
  if (item.status !== "next" || item.tier !== "sand") return null;
  if (item.summary && item.summary.trim().length >= 20) return null;
  return { id: item.id, title: item.title, reason: "thin spec, easy to drop", confidence: "medium" };
}

function checkPlaceholder(item: RoadmapItem): PruneCandidate | null {
  if (item.status !== "next" || !PLACEHOLDER_RE.test(item.title)) return null;
  return { id: item.id, title: item.title, reason: "placeholder card", confidence: "high" };
}

function checkDuplicate(item: RoadmapItem, prefixMap: Map<string, string[]>): PruneCandidate | null {
  if (item.status !== "next") return null;
  const key = item.title.slice(0, 30).toLowerCase();
  const group = prefixMap.get(key) ?? [];
  if (group.length <= 1 || group[0] !== item.id) return null;
  return {
    id: item.id,
    title: item.title,
    reason: `possible duplicate (same first-30-char prefix as: ${group.slice(1).join(", ")})`,
    confidence: "medium",
  };
}

function checkHorizonL(item: RoadmapItem): PruneCandidate | null {
  if (item.status !== "horizon" || item.size !== "L") return null;
  return { id: item.id, title: item.title, reason: "horizon L cards are aspirational, confirm still wanted", confidence: "low" };
}

export function pruneAnalysis(items: RoadmapItem[]): PruneCandidate[] {
  const prefixMap = buildTitlePrefixMap(items);
  const candidates: PruneCandidate[] = [];

  for (const item of items) {
    const hit =
      checkThinSpec(item) ??
      checkPlaceholder(item) ??
      checkDuplicate(item, prefixMap) ??
      checkHorizonL(item);
    if (hit) candidates.push(hit);
  }

  return candidates.sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]);
}

export function formatPruneReport(candidates: PruneCandidate[]): string {
  if (candidates.length === 0) {
    return "nothing to prune";
  }
  const header = `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} for pruning`;
  const lines = candidates.map(
    (c) => `  [${c.confidence}] ${c.id} — ${c.reason}`,
  );
  return [header, ...lines].join("\n");
}
