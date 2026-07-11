import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import type { CorpusIndex, CorpusSource } from "./schema.js";

const EMPTY: CorpusIndex = { version: 1, sources: [] };

export function corpusIndexPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "corpus", "index.json");
}

export async function loadCorpus(env: NodeJS.ProcessEnv = process.env): Promise<CorpusIndex> {
  try {
    const parsed = JSON.parse(await readFile(corpusIndexPath(env), "utf8")) as CorpusIndex;
    return parsed.version === 1 && Array.isArray(parsed.sources) ? parsed : EMPTY;
  } catch {
    return { ...EMPTY, sources: [] };
  }
}

export async function saveCorpus(sources: CorpusSource[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const path = corpusIndexPath(env);
  const temp = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temp, JSON.stringify({ version: 1, sources }, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  await rename(temp, path);
}

export async function upsertCorpus(incoming: CorpusSource[], env: NodeJS.ProcessEnv = process.env): Promise<CorpusSource[]> {
  const current = await loadCorpus(env);
  const byId = new Map(current.sources.map((source) => [source.id, source]));
  for (const source of incoming) byId.set(source.id, source);
  const sources = [...byId.values()].sort((a, b) => a.origin.localeCompare(b.origin));
  await saveCorpus(sources, env);
  return sources;
}
