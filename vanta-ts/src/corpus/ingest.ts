import { createHash } from "node:crypto";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { parseHTML } from "linkedom";
import { assertPublicUrl, type GuardResult } from "../net/ssrf-guard.js";
import { embed } from "../search/embed.js";
import { extractEntities } from "../search/entities.js";
import { loadCorpus, upsertCorpus } from "./store.js";
import { sourceFreshness, type CorpusChunk, type CorpusSource, type Embedder } from "./schema.js";

const SUPPORTED = new Set([".md", ".markdown", ".txt", ".vtt", ".srt"]);
const DEFAULT_STALE_DAYS = 30;
const CHUNK_SIZE = 1_200;
const CHUNK_OVERLAP = 120;

export type IngestDeps = {
  env?: NodeJS.ProcessEnv;
  now?: Date;
  staleAfterDays?: number;
  embedder?: Embedder;
  fetcher?: typeof fetch;
  guard?: (url: string) => Promise<GuardResult>;
};

type InputDoc = { origin: string; relativePath?: string; title: string; text: string; sourceDate: Date; kind: "local" | "url" };
type CompileOptions = { existing: Map<string, CorpusSource>; now: Date; staleDays: number; embedder: Embedder };

export async function ingestCorpus(target: string, deps: IngestDeps = {}): Promise<{ imported: number; skipped: number; sources: CorpusSource[] }> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? new Date();
  const embedder = deps.embedder ?? ((text) => embed(text, env));
  const input = isUrl(target) ? await readUrl(target, deps) : await readLocal(target);
  const existing = await loadCorpus(env);
  const existingById = new Map(existing.sources.map((source) => [source.id, source]));
  const sources: CorpusSource[] = [];
  const options = { existing: existingById, now, staleDays: deps.staleAfterDays ?? DEFAULT_STALE_DAYS, embedder };
  for (const doc of input.docs) sources.push(await compileSource(doc, options));
  await upsertCorpus(sources, env);
  return { imported: sources.length, skipped: input.skipped, sources };
}

async function compileSource(doc: InputDoc, options: CompileOptions): Promise<CorpusSource> {
  const id = stableId(doc.origin);
  const chunks = await compileChunks(doc.text, id, options.embedder);
  const previous = options.existing.get(id);
  const sourceDate = doc.sourceDate.toISOString();
  return {
    id, kind: doc.kind, origin: doc.origin, relativePath: doc.relativePath, title: doc.title,
    sourceDate, ingestedAt: previous?.ingestedAt ?? options.now.toISOString(), refreshedAt: options.now.toISOString(),
    staleAfterDays: options.staleDays, freshness: sourceFreshness(sourceDate, options.staleDays, options.now),
    contentHash: hash(doc.text), entities: extractEntities(doc.text), chunks,
  };
}

async function compileChunks(text: string, sourceId: string, embedder: Embedder): Promise<CorpusChunk[]> {
  const clean = normalizeTranscript(text);
  const parts: string[] = [];
  for (let start = 0; start < clean.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    parts.push(clean.slice(start, start + CHUNK_SIZE).trim());
  }
  if (!parts.length) parts.push("");
  return Promise.all(parts.filter(Boolean).map(async (part, index) => {
    const embedding = await embedder(part);
    return { id: `${sourceId}:${index}`, text: part, index, ...(embedding ? { embedding } : {}) };
  }));
}

async function readLocal(target: string): Promise<{ docs: InputDoc[]; skipped: number }> {
  const root = resolve(target);
  const info = await lstat(root);
  if (info.isSymbolicLink()) throw new Error("Corpus ingest refuses symbolic links");
  if (info.isFile()) {
    if (!SUPPORTED.has(extname(root).toLowerCase())) throw new Error(`Unsupported corpus file: ${target}`);
    return { docs: [await localDoc(root, basename(root))], skipped: 0 };
  }
  if (!info.isDirectory()) throw new Error(`Corpus target is not a file or folder: ${target}`);
  const walked = await walk(root);
  const docs = await Promise.all(walked.files.map((file) => localDoc(file, relative(root, file).split(sep).join("/"))));
  return { docs, skipped: walked.skipped };
}

async function walk(dir: string): Promise<{ files: string[]; skipped: number }> {
  const files: string[] = [];
  let skipped = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      const nested = await walk(path); files.push(...nested.files); skipped += nested.skipped;
    } else if (entry.isFile() && SUPPORTED.has(extname(entry.name).toLowerCase()) && !entry.name.startsWith(".")) files.push(path);
    else skipped += 1;
  }
  return { files: files.sort(), skipped };
}

async function localDoc(path: string, relativePath: string): Promise<InputDoc> {
  const info = await stat(path);
  return { kind: "local", origin: resolve(path), relativePath, title: basename(path, extname(path)), text: await readFile(path, "utf8"), sourceDate: info.mtime };
}

async function readUrl(url: string, deps: IngestDeps): Promise<{ docs: InputDoc[]; skipped: number }> {
  const guard = deps.guard ?? ((value) => assertPublicUrl(value, { env: deps.env }));
  const allowed = await guard(url);
  if (!allowed.ok) throw new Error(allowed.error);
  const response = await (deps.fetcher ?? fetch)(url);
  if (!response.ok) throw new Error(`Corpus fetch failed (${response.status}) for ${url}`);
  const raw = await response.text();
  const type = response.headers.get("content-type") ?? "";
  const text = type.includes("html") ? htmlText(raw) : raw;
  const modified = response.headers.get("last-modified");
  const sourceDate = modified && !Number.isNaN(Date.parse(modified)) ? new Date(modified) : (deps.now ?? new Date());
  return { docs: [{ kind: "url", origin: url, title: new URL(url).hostname, text, sourceDate }], skipped: 0 };
}

function htmlText(raw: string): string {
  const { document } = parseHTML(raw);
  document.querySelectorAll("script,style,noscript").forEach((node: { remove(): void }) => node.remove());
  return document.body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function normalizeTranscript(text: string): string {
  return text.replace(/^WEBVTT\s*/i, "").replace(/^\d+\s*$/gm, "").replace(/^\d{2}:\d{2}(?::\d{2})?[.,]\d{3}\s+-->.*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

function isUrl(value: string): boolean { return /^https?:\/\//i.test(value); }
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function stableId(origin: string): string { return hash(origin).slice(0, 16); }
