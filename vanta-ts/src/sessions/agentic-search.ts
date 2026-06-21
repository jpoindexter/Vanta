// VANTA-AGENTIC-SESSION-SEARCH — semantic ("find the session where I…") search
// across past sessions. A cheap-model side-query ranks the candidate session list
// (titles + previews + dates) by MEANING against the query and returns the best
// matches with a one-line why. Everything here is PURE + injectable: the prompt
// build, the result parse, and a lexical FALLBACK are unit-tested with no real LLM,
// and `searchSessions` injects the model call. Errors-as-values: it never throws,
// and a disabled / failed / empty agentic call degrades to the lexical fallback so
// it always returns something useful.
//
// The live caller (NOT wired this round — clarity-gate) is a
// `vanta sessions search <q>` command or the resume picker: it would load each
// session's preview (reuse buildSessionPreview from ./preview.js for the
// `preview` field), build candidates from listSessions() metadata, resolve a cheap
// provider (VANTA_MODEL_CHEAP via routing/model-router.ts), and pass a
// `complete` that calls that provider's `complete(...)` returning the text.

/** One candidate session for ranking: its id, human title, and a content preview. */
export type SessionCandidate = {
  /** Session id (e.g. "20260620-141233"). */
  id: string;
  /** Human title (already derived upstream by deriveTitle). */
  title: string;
  /** A compact content preview (reuse buildSessionPreview); "" when none. */
  preview: string;
};

/** One ranked match: a valid session id plus a one-line reason it matched. */
export type SessionSearchMatch = {
  /** The matched session id — guaranteed to be one of the input candidates. */
  id: string;
  /** A short human reason this session is relevant. May be "". */
  why: string;
};

/** Injected dependencies for {@link searchSessions}. */
export type SessionSearchDeps = {
  /**
   * The model call: takes the built side-query prompt, returns the raw LLM text.
   * Injected so tests never touch a real provider. May reject — searchSessions
   * catches it and falls back to lexical.
   */
  complete: (prompt: string) => Promise<string>;
  /**
   * Master switch. False → skip the model entirely and use the lexical fallback.
   * Lets a caller disable semantic search (no cheap model configured) cheaply.
   */
  enabled: boolean;
};

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

/**
 * Semantic session search with a guaranteed lexical fallback. Errors-as-values:
 * NEVER throws.
 *
 * - `deps.enabled === false` → skip the model, return {@link lexicalSessionSearch}.
 * - enabled → build the prompt, call `deps.complete`, parse the result keeping
 *   only valid candidate ids. If the call rejects, or the parse yields no matches,
 *   fall back to the lexical ranker.
 *
 * So the agentic result is used only when it's enabled AND the call succeeds AND it
 * produced at least one valid match; otherwise the operator still gets the lexical
 * ranking. An empty candidate list returns `[]` either way.
 */
export async function searchSessions(
  query: string,
  candidates: SessionCandidate[],
  deps: SessionSearchDeps,
): Promise<SessionSearchMatch[]> {
  if (!deps.enabled) return lexicalSessionSearch(query, candidates);

  const validIds = candidates.map((c) => c.id);
  try {
    const response = await deps.complete(buildSessionSearchPrompt(query, candidates));
    const matches = parseSessionSearchResult(response, validIds);
    if (matches.length > 0) return matches;
  } catch {
    // fall through to lexical — a disabled/failing model never breaks search.
  }
  return lexicalSessionSearch(query, candidates);
}
