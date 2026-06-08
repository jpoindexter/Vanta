import type { SlashHandler } from "./types.js";
import { searchSessions, formatSearchResults } from "../sessions/search.js";

// SESSION-SEARCH REPL handler — delegates to searchSessions + formatSearchResults.
// Wired into the existing /sessions handler when arg starts with "search ".

/** `/sessions search <query>` — full-text search across all persisted sessions. */
export const sessionsSearch: SlashHandler = async (arg, ctx) => {
  const query = arg.trim();
  if (!query) return { output: "  usage: /sessions search <query>" };
  const matches = await searchSessions(query, ctx.env);
  return { output: formatSearchResults(matches, query) };
};
