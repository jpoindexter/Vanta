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

export function pruneAnalysis(items: RoadmapItem[]): PruneCandidate[] {
  const candidates: PruneCandidate[] = [];

  // Build a lookup of next-status items for duplicate detection
  const nextItems = items.filter((i) => i.status === "next");
  const titlePrefixCounts: Map<string, string[]> = new Map();
  for (const item of nextItems) {
    const key = item.title.slice(0, 30).toLowerCase();
    const existing = titlePrefixCounts.get(key) ?? [];
    existing.push(item.id);
    titlePrefixCounts.set(key, existing);
  }

  for (const item of items) {
    // Thin spec: next + sand + no summary or very short summary
    if (
      item.status === "next" &&
      item.tier === "sand" &&
      (!item.summary || item.summary.trim().length < 20)
    ) {
      candidates.push({
        id: item.id,
        title: item.title,
        reason: "thin spec, easy to drop",
        confidence: "medium",
      });
      continue;
    }

    // Placeholder title: next items only
    if (item.status === "next" && PLACEHOLDER_RE.test(item.title)) {
      candidates.push({
        id: item.id,
        title: item.title,
        reason: "placeholder card",
        confidence: "high",
      });
      continue;
    }

    // Duplicate-looking titles among next items
    if (item.status === "next") {
      const key = item.title.slice(0, 30).toLowerCase();
      const group = titlePrefixCounts.get(key) ?? [];
      if (group.length > 1 && group[0] === item.id) {
        // Emit one candidate for the first id in the group (others are siblings)
        candidates.push({
          id: item.id,
          title: item.title,
          reason: `possible duplicate (same first-30-char prefix as: ${group.slice(1).join(", ")})`,
          confidence: "medium",
        });
        continue;
      }
    }

    // Horizon L: aspirational large items
    if (item.status === "horizon" && item.size === "L") {
      candidates.push({
        id: item.id,
        title: item.title,
        reason: "horizon L cards are aspirational, confirm still wanted",
        confidence: "low",
      });
    }
  }

  return candidates.sort(
    (a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence],
  );
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
