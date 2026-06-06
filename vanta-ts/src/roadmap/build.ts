import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RoadmapSchema } from "./schema.js";
import { renderRoadmap } from "./render.js";

export async function buildRoadmap(repoRoot: string): Promise<string> {
  const src = join(repoRoot, "roadmap.json");
  const raw = await readFile(src, "utf8");
  const data = RoadmapSchema.parse(JSON.parse(raw));
  const html = renderRoadmap(data);
  const out = join(repoRoot, "roadmap.html");
  await writeFile(out, html, "utf8");
  return out;
}
