import { readWorld, queryEntities, latestEntities, relations, type WorldRecord } from "../world/store.js";
import type { SlashHandler } from "./types.js";

// `/world [query]` — view Vanta's world model (entities + relations). With a
// query, filters entities by type/name/note. A window onto the `world` tool's store.

/** Pure: render the world model (or a filtered slice). */
export function formatWorld(recs: WorldRecord[], q: string): string {
  const head = `World model — ${latestEntities(recs).length} entit${latestEntities(recs).length === 1 ? "y" : "ies"} · ${relations(recs).length} relation(s)`;
  const ents = queryEntities(recs, q);
  if (!ents.length) {
    return recs.length === 0
      ? `${head}\n  (empty — Vanta records entities via the world tool as it learns them)`
      : `${head}\n  (no entities match "${q}")`;
  }
  const rows = ents.slice(0, 30).map((e) => `  ${e.type}:${e.id} — ${e.name}${e.note ? ` · ${e.note}` : ""}`);
  return [head, ...rows].join("\n");
}

export const world: SlashHandler = async (arg, ctx) => ({ output: formatWorld(await readWorld(ctx.env), arg.trim()) });
