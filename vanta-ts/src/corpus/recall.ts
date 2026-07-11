import { bm25Rank } from "../search/bm25.js";
import { cosineSim, embed } from "../search/embed.js";
import { buildEntityIndexFrom, entityRank } from "../search/entities.js";
import { fuseRrf } from "../search/rrf.js";
import { loadCorpus } from "./store.js";
import { sourceFreshness, type CorpusReceipt, type CorpusSource, type Embedder } from "./schema.js";

export type RecallHit = {
  chunkId: string;
  excerpt: string;
  source: CorpusSource;
  receipt: CorpusReceipt;
  entityLinks: string[];
};

export async function recallCorpus(query: string, opts: { env?: NodeJS.ProcessEnv; embedder?: Embedder; limit?: number; now?: Date } = {}): Promise<{ signals: string[]; hits: RecallHit[] }> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const corpus = await loadCorpus(env);
  const records = corpus.sources.flatMap((source) => source.chunks.map((chunk) => ({ source, chunk })));
  const docs = records.map(({ chunk }) => ({ id: chunk.id, text: chunk.text }));
  const lexical = bm25Rank(query, docs).map((item) => item.id);
  const entities = entityRank(query, buildEntityIndexFrom(records.map(({ source, chunk }) => ({ id: chunk.id, entities: source.entities }))));
  const embedder = opts.embedder ?? ((text: string) => embed(text, env));
  const queryVector = await embedder(query);
  const semantic = queryVector ? semanticRank(queryVector, records) : [];
  const lists = [lexical, semantic, entities].filter((list) => list.length);
  const signals = [lexical.length ? "keyword" : "", semantic.length ? "semantic" : "", entities.length ? "entity" : ""].filter(Boolean);
  const byId = new Map(records.map((record) => [record.chunk.id, record]));
  const hits = fuseRrf(lists).slice(0, opts.limit ?? 5).flatMap((id) => {
    const record = byId.get(id);
    return record ? [toHit(record.source, record.chunk.id, record.chunk.text, now)] : [];
  });
  return { signals, hits };
}

function semanticRank(query: number[], records: Array<{ source: CorpusSource; chunk: CorpusSource["chunks"][number] }>): string[] {
  return records.flatMap(({ chunk }) => chunk.embedding ? [{ id: chunk.id, score: cosineSim(query, chunk.embedding) }] : [])
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.id);
}

function toHit(source: CorpusSource, chunkId: string, text: string, now: Date): RecallHit {
  const freshness = sourceFreshness(source.sourceDate, source.staleAfterDays, now);
  return {
    chunkId, excerpt: text.slice(0, 360), source: { ...source, freshness }, entityLinks: source.entities,
    receipt: { source: source.origin, date: source.sourceDate, freshness, refreshedAt: source.refreshedAt },
  };
}
