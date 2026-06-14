import { readWorld, queryEntities, latestEntities, relations, type WorldRecord, type WorldEntity } from "../world/store.js";
import { findConflicts } from "../world/conflicts.js";
import { findDuplicates } from "../world/merge.js";
import { freshness, labelUncertainty } from "../world/confidence.js";
import type { SlashHandler } from "./types.js";

// `/world [query]` — view Vanta's world model (entities + relations). With a
// query, filters entities by type/name/note. A window onto the `world` tool's store.

function freshnessMarker(e: WorldEntity, now: number): string {
  const f = freshness(e.ts, now);
  const label = labelUncertainty(f);
  if (label === "certain") return "";
  return ` [${label}]`;
}

/** Pure: render the world model (or a filtered slice). */
export function formatWorld(recs: WorldRecord[], q: string, now = Date.now()): string {
  const ents = latestEntities(recs);
  const rels = relations(recs);
  const conflicts = findConflicts(rels);
  const dups = findDuplicates(ents);
  const conflictLine = conflicts.length ? `  ⚠ ${conflicts.length} conflict(s) — run world(action:conflicts) to inspect` : "";
  const dupLine = dups.length ? `  ⚡ ${dups.length} possible duplicate(s) — run world(action:duplicates) to review` : "";
  const notes = [conflictLine, dupLine].filter(Boolean).join("\n");
  const head = `World model — ${ents.length} entit${ents.length === 1 ? "y" : "ies"} · ${rels.length} relation(s)${notes ? "\n" + notes : ""}`;

  const found = queryEntities(recs, q);
  if (!found.length) {
    return recs.length === 0
      ? `${head}\n  (empty — Vanta records entities via the world tool as it learns them)`
      : `${head}\n  (no entities match "${q}")`;
  }
  const rows = found.slice(0, 30).map((e) => {
    const marker = freshnessMarker(e, now);
    return `  ${e.type}:${e.id} — ${e.name}${e.note ? ` · ${e.note}` : ""}${marker}`;
  });
  return [head, ...rows].join("\n");
}

export const world: SlashHandler = async (arg, ctx) => ({ output: formatWorld(await readWorld(ctx.env), arg.trim()) });
