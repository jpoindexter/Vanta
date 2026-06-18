import { embed as ollamaEmbed } from "../search/embed.js";
import { buildCorpus, NOISE_LEVELS, QUESTIONS } from "./corpus.js";
import { resolveRetriever, ALL_MODES, type RankCtx } from "./retrievers.js";
import { recallAtK, buildCell } from "./grade.js";
import type {
  MemEvalReport, MemEvalCell, RetrievalMode, NoiseLevel, MemQuestion,
} from "./types.js";

// Orchestrate the recall eval: probe the embedder once, embed the union corpus +
// queries once (reused across noise levels), then score every (mode × noise) cell.
// Embeddings are INJECTED so tests stay offline; the default hits Ollama and the
// semantic/hybrid modes degrade gracefully (marked unavailable) when it is absent.

export type EmbedFn = (text: string) => Promise<number[] | null>;
const DEFAULT_K = 5;

const defaultEmbed: EmbedFn = (text) => ollamaEmbed(text, process.env);

type Prepared = { available: boolean; recordVecs: Map<string, number[]>; queryVecs: Map<string, number[]> };

/** Embed the full corpus + queries once; returns empty maps when no embedder. */
async function prepareEmbeddings(questions: MemQuestion[], embed: EmbedFn): Promise<Prepared> {
  const recordVecs = new Map<string, number[]>();
  const queryVecs = new Map<string, number[]>();
  const probe = await embed(questions[0]?.query ?? "ok");
  if (!probe) return { available: false, recordVecs, queryVecs };
  for (const r of buildCorpus("full")) {
    const v = await embed(r.text);
    if (v) recordVecs.set(r.id, v);
  }
  for (const q of questions) {
    const v = await embed(q.query);
    if (v) queryVecs.set(q.id, v);
  }
  return { available: true, recordVecs, queryVecs };
}

function scoreCell(args: {
  mode: RetrievalMode; noise: NoiseLevel; k: number; now: number;
  prep: Prepared; questions: MemQuestion[];
}): MemEvalCell {
  const retriever = resolveRetriever(args.mode);
  const available = retriever.canRunWithoutEmbeddings || args.prep.available;
  const scores = args.questions.map((q) => {
    if (!available) return 0;
    const ctx: RankCtx = { now: args.now, queryVec: args.prep.queryVecs.get(q.id) ?? null, recordVecs: args.prep.recordVecs };
    return recallAtK(retriever.rank(q.query, buildCorpus(args.noise), ctx), q.gold, args.k);
  });
  return buildCell({ mode: args.mode, noise: args.noise, available, questions: args.questions, scores });
}

export async function runMemEval(opts: {
  modes?: RetrievalMode[];
  noiseLevels?: NoiseLevel[];
  k?: number;
  now?: number;
  embed?: EmbedFn;
} = {}): Promise<MemEvalReport> {
  const modes = opts.modes ?? ALL_MODES;
  const noiseLevels = opts.noiseLevels ?? NOISE_LEVELS;
  const k = opts.k ?? DEFAULT_K;
  const now = opts.now ?? Date.now();
  const questions = QUESTIONS;
  const needEmbed = modes.some((m) => resolveRetriever(m).needsEmbeddings);
  const prep = needEmbed
    ? await prepareEmbeddings(questions, opts.embed ?? defaultEmbed)
    : { available: false, recordVecs: new Map(), queryVecs: new Map() };

  const cells: MemEvalCell[] = [];
  const corpusSizes: Partial<Record<NoiseLevel, number>> = {};
  for (const noise of noiseLevels) {
    corpusSizes[noise] = buildCorpus(noise).length;
    for (const mode of modes) cells.push(scoreCell({ mode, noise, k, now, prep, questions }));
  }
  return { k, questions: questions.length, corpusSizes, cells };
}
