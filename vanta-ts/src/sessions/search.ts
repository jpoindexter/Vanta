import { listSessions, loadSession } from "./store.js";

// SESSION-SEARCH — full-text search across all persisted sessions.
// Scans message content (user + assistant only; system/tool excluded).
// Returns up to maxResults matches across up to maxSessions most-recent sessions.

export type SearchMatch = {
  sessionId: string;
  turnIndex: number;
  role: "user" | "assistant";
  snippet: string;
};

const SNIPPET_WINDOW = 100;
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_MAX_SESSIONS = 50;

/** Extract a ≤100-char snippet around the first occurrence of `query` in `text`. */
function makeSnippet(text: string, query: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, SNIPPET_WINDOW);
  const start = Math.max(0, idx - 40);
  const raw = text.slice(start, start + SNIPPET_WINDOW);
  const prefix = start > 0 ? "…" : "";
  const suffix = start + SNIPPET_WINDOW < text.length ? "…" : "";
  return `${prefix}${raw}${suffix}`;
}

/** Full-text search over persisted sessions (case-insensitive substring). Returns [] on error. */
export async function searchSessions(
  query: string,
  env: NodeJS.ProcessEnv,
  opts: { maxResults?: number; maxSessions?: number } = {},
): Promise<SearchMatch[]> {
  const maxResults = opts.maxResults ?? DEFAULT_MAX_RESULTS;
  const maxSessions = opts.maxSessions ?? DEFAULT_MAX_SESSIONS;

  if (!query.trim()) return [];

  try {
    const metas = await listSessions(env);
    const sessions = metas.slice(0, maxSessions);
    const matches: SearchMatch[] = [];
    const lower = query.toLowerCase();

    for (const meta of sessions) {
      if (matches.length >= maxResults) break;
      const session = await loadSession(meta.id, env);
      if (!session) continue;

      let turnIndex = 0;
      for (const msg of session.messages) {
        if (msg.role !== "user" && msg.role !== "assistant") continue;
        turnIndex++;
        const text = typeof msg.content === "string" ? msg.content : "";
        if (!text.toLowerCase().includes(lower)) continue;
        matches.push({
          sessionId: session.id,
          turnIndex,
          role: msg.role,
          snippet: makeSnippet(text, query),
        });
        if (matches.length >= maxResults) break;
      }
    }

    return matches;
  } catch {
    return [];
  }
}

/** Format search results for terminal display. */
export function formatSearchResults(matches: SearchMatch[], query: string): string {
  if (!matches.length) return `  no results for "${query}"`;
  const lines = matches.map(
    (m) => `  [${m.sessionId}] turn ${m.turnIndex} (${m.role}): ${m.snippet}`,
  );
  return `  ${matches.length} result(s) for "${query}":\n${lines.join("\n")}`;
}
