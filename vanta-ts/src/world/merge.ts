import type { WorldEntity, WorldRelation, WorldRecord } from "./store.js";

// Pure, deterministic entity consolidation for the world model.
// Merging: produce append-only records that tombstone a duplicate entity (dropId)
// and re-point all its relations to the surviving entity (keepId).

export type MergeResult = {
  /** The alias/tombstone record written for dropId. */
  alias: WorldEntity;
  /** Re-pointed copies of relations that referenced dropId. */
  repointed: WorldRelation[];
};

export type DuplicatePair = [keepId: string, dropId: string];

/**
 * Produce the records to APPEND that consolidate `dropId` into `keepId`.
 * Returns a tombstone/alias for dropId plus re-pointed copies of any relations
 * that referenced dropId (either end) now pointing at keepId.
 * Pure — does not mutate input arrays.
 */
export function mergeEntities(
  records: WorldRecord[],
  keepId: string,
  dropId: string,
): MergeResult {
  const ts = new Date().toISOString();

  const alias: WorldEntity = {
    kind: "entity",
    id: dropId,
    type: "alias",
    name: `→ ${keepId}`,
    note: `merged into ${keepId}`,
    ts,
  };

  const repointed: WorldRelation[] = records
    .filter((r): r is WorldRelation => r.kind === "relation")
    .filter((r) => r.from === dropId || r.to === dropId)
    .map((r) => ({
      kind: "relation" as const,
      from: r.from === dropId ? keepId : r.from,
      to: r.to === dropId ? keepId : r.to,
      rel: r.rel,
      ts,
    }));

  return { alias, repointed };
}

/**
 * Produce the flat WorldRecord[] to pass to appendWorld (alias + repointed).
 * Convenience wrapper: callers append each record in order.
 */
export function mergeRecords(result: MergeResult): WorldRecord[] {
  return [result.alias, ...result.repointed];
}

/**
 * Heuristic: entities of the same type whose names match case-insensitively
 * (after trimming). Returns pairs [survivorId, dropId] — first-seen id wins.
 * Pure, deterministic.
 */
export function findDuplicates(entities: WorldEntity[]): DuplicatePair[] {
  // key = type + normalised name → first entity seen for that key
  const seen = new Map<string, string>();
  const pairs: DuplicatePair[] = [];

  for (const e of entities) {
    // alias tombstones are intentional; skip
    if (e.type === "alias") continue;
    const key = `${e.type}\0${e.name.trim().toLowerCase()}`;
    const existing = seen.get(key);
    if (existing === undefined) {
      seen.set(key, e.id);
    } else if (existing !== e.id) {
      pairs.push([existing, e.id]);
    }
  }

  return pairs;
}
