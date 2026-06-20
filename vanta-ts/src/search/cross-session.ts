import { rankResults, tokenize } from "./life-rank.js";
import type { LifeHit } from "./life.js";

// VANTA-GLOBAL-SEARCH-UI — full-text search across ALL stored sessions, not just
// the active one. Pure + injectable: sessions are passed in (the caller loads
// them via listSessions/loadSession), so this ranks over fixtures in tests with
// no real fs. Ranking reuses life-rank.ts (rankResults): term density +
// exact-phrase + title-hit + recency over the message text — no new dep.

const SNIPPET_MAX = 160;

/** The minimal session shape this search needs — a subset of sessions/store Session. */
export type SearchableSession = {
  id: string;
  title: string;
  messages: { role: string; content?: string }[];
};

/** One ranked cross-session hit: which session, which message, and why. */
export type SessionSearchHit = {
  sessionId: string;
  title: string;
  messageIndex: number;
  snippet: string;
  score: number;
};

// A LifeHit carrying the origin ref. rankResults spreads `{...hit}`, so these
// extra own-properties survive ranking — no identity map, no scoring duplication.
type SessionHit = LifeHit & { sessionId: string; messageIndex: number };

/** Trim a message to a single-line snippet, ellipsised at SNIPPET_MAX. */
function toSnippet(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > SNIPPET_MAX ? `${oneLine.slice(0, SNIPPET_MAX - 1)}…` : oneLine;
}

/**
 * Build the candidate list: one hit per message that contains ≥1 query token
 * (shrinks the corpus before ranking). The hit's `source` is the session title
 * (so the title-hit ranking bonus applies); origin id+index ride along as extra
 * own-properties that rankResults preserves through its spread.
 */
function collectCandidates(sessions: SearchableSession[], queryTokens: string[]): SessionHit[] {
  const tokenSet = new Set(queryTokens);
  const hits: SessionHit[] = [];
  for (const session of sessions) {
    session.messages.forEach((msg, messageIndex) => {
      const content = msg.content ?? "";
      if (!content) return;
      if (!tokenize(content).some((t) => tokenSet.has(t))) return;
      hits.push({
        source: session.title,
        snippet: toSnippet(content),
        sessionId: session.id,
        messageIndex,
      });
    });
  }
  return hits;
}

/**
 * Rank query matches across every stored session.
 * Pure: `sessions` injected, `now` passed in (call Date.now() at the boundary).
 * Empty query or no match → empty array. Returns hits sorted by relevance desc.
 */
export function searchSessions(
  query: string,
  sessions: SearchableSession[],
  now: number = Date.now(),
): SessionSearchHit[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const candidates = collectCandidates(sessions, queryTokens);
  if (candidates.length === 0) return [];

  return rankResults(candidates, query, now).map((r) => {
    const hit = r as typeof r & SessionHit;
    return {
      sessionId: hit.sessionId,
      title: hit.source,
      messageIndex: hit.messageIndex,
      snippet: hit.snippet,
      score: hit.relevance,
    };
  });
}
