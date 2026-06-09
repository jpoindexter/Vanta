import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// REF-INGEST: durable project-scoped reference store.
// Ingested references (URLs, files, repo paths, images, transcripts) are
// stored under ~/.vanta/refs/<slug>.md and available for @-context recall
// across sessions without re-pasting.

export const RefSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["url", "file", "repo", "image", "transcript", "raw"]),
  source: z.string().min(1),
  title: z.string(),
  ingestedAt: z.string(),
  excerpt: z.string(),
  tags: z.array(z.string()).optional(),
});

export type Ref = z.infer<typeof RefSchema>;

const RefsIndexSchema = z.array(RefSchema);

function refsDir(env?: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "refs");
}

function indexPath(env?: NodeJS.ProcessEnv): string {
  return join(refsDir(env), "index.json");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-|-$/g, "");
}

function generateId(source: string): string {
  return `ref-${slugify(source)}-${Date.now() % 100000}`;
}

async function loadIndex(env?: NodeJS.ProcessEnv): Promise<Ref[]> {
  try {
    return RefsIndexSchema.parse(JSON.parse(await readFile(indexPath(env), "utf8")));
  } catch {
    return [];
  }
}

async function saveIndex(refs: Ref[], env?: NodeJS.ProcessEnv): Promise<void> {
  await mkdir(refsDir(env), { recursive: true });
  await writeFile(indexPath(env), JSON.stringify(refs, null, 2) + "\n", "utf8");
}

/** Detect the type of a source string. Pure. */
export function detectRefType(source: string): Ref["type"] {
  if (/^https?:\/\//.test(source)) return "url";
  if (/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(source)) return "image";
  if (/\.(md|txt|transcript|srt|vtt)$/i.test(source)) return "transcript";
  if (existsSync(source) && !extname(source)) return "repo";
  return "file";
}

/**
 * Add a reference to the durable store.
 * `excerpt` should be a pre-extracted summary (the caller handles fetching/reading).
 */
export async function addRef(
  opts: {
    source: string;
    excerpt: string;
    title?: string;
    type?: Ref["type"];
    tags?: string[];
    env?: NodeJS.ProcessEnv;
  },
): Promise<Ref> {
  const type = opts.type ?? detectRefType(opts.source);
  const title = opts.title ?? (basename(opts.source) || opts.source.slice(0, 60));
  const ref: Ref = {
    id: generateId(opts.source),
    type,
    source: opts.source,
    title,
    ingestedAt: new Date().toISOString(),
    excerpt: opts.excerpt.slice(0, 2000),
    tags: opts.tags,
  };
  const refs = await loadIndex(opts.env);
  const existing = refs.findIndex((r) => r.source === opts.source);
  if (existing >= 0) refs[existing] = ref; else refs.push(ref);
  await saveIndex(refs, opts.env);
  return ref;
}

/** Search refs by keyword (case-insensitive substring). */
export async function searchRefs(
  query: string,
  env?: NodeJS.ProcessEnv,
): Promise<Ref[]> {
  const refs = await loadIndex(env);
  const q = query.toLowerCase();
  return refs.filter(
    (r) =>
      r.title.toLowerCase().includes(q) ||
      r.source.toLowerCase().includes(q) ||
      r.excerpt.toLowerCase().includes(q) ||
      r.tags?.some((t) => t.toLowerCase().includes(q)),
  );
}

/** List all refs, most recent first. */
export async function listRefs(env?: NodeJS.ProcessEnv): Promise<Ref[]> {
  const refs = await loadIndex(env);
  return refs.sort((a, b) => (a.ingestedAt > b.ingestedAt ? -1 : 1));
}

/** Format a ref list for display. Pure. */
export function formatRefs(refs: Ref[]): string {
  if (!refs.length) return "  (no references ingested yet — use `vanta ref add <url|path>`)";
  return refs
    .map((r) => `  [${r.type}] ${r.id}\n    ${r.title}\n    ${r.source}`)
    .join("\n");
}

/** Format a single ref for @-context injection. Pure. */
export function formatRefForContext(r: Ref): string {
  return `## Reference: ${r.title}\nSource: ${r.source}\nType: ${r.type}\n\n${r.excerpt}`;
}

export { refsDir, indexPath };
