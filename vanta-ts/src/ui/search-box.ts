// Pure, immutable model for the in-transcript search box (Ctrl+F style). No Ink/React,
// no fs, no clock — the caller supplies the live transcript (messages). The match-finding
// mirrors the case-insensitive substring scan of repl/search-cmd.ts (`searchTranscript`);
// the next/prev navigation-state transitions mirror ui/history-picker.ts's clamp style,
// but WRAP at the ends (a search box cycles through matches). Unit-tested in isolation
// (search-box.test.ts).
//
// WIRING (not done this round, named for the clarity gate): ui/app.tsx would open this
// overlay on a Ctrl+F chord (the readline find convention) with `openSearchBox()`; the
// composer keystrokes drive `updateSearchQuery(state, query, props.messages)`; `n`/`↓`
// call `nextMatch`, `N`/`↑` call `prevMatch`; an app.tsx-sibling overlay component renders
// `matchCountLabel(state)` ("match X of N") as the search bar's status. The CURRENT match
// (`currentMatch(state)` → {messageIndex, offset, length}) is the row ui/transcript.tsx
// would highlight and scroll into view (the messageIndex selects the row, offset+length
// the span to mark inside it). Esc would close the box (caller drops the state).

import type { Message } from "../types.js";

/** One match position: which message in the transcript, the char offset into its text, and the match length. */
export type Match = {
  readonly messageIndex: number;
  readonly offset: number;
  readonly length: number;
};

/**
 * The search box's full immutable state. `matches` is always the ordered match set for
 * `query` over the messages it was last `updateSearchQuery`'d against. `current` indexes
 * into `matches` (0-based), or -1 when there are no matches.
 */
export type SearchBoxState = {
  readonly query: string;
  readonly matches: readonly Match[];
  readonly current: number;
};

const NO_CURRENT = -1;

/** A message's searchable text (every role in the union carries a string `content`). */
function msgText(m: Message): string {
  return typeof m.content === "string" ? m.content : "";
}

/**
 * Every case-insensitive substring occurrence of `query` across the transcript, in
 * document order (message order, then left-to-right within each message). `system`
 * messages are skipped. An empty/whitespace query → `[]` (no navigation). Overlapping
 * matches are not double-counted: the scan advances past each hit by the query length.
 */
export function findMatches(messages: readonly Message[], query: string): Match[] {
  const q = query.trim();
  if (!q) return [];
  const lowerQuery = q.toLowerCase();

  const out: Match[] = [];
  messages.forEach((m, messageIndex) => {
    if (m.role === "system") return;
    const lowerText = msgText(m).toLowerCase();
    let from = 0;
    for (;;) {
      const at = lowerText.indexOf(lowerQuery, from);
      if (at < 0) break;
      out.push({ messageIndex, offset: at, length: lowerQuery.length });
      from = at + lowerQuery.length;
    }
  });
  return out;
}

/** Open an empty search box: no query, no matches, no current. */
export function openSearchBox(): SearchBoxState {
  return { query: "", matches: [], current: NO_CURRENT };
}

/**
 * Re-find matches for a new `query` over `messages` and reset the cursor to the first
 * match (0), or to -1 when there are none. Pure — returns a fresh state, never mutates.
 */
export function updateSearchQuery(
  state: SearchBoxState,
  query: string,
  messages: readonly Message[],
): SearchBoxState {
  const matches = findMatches(messages, query);
  return { ...state, query, matches, current: matches.length > 0 ? 0 : NO_CURRENT };
}

/** Advance the cursor by `delta` with wrap; no matches → stays at -1. */
function step(state: SearchBoxState, delta: number): SearchBoxState {
  const n = state.matches.length;
  if (n === 0) return { ...state, current: NO_CURRENT };
  const next = (((state.current + delta) % n) + n) % n;
  return { ...state, current: next };
}

/** Next match: advance the cursor, wrapping from the last match back to the first. */
export function nextMatch(state: SearchBoxState): SearchBoxState {
  return step(state, 1);
}

/** Previous match: retreat the cursor, wrapping from the first match back to the last. */
export function prevMatch(state: SearchBoxState): SearchBoxState {
  return step(state, -1);
}

/** The Match the cursor points at (to highlight + scroll to), or null when there are none. */
export function currentMatch(state: SearchBoxState): Match | null {
  if (state.current < 0 || state.current >= state.matches.length) return null;
  return state.matches[state.current] ?? null;
}

/**
 * The status label: `"X of N"` (1-based current) when there are matches, `"no matches"`
 * for a non-empty query with zero hits, `""` for an empty/whitespace query (the box is
 * idle, show nothing).
 */
export function matchCountLabel(state: SearchBoxState): string {
  if (state.query.trim() === "") return "";
  if (state.matches.length === 0) return "no matches";
  return `${state.current + 1} of ${state.matches.length}`;
}
