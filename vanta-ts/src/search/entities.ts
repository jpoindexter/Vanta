// BRAIN-ENTITY-SIGNAL — mem0's third retrieval signal beyond lexical + semantic:
// extract entities from each memory, link them across memories (entity → the
// records that mention it), and rank by entity match — with an IDF-like
// down-weight 1/(1+0.001·(n-1)²) so a ubiquitous entity (linked from n records)
// doesn't dominate. Extraction is DETERMINISTIC (no LLM): proper-noun spans,
// emails, and @handles — the eval runner's no-live-model rule applies here.

/** Capitalized tokens that are almost always sentence machinery, not entities. */
const CAP_STOPWORDS = new Set([
  "i", "a", "an", "the", "and", "but", "or", "so", "if", "as", "at", "by", "in",
  "on", "of", "to", "up", "it", "its", "is", "was", "are", "were", "be", "been",
  "he", "she", "they", "we", "you", "my", "his", "her", "our", "your", "their",
  "this", "that", "these", "those", "there", "here", "then", "when", "what",
  "where", "which", "who", "why", "how", "did", "do", "does", "not", "no", "yes",
  "also", "just", "after", "before", "with", "from", "for", "about", "because",
  "however", "although", "while", "during", "since", "until", "today", "yesterday",
  "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]);

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const HANDLE_RE = /(?<![\w@])@([A-Za-z0-9_]{2,})/g;
/** A capitalized word: Upper start, then letters (allows internal caps + digits). */
const CAP_WORD_RE = /^[A-Z][A-Za-z0-9'’-]+$/;

function capSpans(text: string): string[] {
  const out: string[] = [];
  let span: string[] = [];
  const flush = (): void => {
    if (!span.length) return;
    const words = span.filter((w) => !CAP_STOPWORDS.has(w.toLowerCase()));
    if (words.length) {
      if (words.length > 1) out.push(words.join(" ").toLowerCase());
      for (const w of words) out.push(w.toLowerCase());
    }
    span = [];
  };
  for (const raw of text.split(/\s+/)) {
    const word = raw.replace(/^[^A-Za-z0-9@]+|[^A-Za-z0-9'’-]+$/g, "");
    if (CAP_WORD_RE.test(word)) {
      span.push(word);
      // Trailing punctuation (comma, period, …) ends the span even though the
      // word itself is an entity — "Boston, Boston" is two mentions, not a span.
      if (/[^A-Za-z0-9'’-]$/.test(raw)) flush();
    } else {
      flush();
    }
  }
  flush();
  return out;
}

/**
 * Extract entity keys from a text: proper-noun spans (multiword span + each
 * word), emails, and @handles — lowercased, deduped, stopword-filtered.
 * Deterministic and pure; the rarity down-weight (not extraction cleverness)
 * is what keeps ubiquitous false positives from dominating.
 */
export function extractEntities(text: string): string[] {
  const out = new Set<string>(capSpans(text));
  for (const m of text.match(EMAIL_RE) ?? []) out.add(m.toLowerCase());
  for (const m of text.matchAll(HANDLE_RE)) out.add(`@${m[1]!.toLowerCase()}`);
  return [...out];
}

export type EntityIndex = {
  /** entity → ids of the records that mention it (the cross-memory links). */
  byEntity: Map<string, Set<string>>;
  /** record id → its extracted entities. */
  byRecord: Map<string, Set<string>>;
  /** Record ids in input order (stable tie-break for ranking). */
  order: string[];
};

/** Build the link index from records whose entities are ALREADY extracted
 * (e.g. stored on brain entries at write time). Pure. */
export function buildEntityIndexFrom(pairs: Array<{ id: string; entities: string[] }>): EntityIndex {
  const byEntity = new Map<string, Set<string>>();
  const byRecord = new Map<string, Set<string>>();
  const order: string[] = [];
  for (const r of pairs) {
    order.push(r.id);
    const ents = new Set(r.entities);
    byRecord.set(r.id, ents);
    for (const e of ents) {
      const ids = byEntity.get(e) ?? new Set<string>();
      ids.add(r.id);
      byEntity.set(e, ids);
    }
  }
  return { byEntity, byRecord, order };
}

/** Build the entity link index over a set of records (extracting inline). Pure. */
export function buildEntityIndex(records: Array<{ id: string; text: string }>): EntityIndex {
  return buildEntityIndexFrom(records.map((r) => ({ id: r.id, entities: extractEntities(r.text) })));
}

/**
 * mem0's over-link down-weight: an entity linked from n records contributes
 * 1/(1+0.001·(n-1)²) — full weight when unique, vanishing when ubiquitous. Pure.
 */
export function entityWeight(n: number): number {
  return 1 / (1 + 0.001 * (n - 1) ** 2);
}

/**
 * Score every record's entity match with the query: each shared entity adds its
 * rarity weight, normalized by the number of query entities so the result is
 * 0..1 regardless of query length. Records sharing nothing are absent. Pure.
 */
export function entityScores(query: string, index: EntityIndex): Map<string, number> {
  const queryEnts = extractEntities(query);
  const score = new Map<string, number>();
  if (!queryEnts.length) return score;
  for (const e of queryEnts) {
    const ids = index.byEntity.get(e);
    if (!ids) continue;
    const w = entityWeight(ids.size) / queryEnts.length;
    for (const id of ids) score.set(id, (score.get(id) ?? 0) + w);
  }
  return score;
}

/**
 * Rank record ids by entity match with the query. Only records sharing ≥1
 * entity rank (an empty signal must stay empty so a fuser can skip it); ties
 * keep input order. Pure.
 */
export function entityRank(query: string, index: EntityIndex): string[] {
  const pos = new Map(index.order.map((id, i) => [id, i]));
  return [...entityScores(query, index).entries()]
    .sort((a, b) => b[1] - a[1] || (pos.get(a[0]) ?? 0) - (pos.get(b[0]) ?? 0))
    .map(([id]) => id);
}
