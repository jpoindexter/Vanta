import { z } from "zod";
import { redactForLog } from "../store/redact-structural.js";

// PCLIP-WORKSPACE-PORTABILITY — export/import an operator workspace (skills,
// routines, goals, …) as a SCRUBBED, portable JSON bundle with id-collision
// handling on import. Local-first / data-residency: your workspace is a file
// you own and can move. The engine is COLLECTION-GENERIC (a collection = a named
// list of {id, ...} records); each concrete collection plugs in via a small
// adapter. Pure model + scrub + merge; the store I/O lives in the adapters.

export type WorkspaceRecord = { id: string; [k: string]: unknown };
export type WorkspaceBundle = {
  version: 1;
  exportedAt: string;
  collections: Record<string, WorkspaceRecord[]>;
};

export const BundleSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  collections: z.record(z.array(z.record(z.unknown())).transform((rows) => rows.filter((r) => typeof r.id === "string"))),
});

/** Parse + validate a bundle payload (drops records without a string id). Pure. */
export function parseBundle(payload: unknown): WorkspaceBundle | null {
  const parsed = BundleSchema.safeParse(payload);
  return parsed.success ? (parsed.data as WorkspaceBundle) : null;
}

/**
 * Scrub secrets from every string field of every record before it leaves the
 * machine: reuses redactForLog (vendor-secret + positional URL/header/conn
 * credential masking). Recurses into nested objects/arrays. Pure — returns a
 * new bundle; the input is untouched.
 */
export function scrubBundle(bundle: WorkspaceBundle): WorkspaceBundle {
  const collections: Record<string, WorkspaceRecord[]> = {};
  for (const [name, rows] of Object.entries(bundle.collections)) {
    collections[name] = rows.map((r) => scrubValue(r) as WorkspaceRecord);
  }
  return { ...bundle, collections };
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return redactForLog(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubValue(v);
    return out;
  }
  return value;
}

export type CollisionStrategy = "skip" | "overwrite" | "rename";
export type MergeResult = { merged: WorkspaceRecord[]; added: number; skipped: number; renamed: number; overwritten: number };

/**
 * Merge incoming records into existing ones, handling id collisions per the
 * strategy: skip (keep existing, drop incoming), overwrite (incoming wins),
 * rename (incoming gets a "-imported[-n]" id and is added alongside). Pure;
 * order-stable (existing first, then new/renamed in incoming order).
 */
export function mergeCollection(
  existing: readonly WorkspaceRecord[],
  incoming: readonly WorkspaceRecord[],
  strategy: CollisionStrategy,
): MergeResult {
  const byId = new Map(existing.map((r) => [r.id, r]));
  let added = 0, skipped = 0, renamed = 0, overwritten = 0;
  const appended: WorkspaceRecord[] = [];
  for (const rec of incoming) {
    if (!byId.has(rec.id)) {
      byId.set(rec.id, rec);
      appended.push(rec);
      added += 1;
    } else if (strategy === "overwrite") {
      byId.set(rec.id, rec);
      overwritten += 1;
    } else if (strategy === "rename") {
      const id = freshId(rec.id, byId);
      const renamedRec = { ...rec, id };
      byId.set(id, renamedRec);
      appended.push(renamedRec);
      renamed += 1;
    } else {
      skipped += 1;
    }
  }
  // Existing order preserved (overwrites mutate in place via the map), new ones appended.
  const merged = existing.map((r) => byId.get(r.id) ?? r).concat(appended);
  return { merged, added, skipped, renamed, overwritten };
}

/** A non-colliding id: "<id>-imported", then "-imported-2", … Pure. */
function freshId(id: string, taken: ReadonlyMap<string, unknown>): string {
  let candidate = `${id}-imported`;
  let n = 2;
  while (taken.has(candidate)) candidate = `${id}-imported-${n++}`;
  return candidate;
}
