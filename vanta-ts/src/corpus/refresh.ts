import { loadCorpus } from "./store.js";
import { ingestCorpus, type IngestDeps } from "./ingest.js";
import { sourceFreshness, type CorpusSource } from "./schema.js";

export async function corpusStatus(opts: { env?: NodeJS.ProcessEnv; now?: Date } = {}): Promise<{ total: number; fresh: number; stale: number; sources: CorpusSource[] }> {
  const now = opts.now ?? new Date();
  const index = await loadCorpus(opts.env);
  const sources = index.sources.map((source) => ({ ...source, freshness: sourceFreshness(source.sourceDate, source.staleAfterDays, now) }));
  return { total: sources.length, fresh: sources.filter((item) => item.freshness === "fresh").length, stale: sources.filter((item) => item.freshness === "stale").length, sources };
}

export async function refreshCorpus(id: string, deps: IngestDeps = {}): Promise<{ refreshed: number; sources: CorpusSource[] }> {
  const index = await loadCorpus(deps.env);
  const selected = id === "all" ? index.sources : index.sources.filter((source) => source.id === id);
  if (!selected.length) throw new Error(`Corpus source not found: ${id}`);
  const sources: CorpusSource[] = [];
  for (const source of selected) {
    const result = await ingestCorpus(source.origin, { ...deps, staleAfterDays: source.staleAfterDays });
    sources.push(...result.sources);
  }
  return { refreshed: sources.length, sources };
}
