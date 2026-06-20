import type { SlashHandler } from "./types.js";
import type { Message } from "../types.js";

/** A ranked transcript hit: which role, its turn index, and a highlighted snippet. */
export type SearchHit = { role: "user" | "assistant"; index: number; snippet: string };

const MAX_RESULTS = 10;
const SNIPPET_RADIUS = 30;
const SNIPPET_MAX = 120;
const ELLIPSIS = "…";

// ANSI escape sequences (OSC `ESC]...BEL/ST`, CSI `ESC[...m`, and any other bare ESC)
// plus the C0/C1 control ranges, written with explicit \u code points so the regex
// source carries NO literal control bytes. Stripping these stops transcript content
// from injecting terminal escapes into a rendered result line.
const ANSI_ESCAPE = new RegExp("\\u001b(?:\\][\\s\\S]*?(?:\\u0007|\\u001b\\\\)|\\[[0-9;?]*[ -/]*[@-~]|.)", "g");
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");

/**
 * Strip ANSI escape sequences + control chars so transcript content can never inject
 * escapes into the rendered result line, then collapse whitespace runs (incl.
 * newlines) to a single space.
 */
function sanitize(text: string): string {
  return text
    .replace(ANSI_ESCAPE, "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function msgText(m: Message): string {
  return typeof m.content === "string" ? m.content : "";
}

function cap(text: string): string {
  return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX - 1)}${ELLIPSIS}` : text;
}

/**
 * Build a `…<before>[match]<after>…` snippet centered on the FIRST case-insensitive
 * occurrence of `query` in `text`. Control/ANSI sequences are stripped, newlines are
 * collapsed, and the snippet is capped near `SNIPPET_MAX`. No match (or empty query)
 * → a plain sanitized, capped head of the text.
 */
export function buildSnippet(text: string, query: string, radius = SNIPPET_RADIUS): string {
  const clean = sanitize(text);
  const q = query.trim();
  if (!q) return cap(clean);

  const at = clean.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return cap(clean);

  const matched = clean.slice(at, at + q.length);
  const beforeStart = Math.max(0, at - radius);
  const afterEnd = Math.min(clean.length, at + q.length + radius);
  const lead = beforeStart > 0 ? ELLIPSIS : "";
  const tail = afterEnd < clean.length ? ELLIPSIS : "";
  return `${lead}${clean.slice(beforeStart, at)}[${matched}]${clean.slice(at + q.length, afterEnd)}${tail}`;
}

/** Count non-overlapping case-insensitive occurrences of `lowerQuery` in `lowerText`. */
function countMatches(lowerText: string, lowerQuery: string): number {
  let n = 0;
  let from = 0;
  for (;;) {
    const at = lowerText.indexOf(lowerQuery, from);
    if (at < 0) return n;
    n += 1;
    from = at + lowerQuery.length;
  }
}

/**
 * Pure full-text search over the live transcript. Case-insensitive substring match
 * across user + assistant messages (system/tool messages skipped). Ranked by match
 * count desc, recency (later turn) desc as the tiebreak, capped at `MAX_RESULTS`.
 * Empty query or no matches → `[]`.
 */
export function searchTranscript(messages: readonly Message[], query: string): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const lowerQuery = q.toLowerCase();

  const scored: Array<{ hit: SearchHit; count: number }> = [];
  messages.forEach((m, index) => {
    if (m.role !== "user" && m.role !== "assistant") return;
    const count = countMatches(msgText(m).toLowerCase(), lowerQuery);
    if (count === 0) return;
    scored.push({ hit: { role: m.role, index, snippet: buildSnippet(msgText(m), q) }, count });
  });

  scored.sort((a, b) => b.count - a.count || b.hit.index - a.hit.index);
  return scored.slice(0, MAX_RESULTS).map((s) => s.hit);
}

/**
 * Render ranked hits as a compact list, or a clear "no matches" line. Each line is
 * `[turn N] role: …snippet…`. The query is sanitized before display so it cannot
 * inject escapes either.
 */
export function formatSearchResults(results: readonly SearchHit[], query: string): string {
  const q = sanitize(query.trim());
  if (!q) return "  usage: /search <query>";
  if (!results.length) return `  no matches for "${q}"`;
  const lines = results.map((r) => `  [turn ${r.index}] ${r.role}: ${r.snippet}`);
  return `  ${results.length} match(es) for "${q}":\n${lines.join("\n")}`;
}

/**
 * `/search <query>` — full-text search the CURRENT session transcript and show a
 * compact ranked list of matching messages (role + turn index + highlighted snippet).
 */
export const search: SlashHandler = (arg, ctx) => ({
  output: formatSearchResults(searchTranscript(ctx.convo.messages, arg), arg),
});
