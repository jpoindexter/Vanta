// The PURE, no-LLM ranking core for agentic session search: the prompt build,
// the result parse, and the lexical FALLBACK. Everything here is injectable and
// unit-tested with no real provider; `searchSessions` (./agentic-search.ts) is
// the only impure piece — it injects the model call and orchestrates these.
import type { SessionCandidate, SessionSearchMatch } from "./agentic-search.js";

/** Cap on candidates embedded in the prompt — keeps the side-query cheap. */
const MAX_PROMPT_CANDIDATES = 40;
/** Cap on the preview length embedded per candidate, in characters. */
const MAX_PREVIEW_CHARS = 200;
/** Cap on returned matches (agentic and lexical both honor it). */
const MAX_MATCHES = 8;
/** Per-query-token field weights for the lexical fallback (title beats preview). */
const WEIGHT_TITLE = 3;
const WEIGHT_PREVIEW = 1;
/** Tokens shorter than this carry too little signal to rank on. */
const MIN_TOKEN_LENGTH = 2;

/** Truncate to `max` chars, appending an ellipsis when cut. Collapses whitespace. */
function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * Pure: build the cheap-model side-query that ranks `candidates` against `query`
 * by MEANING. The prompt names the user query and lists each candidate's id +
 * title + (clipped) preview, then asks for a JSON array of `{id, why}` for only
 * the most relevant sessions, best first, ids drawn ONLY from the list. Candidates
 * are capped (newest-first ordering is the caller's; we keep the head) and previews
 * clipped so the side-query stays cheap.
 */
export function buildSessionSearchPrompt(
  query: string,
  candidates: SessionCandidate[],
): string {
  const shown = candidates.slice(0, MAX_PROMPT_CANDIDATES);
  const lines = shown.map((c) => {
    const preview = c.preview ? ` — ${clip(c.preview, MAX_PREVIEW_CHARS)}` : "";
    return `- id: ${c.id} | title: ${clip(c.title, 120)}${preview}`;
  });
  return [
    "You are ranking a user's past chat sessions by how well each MATCHES THE MEANING",
    "of their search query — not just keyword overlap. Pick only the genuinely",
    "relevant sessions; if none fit, return an empty array.",
    "",
    `User query: ${query.replace(/\s+/g, " ").trim()}`,
    "",
    "Candidate sessions:",
    ...lines,
    "",
    'Respond with ONLY a JSON array of objects: [{"id": "<one of the ids above>",',
    '"why": "<one short line on why it matches>"}], best match first, at most',
    `${MAX_MATCHES} items. Use ids EXACTLY as listed. No prose, no code fences.`,
  ].join("\n");
}

/** Extract the first top-level JSON array substring from possibly-fenced text. */
function firstJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

/** Coerce one parsed array element into a match, or null if it's not usable. */
function toMatch(raw: unknown, validIds: ReadonlySet<string>): SessionSearchMatch | null {
  if (typeof raw !== "object" || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === "string" ? rec.id : "";
  if (!validIds.has(id)) return null; // drop hallucinated / missing ids
  const why = typeof rec.why === "string" ? clip(rec.why, 160) : "";
  return { id, why };
}

/**
 * Pure: parse the side-query response into matches, keeping ONLY ids present in
 * `validIds`. Tolerant — strips code fences / surrounding prose by extracting the
 * first JSON array, ignores non-object / non-string elements, drops hallucinated
 * ids, and de-duplicates (first occurrence wins). Returns `[]` on any garbage
 * (no array, invalid JSON, empty) rather than throwing. Capped at MAX_MATCHES.
 */
export function parseSessionSearchResult(
  llmResponse: string,
  validIds: readonly string[],
): SessionSearchMatch[] {
  const slice = firstJsonArray(llmResponse);
  if (!slice) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const allowed = new Set(validIds);
  const seen = new Set<string>();
  const matches: SessionSearchMatch[] = [];
  for (const element of parsed) {
    const match = toMatch(element, allowed);
    if (!match || seen.has(match.id)) continue;
    seen.add(match.id);
    matches.push(match);
    if (matches.length >= MAX_MATCHES) break;
  }
  return matches;
}

/** Lowercase, split on non-alphanumerics, drop tokens shorter than MIN_TOKEN_LENGTH. */
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

/** Score one candidate: per query token, weighted hits in title + preview. */
function scoreCandidate(candidate: SessionCandidate, tokens: string[]): number {
  const title = candidate.title.toLowerCase();
  const preview = candidate.preview.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += WEIGHT_TITLE;
    if (preview.includes(token)) score += WEIGHT_PREVIEW;
  }
  return score;
}

/** A short reason string naming which query tokens hit a candidate. */
function lexicalWhy(candidate: SessionCandidate, tokens: string[]): string {
  const title = candidate.title.toLowerCase();
  const preview = candidate.preview.toLowerCase();
  const hits = tokens.filter((t) => title.includes(t) || preview.includes(t));
  return hits.length ? `matches: ${[...new Set(hits)].join(", ")}` : "";
}

/**
 * Pure lexical FALLBACK: rank candidates by case-insensitive substring match of
 * the query tokens against title (weight 3) and preview (weight 1). Candidates
 * scoring zero are excluded; results sort by score descending, then title ascending
 * for determinism, capped at MAX_MATCHES. Empty / all-short query → `[]`. This is
 * what `searchSessions` returns whenever the agentic path is unavailable, so the
 * search always returns something useful.
 */
export function lexicalSessionSearch(
  query: string,
  candidates: SessionCandidate[],
): SessionSearchMatch[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored: Array<{ candidate: SessionCandidate; score: number }> = [];
  for (const candidate of candidates) {
    const score = scoreCandidate(candidate, tokens);
    if (score > 0) scored.push({ candidate, score });
  }
  scored.sort(
    (a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title),
  );
  return scored
    .slice(0, MAX_MATCHES)
    .map(({ candidate }) => ({ id: candidate.id, why: lexicalWhy(candidate, tokens) }));
}
