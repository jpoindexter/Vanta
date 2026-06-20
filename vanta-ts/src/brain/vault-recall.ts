import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { similarity } from "./assoc.js";
import { recall, remember, type RecallResult } from "./brain.js";
import { resolveVaultPath } from "./vault-bridge.js";
import type { BrainEntry } from "./entries.js";

// The READ side of the brain↔vault bridge. The write side graduates crystallized
// brain memories INTO vault pages (vault-bridge.ts); this side reads brain AND
// vault back out in ONE recall, deduped by the same brain→vault provenance
// pointers the write side stamps (sourceRef: vault:<path>). It also primes the
// reverse direction — reading a vault page about the user or a standing project
// seeds a brain salience entry, so vault knowledge surfaces in future recall.
// Vault access is INJECTED (a VaultReader), so this is pure-testable with an
// in-memory vault — no filesystem, no MCP. No vault → plain brain recall.

/** A relevant vault page surfaced alongside brain memories. */
export type VaultHit = { path: string; title: string; excerpt: string; score: number };

/** A vault read port — list page paths, read one page's text. Injected for tests. */
export type VaultReader = {
  list(): Promise<string[]>;
  read(path: string): Promise<string | null>;
};

/** One recall surfacing both layers, deduped by brain→vault provenance. */
export type UnifiedRecall = RecallResult & { vaultPages: VaultHit[] };

const VAULT_REF = "vault:";
const DEFAULT_VAULT_PAGES = 3;
const VAULT_MIN_SCORE = 0.1;
const EXCERPT_LEN = 200;
const TITLE_LEN = 80;
const PRIME_REGIONS = new Set(["user_model", "semantic"]);

/** The vault path a brain entry points at, or null if it isn't a vault pointer. Pure. */
export function vaultRefOf(e: BrainEntry): string | null {
  const ref = e.sourceRef ?? "";
  return ref.startsWith(VAULT_REF) ? ref.slice(VAULT_REF.length) : null;
}

/** The set of vault paths brain entries already point at (so the page wins, not the entry). Pure. */
export function provenancePaths(entries: BrainEntry[]): Set<string> {
  const paths = new Set<string>();
  for (const e of entries) {
    const ref = vaultRefOf(e);
    if (ref) paths.add(ref);
  }
  return paths;
}

