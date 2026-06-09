import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RoadmapSchema, RoadmapItemSchema } from "./schema.js";
import type { RoadmapItem } from "./schema.js";
import { buildRoadmap } from "./build.js";

// ROADMAP-ADD — the schema-safe companion to moveRoadmapItem. Appends a new card
// to roadmap.json instead of hand-editing JSON: validates the shape, refuses a
// duplicate id (case-insensitive), writes, and regenerates roadmap.html. Pure
// except the file I/O + rebuild it shares with move.ts.

export async function addRoadmapItem(
  repoRoot: string,
  item: RoadmapItem,
  now: Date = new Date(),
): Promise<RoadmapItem> {
  const validated = RoadmapItemSchema.parse(item); // throws actionably on a bad shape
  const src = join(repoRoot, "roadmap.json");
  const data = RoadmapSchema.parse(JSON.parse(await readFile(src, "utf8")));

  const idLower = validated.id.toLowerCase();
  if (data.items.some((i) => i.id.toLowerCase() === idLower)) {
    throw new Error(`roadmap item '${validated.id}' already exists — pick a unique id`);
  }

  data.items.push(validated);
  data.updated = now.toISOString().slice(0, 10);
  await writeFile(src, JSON.stringify(data, null, 2) + "\n", "utf8");
  await buildRoadmap(repoRoot);
  return validated;
}
