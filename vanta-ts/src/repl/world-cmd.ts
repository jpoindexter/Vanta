import { readWorld, queryEntities, latestEntities, relations, type WorldRecord } from "../world/store.js";
import { findConflicts } from "../world/conflicts.js";
import type { SlashHandler } from "./types.js";

// `/world [query]` — view Vanta's world model (entities + relations). With a
// query, filters entities by type/name/note. A window onto the `world` tool's store.

/** Pure: render the world model (or a filtered slice). */
export function formatWorld(recs: WorldRecord[], q: string): string {
  const ents = latestEntities(recs);
  const rels = relations(recs);
  const conflicts = findConflicts(rels);
  const conflictLine = conflicts.length ? `  ⚠ ${conflicts.length} conflict(s) — run world(action:conflicts) to inspect` : "";
  const head = `World model — ${ents.length} entit${ents.length === 1 ? "y" : "ies"} · ${rels.length} relation(s)${conflictLine ? "\n" + conflictLine : ""}`;

  const found = queryEntities(recs, q);
  if (!found.length) {
    return recs.length === 0
      ? `${head}\n  (empty — Vanta records entities via the world tool as it learns them)`
      : `${head}\n  (no entities match "${q}")`;
  }
  const rows = found.slice(0, 30).map((e) => `  ${e.type}:${e.id} — ${e.name}${e.note ? ` · ${e.note}` : ""}`);
  return [head, ...rows].join("\n");
}

export const world: SlashHandler = async (arg, ctx) => ({ output: formatWorld(await readWorld(ctx.env), arg.trim()) });
