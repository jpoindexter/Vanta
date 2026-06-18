import { rankResults } from "../search/life-rank.js";

// MEM-TEMPORAL-EVENTS — temporal reasoning is the category where plain retrieval is
// weakest: a query like "the earliest recorded event" shares no keywords with the
// memory that answers it. The Chronos finding: serialize memories WITH extracted
// temporal events (dates, intervals) as structured records and recall lifts. This
// module extracts explicit dates/durations from memory text into a queryable index
// and ranks date-bearing memories for when/earliest/latest/in-year/duration queries,
// falling back to lexical for non-temporal queries. Pure (no I/O, `now` injected).

const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;
const DURATION_RE = /\b(\d+)\s+(year|month|week|day)s?\b/gi;
const PER_YEAR: Readonly<Record<string, number>> = { year: 1, month: 1 / 12, week: 1 / 52, day: 1 / 365 };

export type TemporalRecord = { id: string; text: string };
export type TemporalEntry = { dateMs: number[]; durationYears: number[] };
export type TemporalIndex = Map<string, TemporalEntry>;

function dayMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? NaN : ms;
}

/** Extract explicit event dates (ISO + bare years) as epoch ms. Pure. */
export function extractDates(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(ISO_RE)) {
    const ms = dayMs(m[0]);
    if (!Number.isNaN(ms)) out.add(ms);
  }
  const isoYears = new Set([...text.matchAll(ISO_RE)].map((m) => m[1]));
  for (const m of text.matchAll(YEAR_RE)) {
    if (isoYears.has(m[0])) continue; // already counted via its ISO date
    const ms = dayMs(`${m[0]}-01-01`);
    if (!Number.isNaN(ms)) out.add(ms);
  }
  return [...out].sort((a, b) => a - b);
}

/** Extract explicit durations, normalized to years. Pure. */
export function extractDurations(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(DURATION_RE)) {
    const n = Number(m[1]);
    const per = PER_YEAR[m[2]!.toLowerCase()] ?? 0;
    if (n > 0 && per > 0) out.push(n * per);
  }
  return out;
}

/** Build the temporal index: record id → its extracted dates + durations. Pure. */
export function buildTemporalIndex(records: TemporalRecord[]): TemporalIndex {
  const index: TemporalIndex = new Map();
  for (const r of records) {
    index.set(r.id, { dateMs: extractDates(r.text), durationYears: extractDurations(r.text) });
  }
  return index;
}

export type TemporalQuery =
  | { type: "earliest" | "latest" | "duration" | "none" }
  | { type: "in-year"; year: number };

/** Classify a query's temporal intent. Pure. */
export function classifyTemporalQuery(query: string): TemporalQuery {
  const q = query.toLowerCase();
  if (/\b(earliest|first|oldest)\b/.test(q)) return { type: "earliest" };
  if (/\b(most recent|latest|newest|last)\b/.test(q)) return { type: "latest" };
  if (/\b(how long|duration|how many years|for how)\b/.test(q)) return { type: "duration" };
  const yr = q.match(/\b(?:in|during)\s+((?:19|20)\d{2})\b/);
  if (yr) return { type: "in-year", year: Number(yr[1]) };
  return { type: "none" };
}

/** Sort record ids by a per-entry score (null entries excluded). Pure. */
function scoredOrder(
  records: TemporalRecord[],
  index: TemporalIndex,
  pick: (e: TemporalEntry) => number | null,
  dir: "asc" | "desc",
): string[] {
  const scored: { id: string; v: number }[] = [];
  for (const r of records) {
    const e = index.get(r.id);
    const v = e ? pick(e) : null;
    if (v !== null && Number.isFinite(v)) scored.push({ id: r.id, v });
  }
  scored.sort((a, b) => (dir === "asc" ? a.v - b.v : b.v - a.v));
  return scored.map((x) => x.id);
}

/** Temporal-primary ids first, then the rest of the lexical order. Pure. */
function mergeRest(primary: string[], lexical: string[]): string[] {
  const seen = new Set(primary);
  return [...primary, ...lexical.filter((id) => !seen.has(id))];
}

/**
 * Rank records for a query against the temporal index. Temporal queries (earliest/
 * latest/duration/in-year) rank date- or duration-bearing memories first; every
 * other query falls back to the lexical ranker. `now` injected (keep pure).
 */
export function temporalRank(
  query: string,
  records: TemporalRecord[],
  index: TemporalIndex,
  now: number,
): string[] {
  const lexical = rankResults(records.map((r) => ({ source: r.id, snippet: r.text })), query, now).map((h) => h.source);
  const t = classifyTemporalQuery(query);
  if (t.type === "none") return lexical;
  let primary: string[] = [];
  if (t.type === "earliest") primary = scoredOrder(records, index, (e) => (e.dateMs.length ? Math.min(...e.dateMs) : null), "asc");
  else if (t.type === "latest") primary = scoredOrder(records, index, (e) => (e.dateMs.length ? Math.max(...e.dateMs) : null), "desc");
  else if (t.type === "duration") primary = scoredOrder(records, index, (e) => (e.durationYears.length ? Math.max(...e.durationYears) : null), "desc");
  else if (t.type === "in-year") primary = scoredOrder(records, index, (e) => (e.dateMs.some((ms) => new Date(ms).getUTCFullYear() === t.year) ? 1 : null), "desc");
  return mergeRest(primary, lexical);
}