/** First non-empty line as a title; the body's head as an excerpt. Pure. */
export function pageTitleExcerpt(text: string): { title: string; excerpt: string } {
  const stripped = text.replace(/^---\n[\s\S]*?\n---\n/, ""); // drop frontmatter
  const lines = stripped.split("\n").map((l) => l.trim());
  const titleLine = lines.find((l) => l.length > 0) ?? "";
  const title = titleLine.replace(/^#+\s*/, "").slice(0, TITLE_LEN);
  const body = stripped.replace(/^#+\s.*\n/, "").trim();
  return { title, excerpt: body.slice(0, EXCERPT_LEN) };
}

/**
 * Drop brain entries that point at a vault page we already surfaced — the page
 * carries the durable copy, so showing both is a duplicate. Pure.
 */
export function dedupeAgainstVault(entries: BrainEntry[], vaultPaths: Set<string>): BrainEntry[] {
  if (!vaultPaths.size) return entries;
  return entries.filter((e) => {
    const ref = vaultRefOf(e);
    return !(ref && vaultPaths.has(ref));
  });
}

/** Score every vault page against the query, keep the top relevant ones. Pure given pages. */
export function rankVaultPages(
  pages: { path: string; text: string }[],
  query: string,
  topK = DEFAULT_VAULT_PAGES,
): VaultHit[] {
  return pages
    .map(({ path, text }) => {
      const { title, excerpt } = pageTitleExcerpt(text);
      return { path, title, excerpt, score: similarity(query, `${title} ${text}`) };
    })
    .filter((h) => h.score >= VAULT_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

async function loadVaultPages(reader: VaultReader): Promise<{ path: string; text: string }[]> {
  const paths = await reader.list().catch(() => [] as string[]);
  const out: { path: string; text: string }[] = [];
  for (const path of paths) {
    const text = await reader.read(path).catch(() => null);
    if (text) out.push({ path, text });
  }
  return out;
}

export type UnifiedRecallOpts = {
  query: string;
  reader?: VaultReader | null;
  topK?: number;
  vaultTopK?: number;
  env?: NodeJS.ProcessEnv;
};

/**
 * One recall across both layers: brain memories AND relevant vault pages, merged
 * and deduped against brain→vault pointers (a brain entry whose sourceRef names a
 * surfaced page collapses to that page). With no reader it degrades cleanly to a
 * plain brain recall (vaultPages: []). Best-effort: a broken vault never breaks
 * brain recall.
 */
export async function unifiedRecall(opts: UnifiedRecallOpts): Promise<UnifiedRecall> {
  const { query, reader, topK, vaultTopK, env } = opts;
  const base = await recall({ query, topK, env });
  if (!reader) return { ...base, vaultPages: [] };
  const pages = await loadVaultPages(reader);
  const vaultPages = rankVaultPages(pages, query, vaultTopK);
  const surfaced = new Set(vaultPages.map((p) => p.path));
  const entries = dedupeAgainstVault(base.entries, surfaced);
  return { ...base, entries, vaultPages };
}

/**
 * Is this vault page about the user or a standing project — worth seeding into
 * the brain? Heuristic: the page mentions the operator, "I"/"my", or a project
 * cue. Pure. Conservative — generic world-knowledge pages don't prime.
 */
export function isPrimeWorthy(text: string, cues: string[] = []): boolean {
  const lower = text.toLowerCase();
  const standing = ["project", "goal", "preference", "decided", "i prefer", "i ship", "my workflow", " jason"];
  const all = [...standing, ...cues.map((c) => c.toLowerCase())];
  return all.some((c) => lower.includes(c));
}

export type PrimeOpts = {
  path: string;
  text: string;
  region?: string;
  cues?: string[];
  env?: NodeJS.ProcessEnv;
};

/**
 * Vault→brain priming: reading a user/project-relevant vault page seeds a brain
 * salience entry, stamped sourceRef: vault:<path> so it dedupes against the page
 * on the next unifiedRecall (no double-surfacing). Returns the seeded entry, or
 * null when the page isn't prime-worthy. Best-effort.
 */
export async function primeFromVaultPage(opts: PrimeOpts): Promise<BrainEntry | null> {
  const { path, text, cues, env } = opts;
  if (!isPrimeWorthy(text, cues)) return null;
  const region = PRIME_REGIONS.has(opts.region ?? "") ? opts.region! : "user_model";
  const { title, excerpt } = pageTitleExcerpt(text);
  const content = `${title}${excerpt ? `: ${excerpt}` : ""}`.trim() || title;
  try {
    return await remember({
      region,
      content,
      entryType: region === "semantic" ? "fact" : "context",
      salience: 0.7,
      sourceType: "external",
      sourceRef: `${VAULT_REF}${path}`,
      env,
    });
  } catch {
    return null;
  }
}

const MD_EXT = ".md";

async function walkMarkdown(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile() && ent.name.endsWith(MD_EXT)) out.push(relative(root, full).split(sep).join("/"));
    }
  }
  await walk(root);
  return out;
}

/**
 * The production VaultReader: reads the configured Obsidian vault directly off
 * the filesystem (same access the write-side bridge uses). Returns null when no
 * vault is configured, so callers degrade to plain brain recall.
 */
export async function resolveVaultReader(env: NodeJS.ProcessEnv = process.env): Promise<VaultReader | null> {
  const vault = await resolveVaultPath(env);
  if (!vault) return null;
  return {
    list: () => walkMarkdown(vault),
    read: (path) => readFile(join(vault, path), "utf8").catch(() => null),
  };
}
