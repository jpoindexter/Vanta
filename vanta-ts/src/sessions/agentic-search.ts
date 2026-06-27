// VANTA-AGENTIC-SESSION-SEARCH — semantic ("find the session where I…") search
// across past sessions. A cheap-model side-query ranks the candidate session list
// (titles + previews + dates) by MEANING against the query and returns the best
// matches with a one-line why. The PURE core (prompt build, result parse, lexical
// FALLBACK) lives in ./ranking.ts and is unit-tested with no real LLM, re-exported
// here so callers import one module. `searchSessions` is the only impure piece: it
// injects the model call. Errors-as-values — it never throws, and a disabled /
// failed / empty agentic call degrades to the lexical fallback so it always returns
// something useful.
//
// The live caller (NOT wired this round — clarity-gate) is a
// `vanta sessions search <q>` command or the resume picker: it would load each
// session's preview (reuse buildSessionPreview from ./preview.js for the
// `preview` field), build candidates from listSessions() metadata, resolve a cheap
// provider (VANTA_MODEL_CHEAP via routing/model-router.ts), and pass a
// `complete` that calls that provider's `complete(...)` returning the text.
import {
  buildSessionSearchPrompt,
  parseSessionSearchResult,
  lexicalSessionSearch,
} from "./ranking.js";

export * from "./ranking.js";

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
