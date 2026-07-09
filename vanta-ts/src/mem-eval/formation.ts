import { existsSync } from "node:fs";
import { join } from "node:path";
import { QUESTIONS } from "./corpus.js";
import { recallAtK } from "./grade.js";
import { loadLoCoMo, loadLongMemEval } from "./public-loader.js";
import { resolveRetriever, type RankCtx } from "./retrievers.js";
import type { MemCategory, MemQuestion, MemoryRecord, PublicDataset, PublicMemCase } from "./types.js";

export type FormationStrategy = "crystallize" | "add_only" | "add_only_agent_facts";

type FormationEvent = MemoryRecord & {
  topic?: string;
  source: "conversation" | "agent-confirmed";
};

export type FormationEvalCell = {
  strategy: FormationStrategy;
  records: number;
  agentFacts: number;
  recallAtK: number;
  byCategory: Partial<Record<MemCategory, number>>;
};

export type FormationEvalReport = {
  k: number;
  generatedAt: string;
  questions: number;
  cells: FormationEvalCell[];
  publicBenchmarks: Array<{
    dataset: PublicDataset;
    cases: number;
    totalCases: number;
    cells: FormationEvalCell[];
  }>;
  decision: string;
  publicDatasets: Array<{ dataset: PublicDataset; available: boolean; path: string }>;
};

const K = 5;
const NOW = Date.parse("2026-07-09T00:00:00Z");
const DEFAULT_PUBLIC_CASE_LIMIT = 50;

const EVENTS: FormationEvent[] = [
  { id: "g-editor-old", session: 1, at: "2024-01-10", topic: "editor", source: "conversation", text: "Jason's primary code editor is VS Code." },
  { id: "g-editor-new", session: 8, at: "2024-06-02", topic: "editor", source: "conversation", text: "Jason switched his primary code editor to Zed for speed." },
  { id: "g-prov-old", session: 2, at: "2024-02-01", topic: "provider", source: "conversation", text: "Vanta's default LLM provider was set to OpenAI." },
  { id: "g-prov-new", session: 9, at: "2024-06-10", topic: "provider", source: "conversation", text: "Vanta's default LLM provider is now local Ollama for routine work." },
  { id: "g-proj-indx", session: 3, at: "2024-02-15", source: "conversation", text: "Jason is actively building indx, an AI second-brain Mac app." },
  { id: "g-proj-vanta", session: 4, at: "2024-03-01", source: "conversation", text: "Jason is actively building Vanta, a local trusted-operator agent." },
  { id: "g-proj-brutal", session: 5, at: "2024-03-20", source: "conversation", text: "Jason is actively building brutal, an AI design builder studio app." },
  { id: "g-stack-esm", session: 1, at: "2024-01-12", source: "conversation", text: "Jason's stack is Node 22 with ESM and TypeScript strict mode." },
  { id: "g-stack-zod", session: 6, at: "2024-04-02", source: "conversation", text: "Jason requires Zod validation at every external boundary." },
  { id: "g-pref-options", session: 7, at: "2024-05-01", source: "conversation", text: "Jason prefers choices as a plain-text numbered list with a recommendation, not a picker widget." },
  { id: "g-pref-push", session: 7, at: "2024-05-01", source: "conversation", text: "Jason wants every commit pushed to origin immediately, with no batching." },
  { id: "g-temp-valencia", session: 2, at: "2024-01-20", source: "conversation", text: "Jason relocated to Valencia on 2023-09-01." },
  { id: "g-temp-rewrite", session: 10, at: "2024-06-15", source: "conversation", text: "The Vanta public-prep git history rewrite happened on 2026-06-17." },
  { id: "g-temp-dur", session: 5, at: "2024-03-21", source: "conversation", text: "Jason has been a software developer for 15 years." },
  { id: "g-temp-firstcommit", session: 1, at: "2024-01-09", source: "conversation", text: "Jason's first open-source commit was on 2010-03-12." },
  { id: "g-temp-indx-start", session: 3, at: "2024-02-14", source: "conversation", text: "Jason began building indx on 2023-06-15." },
  { id: "a-pushed-b6d7d33e", session: 11, at: "2026-07-09", source: "agent-confirmed", text: "Vanta confirmed commit b6d7d33e was pushed to origin/main for the messaging progress bubble." },
];

const AGENT_QUESTIONS: MemQuestion[] = [
  {
    id: "af1",
    query: "which commit did Vanta confirm pushing for the messaging progress bubble",
    category: "information-extraction",
    gold: ["a-pushed-b6d7d33e"],
  },
];

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function formedRecords(strategy: FormationStrategy): MemoryRecord[] {
  const includeAgent = strategy === "add_only_agent_facts";
  const events = EVENTS.filter((e) => includeAgent || e.source !== "agent-confirmed");
  if (strategy !== "crystallize") return events;
  const byTopic = new Map<string, FormationEvent>();
  const records: FormationEvent[] = [];
  for (const event of events) {
    if (!event.topic) records.push(event);
    else byTopic.set(event.topic, event);
  }
  return [...records, ...byTopic.values()];
}

function byCategory(questions: MemQuestion[], scores: number[]): Partial<Record<MemCategory, number>> {
  const buckets = new Map<MemCategory, number[]>();
  questions.forEach((q, i) => buckets.set(q.category, [...(buckets.get(q.category) ?? []), scores[i] ?? 0]));
  return Object.fromEntries([...buckets].map(([cat, vals]) => [cat, round(mean(vals))]));
}

