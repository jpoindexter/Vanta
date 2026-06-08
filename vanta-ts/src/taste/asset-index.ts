import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// AESTHETIC-ASSET-INDEX: visual reference library for the taste engine.
// Stores URLs, screenshot paths, and design references with taste tags
// so Vanta can say "too generic / fits your system" with specific reasons.
// Feeds TASTE-ENGINE with a private vocabulary.

export const TASTE_TAGS = [
  "operator-dossier",     // control-room, data-dense, authoritative
  "schematic-rail",       // technical diagrams, signal panels
  "glyph-system",         // icon systems, symbolic typography
  "signal-panel",         // status displays, telemetry
  "warm-precise",         // technical but human-legible
  "too-generic",          // could be any SaaS — avoid
  "too-mascot",           // character-forward, cute — avoid
  "editorial",            // print/magazine aesthetic
  "terminal-first",       // monospace, dense, CLI-native
  "minimal-stark",        // extreme reduction, negative space
] as const;
export type TasteTag = typeof TASTE_TAGS[number];

export const AssetSchema = z.object({
  id: z.string(),
  type: z.enum(["url", "screenshot", "image", "cosmos-link", "design-ref"]),
  source: z.string(),
  title: z.string(),
  tags: z.array(z.enum(TASTE_TAGS)),
  notes: z.string().optional(),
  ingestedAt: z.string(),
});
export type Asset = z.infer<typeof AssetSchema>;

const IndexSchema = z.array(AssetSchema);

function indexPath(env?: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "taste-assets.json");
}

export async function loadAssets(env?: NodeJS.ProcessEnv): Promise<Asset[]> {
  if (!existsSync(indexPath(env))) return [];
  try { return IndexSchema.parse(JSON.parse(await readFile(indexPath(env), "utf8"))); }
  catch { return []; }
}

async function saveAssets(assets: Asset[], env?: NodeJS.ProcessEnv): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  await writeFile(indexPath(env), JSON.stringify(assets, null, 2) + "\n", "utf8");
}

function genId(source: string): string {
  return `taste-${source.slice(0, 20).replace(/[^a-z0-9]/gi, "-")}-${Date.now() % 100000}`;
}

/** Ingest a visual reference into the taste library. */
export async function ingestAsset(opts: {
  source: string;
  type?: Asset["type"];
  title?: string;
  tags?: TasteTag[];
  notes?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<Asset> {
  const type = opts.type ?? (opts.source.startsWith("http") ? "url" : "image");
  const asset: Asset = {
    id: genId(opts.source),
    type,
    source: opts.source,
    title: opts.title ?? opts.source.slice(0, 60),
    tags: opts.tags ?? [],
    notes: opts.notes,
    ingestedAt: new Date().toISOString(),
  };
  const existing = await loadAssets(opts.env);
  const idx = existing.findIndex((a) => a.source === opts.source);
  if (idx >= 0) existing[idx] = asset; else existing.push(asset);
  await saveAssets(existing, opts.env);
  return asset;
}

/** Search the taste library by tag or keyword. */
export async function searchAssets(query: string, env?: NodeJS.ProcessEnv): Promise<Asset[]> {
  const assets = await loadAssets(env);
  const q = query.toLowerCase();
  return assets.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.source.toLowerCase().includes(q) ||
      (a.notes ?? "").toLowerCase().includes(q) ||
      a.tags.some((t) => t.includes(q)),
  );
}

/** Format assets for display. Pure. */
export function formatAssets(assets: Asset[]): string {
  if (!assets.length) return "  (no taste assets yet — vanta taste add <url|path>)";
  return assets.map((a) =>
    `  [${a.type}] ${a.id}\n    ${a.title}\n    tags: ${a.tags.join(", ") || "none"}\n    ${a.source}`,
  ).join("\n");
}
