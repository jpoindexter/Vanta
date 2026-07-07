// BRAIN-BM25-LEXICAL — real BM25 lexical scoring (zero-dep), replacing bare
// token-density ranking so the lexical signal is IDF-weighted (rare terms
// matter more), length-normalized, lemmatized (plurals/verb forms collapse),
// and sigmoid-normalized to 0..1 so it FUSES cleanly with the semantic + entity
// signals. Pure; the eval harness A/Bs it against the density baseline.

const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "are", "be", "it"]);

// Ordered suffix rules: [suffix, minLen, replacement | strip-count]. First match
// wins. Data-driven so the function stays flat (no branch pileup).
const LEMMA_RULES: ReadonlyArray<{ suf: string; min: number; repl: string }> = [
  { suf: "ies", min: 5, repl: "y" }, // stories→story
  { suf: "sses", min: 5, repl: "ss" }, // classes→class (via -es)
  { suf: "ing", min: 5, repl: "" },
  { suf: "ed", min: 5, repl: "" },
];

/** Light suffix lemmatizer (no dep): collapse common plural/verb forms. Pure. */
export function lemmatize(token: string): string {
  for (const { suf, min, repl } of LEMMA_RULES) {
    if (token.length >= min && token.endsWith(suf)) return token.slice(0, -suf.length) + repl;
  }
  // Bare plural -s (but never -ss like "class").
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

/** Tokenize → lowercase alnum tokens, stopword-filtered, lemmatized. Pure. */
export function tokenizeLemmas(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(lemmatize);
}

export type Bm25Index = {
  /** doc id → its lemma token list. */
  docTokens: Map<string, string[]>;
  /** term → number of docs containing it (for IDF). */
  docFreq: Map<string, number>;
  /** Mean document length in tokens. */
  avgdl: number;
  /** Total document count. */
  n: number;
};

/** Build a BM25 index over id'd documents. Pure. */
export function buildBm25Index(docs: Array<{ id: string; text: string }>): Bm25Index {
  const docTokens = new Map<string, string[]>();
  const docFreq = new Map<string, number>();
  let total = 0;
  for (const d of docs) {
    const toks = tokenizeLemmas(d.text);
    docTokens.set(d.id, toks);
    total += toks.length;
    for (const t of new Set(toks)) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }
  return { docTokens, docFreq, avgdl: docs.length ? total / docs.length : 0, n: docs.length };
}

/** Robertson-Spärck-Jones IDF with the +1 guard (never negative). Pure. */
export function idf(term: string, index: Bm25Index): number {
  const df = index.docFreq.get(term) ?? 0;
  return Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
}

const K1 = 1.5;
const B = 0.75;

/** Raw BM25 score of a document (by id) for query lemmas. Pure. */
export function bm25Score(queryLemmas: string[], docId: string, index: Bm25Index): number {
  const toks = index.docTokens.get(docId);
  if (!toks || !toks.length || index.avgdl === 0) return 0;
  const freq = new Map<string, number>();
  for (const t of toks) freq.set(t, (freq.get(t) ?? 0) + 1);
  const lenNorm = 1 - B + B * (toks.length / index.avgdl);
  let score = 0;
  for (const q of new Set(queryLemmas)) {
    const f = freq.get(q) ?? 0;
    if (f === 0) continue;
    score += idf(q, index) * ((f * (K1 + 1)) / (f + K1 * lenNorm));
  }
  return score;
}

const NORM_MIDPOINT = 3;
const NORM_STEEPNESS = 0.6;

/** Sigmoid-normalize a raw BM25 score to 0..1 (mem0's normalize_bm25). Pure. */
export function normalizeBm25(raw: number, midpoint = NORM_MIDPOINT, steepness = NORM_STEEPNESS): number {
  return 1 / (1 + Math.exp(-steepness * (raw - midpoint)));
}

/**
 * Rank documents by normalized BM25, best-first. Only docs with a nonzero score
 * are returned (an empty signal stays empty so a fuser can skip it). Ties keep
 * input order. Pure.
 */
export function bm25Rank(query: string, docs: Array<{ id: string; text: string }>): Array<{ id: string; score: number }> {
  const index = buildBm25Index(docs);
  const q = tokenizeLemmas(query);
  const pos = new Map(docs.map((d, i) => [d.id, i]));
  return docs
    .map((d) => ({ id: d.id, score: normalizeBm25(bm25Score(q, d.id, index)) }))
    .filter((r) => bm25Score(q, r.id, index) > 0)
    .sort((a, b) => b.score - a.score || (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}
