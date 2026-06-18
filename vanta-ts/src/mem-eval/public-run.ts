import { existsSync } from "node:fs";
import { join } from "node:path";
import { runMemEval, type EmbedFn } from "./run.js";
import { buildCell, recallAtK } from "./grade.js";
import { resolveRetriever, ALL_MODES, type RankCtx } from "./retrievers.js";
import { loadLoCoMo, loadLongMemEval } from "./public-loader.js";
import type {
  MemQuestion, PublicDataset, PublicDatasetReport, PublicMemCase, PublicMemCell,
  PublicMemEvalReport, PublicMemSkipped, RetrievalMode,
} from "./types.js";

const DEFAULT_K = 5;
const MODEL_GRADING_REASON = "Answer-correctness grading needs a live judge model; this runner records retrieval recall only.";

type Prepared = { available: boolean; recordVecs: Map<string, number[]>; queryVecs: Map<string, number[]> };
type Loaded = { dataset: PublicDataset; path: string; cases: PublicMemCase[]; skipped: PublicMemSkipped[] };

const nullPrep: Prepared = { available: false, recordVecs: new Map(), queryVecs: new Map() };

function defaultLongMemPath(dataDir: string): string | null {
  const names = ["longmemeval_oracle.json", "longmemeval_s_cleaned.json", "longmemeval_s.json"];
  return names.map((n) => join(dataDir, n)).find(existsSync) ?? null;
}

function loadDatasets(opts: { dataDir: string; longMemEvalPath?: string; locomoPath?: string }): Loaded[] {
  const out: Loaded[] = [];
  const longPath = opts.longMemEvalPath ?? defaultLongMemPath(opts.dataDir);
  if (longPath) out.push({ dataset: "longmemeval", path: longPath, ...loadLongMemEval(longPath) });
  const locomoPath = opts.locomoPath ?? join(opts.dataDir, "locomo10.json");
  if (existsSync(locomoPath)) out.push({ dataset: "locomo", path: locomoPath, ...loadLoCoMo(locomoPath) });
  return out;
}

async function prepare(cases: PublicMemCase[], embed: EmbedFn): Promise<Prepared> {
  const first = cases[0]?.question.query;
  if (!first || !(await embed(first))) return nullPrep;
  const recordVecs = new Map<string, number[]>();
  const queryVecs = new Map<string, number[]>();
  const seenRecords = new Map<string, string>();
  for (const c of cases) for (const r of c.records) seenRecords.set(r.id, r.text);
  for (const [id, text] of seenRecords) {
    const v = await embed(text);
    if (v) recordVecs.set(id, v);
  }
  for (const c of cases) {
    const v = await embed(c.question.query);
    if (v) queryVecs.set(c.question.id, v);
  }
  return { available: true, recordVecs, queryVecs };
}

function scoreDataset(args: {
  loaded: Loaded; modes: RetrievalMode[]; k: number; now: number; prep: Prepared;
}): PublicDatasetReport {
  const cells = args.modes.map((mode) => scoreMode({ ...args, mode }));
  const records = new Set(args.loaded.cases.flatMap((c) => c.records.map((r) => r.id))).size;
  return { dataset: args.loaded.dataset, sourcePath: args.loaded.path, cases: args.loaded.cases.length, skipped: args.loaded.skipped, records, cells };
}

function scoreMode(args: {
  loaded: Loaded; mode: RetrievalMode; k: number; now: number; prep: Prepared;
}): PublicMemCell {
  const retriever = resolveRetriever(args.mode);
  const available = retriever.canRunWithoutEmbeddings || args.prep.available;
  const questions: MemQuestion[] = args.loaded.cases.map((c) => c.question);
  const scores = args.loaded.cases.map((c) => {
    if (!available) return 0;
    const ctx: RankCtx = { now: args.now, queryVec: args.prep.queryVecs.get(c.question.id) ?? null, recordVecs: args.prep.recordVecs };
    const ranked = retriever.rank(c.question.query, c.records, ctx);
    return recallAtK(ranked, c.question.gold, args.k);
  });
  const cell = buildCell({ mode: args.mode, noise: "full", available, questions, scores });
  return { dataset: args.loaded.dataset, mode: args.mode, available, recallAtK: cell.recallAtK, byCategory: cell.byCategory };
}

export async function runPublicMemEval(opts: {
  dataDir: string;
  longMemEvalPath?: string;
  locomoPath?: string;
  modes?: RetrievalMode[];
  k?: number;
  now?: number;
  embed?: EmbedFn;
}): Promise<PublicMemEvalReport> {
  const modes = opts.modes ?? ALL_MODES;
  const k = opts.k ?? DEFAULT_K;
  const now = opts.now ?? Date.now();
  const loaded = loadDatasets(opts);
  const needEmbed = modes.some((m) => resolveRetriever(m).needsEmbeddings);
  const allCases = loaded.flatMap((d) => d.cases);
  const prep = needEmbed && allCases.length ? await prepare(allCases, opts.embed ?? (() => Promise.resolve(null))) : nullPrep;
  const fixture = await runMemEval({ modes, k, now, embed: opts.embed });
  return {
    k,
    generatedAt: new Date(now).toISOString(),
    fixture,
    datasets: loaded.map((d) => scoreDataset({ loaded: d, modes, k, now, prep })),
    modelGrading: { available: false, reason: MODEL_GRADING_REASON },
  };
}
