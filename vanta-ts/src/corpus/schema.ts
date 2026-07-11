export type CorpusKind = "local" | "url";
export type Freshness = "fresh" | "stale";

export type CorpusChunk = {
  id: string;
  text: string;
  index: number;
  embedding?: number[];
};

export type CorpusSource = {
  id: string;
  kind: CorpusKind;
  origin: string;
  relativePath?: string;
  title: string;
  sourceDate: string;
  ingestedAt: string;
  refreshedAt: string;
  staleAfterDays: number;
  freshness: Freshness;
  contentHash: string;
  entities: string[];
  chunks: CorpusChunk[];
};

export type CorpusIndex = { version: 1; sources: CorpusSource[] };
export type Embedder = (text: string) => Promise<number[] | null>;

export type CorpusReceipt = {
  source: string;
  date: string;
  freshness: Freshness;
  refreshedAt: string;
};

export function sourceFreshness(sourceDate: string, staleAfterDays: number, now: Date): Freshness {
  const age = now.getTime() - new Date(sourceDate).getTime();
  return age > staleAfterDays * 86_400_000 ? "stale" : "fresh";
}
