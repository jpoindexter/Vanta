import type { WorldEntity, WorldRelation, WorldRecord } from "./store.js";

// Pure, deterministic conflict detection + cited recall for the world model.
// A "conflict" is two relations with the same subject+predicate (from+rel) but
// a different object (to). Think of it as a contradiction in the graph.

export type Conflict = {
  subject: string;
  predicate: string;
  objects: string[];
  recordIds: string[];
};

export type CitedMatch = {
  kind: "entity" | "relation";
  id: string;
  ts: string;
  text: string;
};

/**
 * Detect contradictions: same (from, rel) with different `to` values.
 * Groups all relations by the (from, rel) key; any group with >1 unique `to`
 * is a conflict. Pure, deterministic.
 */
export function findConflicts(rels: WorldRelation[]): Conflict[] {
  const groups = new Map<string, WorldRelation[]>();
  for (const r of rels) {
    const key = `${r.from}\0${r.rel}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(r);
    groups.set(key, bucket);
  }

  const conflicts: Conflict[] = [];
  for (const [key, bucket] of groups) {
    const unique = [...new Set(bucket.map((r) => r.to))];
    if (unique.length < 2) continue;
    const [subject = "", predicate = ""] = key.split("\0") as [string, string];
    conflicts.push({
      subject,
      predicate,
      objects: unique,
      recordIds: bucket.map((r) => r.ts),
    });
  }
  return conflicts;
}

/**
 * Substring/token match across entities + relations.
 * Each result carries the source record ts (citation) so callers can trace
 * the origin of every returned fact.
 * Pure.
 */
export function recallWithSources(
  entities: WorldEntity[],
  rels: WorldRelation[],
  query: string,
): CitedMatch[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const results: CitedMatch[] = [];

  for (const e of entities) {
    const hay = `${e.type} ${e.name} ${e.note ?? ""}`.toLowerCase();
    if (matchesQuery(hay, q)) {
      results.push({
        kind: "entity",
        id: e.id,
        ts: e.ts,
        text: `${e.type}:${e.id} — ${e.name}${e.note ? ` · ${e.note}` : ""}`,
      });
    }
  }

  for (const r of rels) {
    const hay = `${r.from} ${r.rel} ${r.to}`.toLowerCase();
    if (matchesQuery(hay, q)) {
      results.push({
        kind: "relation",
        id: `${r.from}→${r.rel}→${r.to}`,
        ts: r.ts,
        text: `${r.from} —${r.rel}→ ${r.to}`,
      });
    }
  }

  return results;
}

/** Matches if every whitespace-separated token appears in the haystack. */
function matchesQuery(hay: string, q: string): boolean {
  return q.split(/\s+/).every((token) => hay.includes(token));
}

/** Extract only WorldRecord types needed for conflicts/recall from a mixed record array. */
export function splitRecords(recs: WorldRecord[]): {
  entities: WorldEntity[];
  relations: WorldRelation[];
} {
  const entities: WorldEntity[] = [];
  const relations: WorldRelation[] = [];
  for (const r of recs) {
    if (r.kind === "entity") entities.push(r);
    else relations.push(r);
  }
  return { entities, relations };
}