function scoreRecords(strategy: FormationStrategy, records: MemoryRecord[], questions: MemQuestion[], k: number): FormationEvalCell {
  const retriever = resolveRetriever("lexical");
  const ctx: RankCtx = { now: NOW, queryVec: null, recordVecs: new Map() };
  const scores = questions.map((q) => recallAtK(retriever.rank(q.query, records, ctx), q.gold, k));
  return {
    strategy,
    records: records.length,
    agentFacts: records.filter((r) => r.id.startsWith("a-")).length,
    recallAtK: round(mean(scores)),
    byCategory: byCategory(questions, scores),
  };
}

function scoreStrategy(strategy: FormationStrategy, questions: MemQuestion[], k: number): FormationEvalCell {
  return scoreRecords(strategy, formedRecords(strategy), questions, k);
}

function publicAvailability(dataDir: string): FormationEvalReport["publicDatasets"] {
  const longPath = ["longmemeval_oracle.json", "longmemeval_s_cleaned.json", "longmemeval_s.json"]
    .map((name) => join(dataDir, name))
    .find(existsSync) ?? join(dataDir, "longmemeval_oracle.json");
  const locomoPath = join(dataDir, "locomo10.json");
  return [
    { dataset: "longmemeval", available: existsSync(longPath), path: longPath },
    { dataset: "locomo", available: existsSync(locomoPath), path: locomoPath },
  ];
}

function crystallizedPublicRecords(c: PublicMemCase): { records: MemoryRecord[]; gold: string[] } {
  const bySession = new Map<number, MemoryRecord[]>();
  for (const r of c.records) bySession.set(r.session, [...(bySession.get(r.session) ?? []), r]);
  const records = [...bySession].map(([session, list]) => {
    const id = `${c.id}:crystallized-session:${session}`;
    return {
      id,
      session,
      at: list.map((r) => r.at).sort().at(-1) ?? "1970-01-01",
      text: list.map((r) => r.text).join("\n"),
    };
  });
  const goldSessions = new Set(c.records.filter((r) => c.question.gold.includes(r.id)).map((r) => r.session));
  const gold = records.filter((r) => goldSessions.has(r.session)).map((r) => r.id);
  return { records, gold };
}

function publicCaseFor(strategy: FormationStrategy, c: PublicMemCase): { records: MemoryRecord[]; question: MemQuestion } {
  if (strategy !== "crystallize") return { records: c.records, question: c.question };
  const formed = crystallizedPublicRecords(c);
  return { records: formed.records, question: { ...c.question, gold: formed.gold } };
}

function scorePublic(strategy: FormationStrategy, cases: PublicMemCase[], k: number): FormationEvalCell {
  const formed = cases.map((c) => publicCaseFor(strategy, c));
  const records = formed.flatMap((c) => c.records);
  const questions = formed.map((c) => c.question);
  return scoreRecords(strategy, records, questions, k);
}

function runPublicBenchmarks(
  publicDatasets: FormationEvalReport["publicDatasets"],
  k: number,
  publicCaseLimit: number,
): FormationEvalReport["publicBenchmarks"] {
  return publicDatasets.flatMap((d) => {
    if (!d.available) return [];
    const loaded = d.dataset === "longmemeval" ? loadLongMemEval(d.path) : loadLoCoMo(d.path);
    const cases = loaded.cases.slice(0, publicCaseLimit);
    const strategies: FormationStrategy[] = ["crystallize", "add_only", "add_only_agent_facts"];
    return [{ dataset: d.dataset, cases: cases.length, totalCases: loaded.cases.length, cells: strategies.map((s) => scorePublic(s, cases, k)) }];
  });
}

function decisionFor(args: {
  fixtureBest: FormationEvalCell;
  publicDatasets: FormationEvalReport["publicDatasets"];
  publicBenchmarks: FormationEvalReport["publicBenchmarks"];
  k: number;
}): string {
  const missing = args.publicDatasets.filter((d) => !d.available).map((d) => d.dataset).join(", ");
  if (missing) {
    return `Park adoption on public-data proof; fixture winner is ${args.fixtureBest.strategy} at ${(args.fixtureBest.recallAtK * 100).toFixed(1)}% recall@${args.k}, but missing ${missing}.`;
  }
  const publicRows = args.publicBenchmarks.flatMap((b) => b.cells);
  const totals = new Map<FormationStrategy, number[]>();
  for (const c of [args.fixtureBest, ...publicRows]) totals.set(c.strategy, [...(totals.get(c.strategy) ?? []), c.recallAtK]);
  const ranked = [...totals].map(([strategy, vals]) => ({ strategy, score: mean(vals) })).sort((a, b) => b.score - a.score);
  const best = ranked[0]!;
  return `Adopt candidate: ${best.strategy} leads fixture+public mean at ${(best.score * 100).toFixed(1)}% recall@${args.k}; agent-confirmed facts stay first-class.`;
}

export function runFormationEval(opts: { dataDir: string; k?: number; now?: Date; publicCaseLimit?: number }): FormationEvalReport {
  const k = opts.k ?? K;
  const questions = [...QUESTIONS, ...AGENT_QUESTIONS];
  const cells = (["crystallize", "add_only", "add_only_agent_facts"] as const).map((s) => scoreStrategy(s, questions, k));
  const best = [...cells].sort((a, b) => b.recallAtK - a.recallAtK || a.records - b.records)[0]!;
  const publicDatasets = publicAvailability(opts.dataDir);
  const publicCaseLimit = opts.publicCaseLimit ?? DEFAULT_PUBLIC_CASE_LIMIT;
  const publicBenchmarks = runPublicBenchmarks(publicDatasets, k, publicCaseLimit);
  const decision = decisionFor({ fixtureBest: best, publicDatasets, publicBenchmarks, k });
  return { k, generatedAt: (opts.now ?? new Date()).toISOString(), questions: questions.length, cells, publicBenchmarks, decision, publicDatasets };
}
