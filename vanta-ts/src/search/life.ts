import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import { brainDir } from "../brain/store.js";

export type LifeBlob = { source: string; text: string; path?: string };
export type LifeHit = { source: string; snippet: string; path?: string; line?: number };
export type GatherLifeOptions = {
  includeRepo?: boolean;
  maxRepoFiles?: number;
  maxFileBytes?: number;
};

const SNIPPET_MAX = 120;
const DEFAULT_MAX = 12;
const DEFAULT_MAX_REPO_FILES = 1_000;
const DEFAULT_MAX_FILE_BYTES = 256 * 1024;
const LOCAL_STORE_NAMES = ["world", "money", "radar", "team"] as const;
const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vanta",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "tmp",
]);
const IGNORE_FILES = new Set(["ERRORS.md"]);
const TEXT_EXTENSIONS = new Set([
  "",
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const QUERY_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "about",
  "did",
  "do",
  "find",
  "for",
  "i",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "the",
  "thing",
  "to",
  "where",
  "write",
  "written",
  "with",
  "wrote",
]);

/** Pure. Search named text blobs for q (case-insensitive); return up to max cited hits. */
export function searchBlobs(
  blobs: LifeBlob[],
  q: string,
  max: number = DEFAULT_MAX,
): LifeHit[] {
  if (!q) return [];
  const query = buildQuery(q);
  const hits: LifeHit[] = [];
  for (const { source, text, path } of blobs) {
    let lineNumber = 0;
    for (const line of text.split("\n")) {
      lineNumber += 1;
      if (lineMatches(line, query)) {
        const snippet = line.length > SNIPPET_MAX ? line.slice(0, SNIPPET_MAX) + "…" : line;
        const hit: LifeHit = { source, snippet, line: lineNumber };
        if (path) hit.path = path;
        hits.push(hit);
        if (hits.length >= max) return hits;
      }
    }
  }
  return hits;
}

function buildQuery(raw: string): { rawLower: string; terms: string[] } {
  const rawLower = raw.trim().toLowerCase();
  const terms = rawLower
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 1 && !QUERY_STOPWORDS.has(term));
  return { rawLower, terms: Array.from(new Set(terms)) };
}

function lineMatches(line: string, query: { rawLower: string; terms: string[] }): boolean {
  const lower = line.toLowerCase();
  if (lower.includes(query.rawLower)) return true;
  if (query.terms.length === 0) return false;
  const matched = query.terms.filter((term) => lower.includes(term)).length;
  if (query.terms.length <= 2) return matched === query.terms.length;
  return matched >= Math.min(2, query.terms.length);
}

async function readBestEffort(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function isTextPath(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

function sourcePath(path: string, root: string): string {
  const rel = relative(root, path);
  return rel && !rel.startsWith("..") ? rel : path;
}

async function gatherTextFiles(
  root: string,
  opts: Required<Pick<GatherLifeOptions, "maxRepoFiles" | "maxFileBytes">>,
): Promise<LifeBlob[]> {
  const blobs: LifeBlob[] = [];
  async function walk(dir: string): Promise<void> {
    if (blobs.length >= opts.maxRepoFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (blobs.length >= opts.maxRepoFiles) return;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) await walk(path);
        continue;
      }
      if (!entry.isFile() || !isTextPath(path)) continue;
      if (IGNORE_FILES.has(entry.name)) continue;
      let size = 0;
      try {
        size = (await stat(path)).size;
      } catch {
        continue;
      }
      if (size > opts.maxFileBytes) continue;
      const text = await readBestEffort(path);
      if (text !== null) blobs.push({ source: "repo", path: sourcePath(path, root), text });
    }
  }
  await walk(root);
  return blobs;
}

async function gatherBrainBlobs(env: NodeJS.ProcessEnv): Promise<LifeBlob[]> {
  const root = brainDir(env);
  const blobs = await gatherTextFiles(root, {
    maxRepoFiles: 300,
    maxFileBytes: DEFAULT_MAX_FILE_BYTES,
  });
  return blobs.map((blob) => ({
    ...blob,
    source: "brain",
    path: join(root, blob.path ?? ""),
  }));
}

/** Read Vanta's local stores, brain files, and the current repo as named, source-cited blobs. */
export async function gatherLifeBlobs(
  env: NodeJS.ProcessEnv,
  repoRoot: string,
  options: GatherLifeOptions = {},
): Promise<LifeBlob[]> {
  const home = resolveVantaHome(env);
  const opts = {
    includeRepo: options.includeRepo ?? true,
    maxRepoFiles: options.maxRepoFiles ?? DEFAULT_MAX_REPO_FILES,
    maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
  };
  const blobs: LifeBlob[] = [];

  for (const name of LOCAL_STORE_NAMES) {
    const path = join(home, `${name}.jsonl`);
    const text = await readBestEffort(path);
    if (text !== null) blobs.push({ source: name, path, text });
  }

  const errorsPath = join(repoRoot, "ERRORS.md");
  const errors = await readBestEffort(errorsPath);
  if (errors !== null) blobs.push({ source: "errors", path: "ERRORS.md", text: errors });

  blobs.push(...(await gatherBrainBlobs(env)));
  if (opts.includeRepo) {
    blobs.push(...(await gatherTextFiles(repoRoot, opts)));
  }

  return blobs;
}
