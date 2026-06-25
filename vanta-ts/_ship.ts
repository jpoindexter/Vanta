// Reusable per-card ship helper: set status=shipped + notes, bump dates, rebuild HTML.
// Usage: npx tsx _ship.ts <CARD-ID> "<notes>"
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRoadmap } from "./src/roadmap/build.js";

const ROOT = "/Users/jasonpoindexter/Documents/GitHub/_active/Vanta";
const TODAY = "2026-06-25";
const [id, notes] = [process.argv[2], process.argv[3]];
if (!id) { console.error("need a card id"); process.exit(1); }

const src = join(ROOT, "roadmap.json");
const data = JSON.parse(await readFile(src, "utf8")) as { updated: string; items: Array<Record<string, unknown>> };
const item = data.items.find((i) => i.id === id);
if (!item) { console.error("card not found:", id); process.exit(1); }
item.status = "shipped";
if (notes) item.notes = notes;
item.updated = TODAY;
data.updated = TODAY;
await writeFile(src, JSON.stringify(data, null, 2) + "\n", "utf8");
await buildRoadmap(ROOT);
console.log("shipped:", id);
