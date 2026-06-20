// Pure, immutable model for the prompt-bar input-history picker overlay. No Ink/React,
// no fs, no clock — the caller supplies the prior prompt-bar inputs (history). The
// filter/rank and the selection-state transitions are unit-tested in isolation
// (history-picker.test.ts). Mirrors the substring-match style of repl/search-cmd.ts
// and skills/recall.ts: case-insensitive substring, starts-with ranked over contains.
//
// WIRING (not done this round, named for the clarity gate): ui/composer.tsx would open
// this overlay on a chord (e.g. ^R, the readline reverse-search convention) with
// `openHistoryPicker(props.history)`; keypresses drive `updateQuery`/`moveSelection`;
// Enter calls `selectedEntry(state)` and, if non-null, sets the composer buffer to it;
// a ComposerView-sibling overlay component renders `formatHistoryPicker(state)`.

/** The picker's full immutable state. `filtered` is always the ranked view of `entries` for `query`. */
export type HistoryPickerState = {
  readonly entries: readonly string[];
  readonly query: string;
  readonly filtered: readonly string[];
  readonly selectedIndex: number;
};

/** Max rows shown — an empty query lists the most-recent inputs; a query lists the top matches. */
export const MAX_HISTORY_RESULTS = 20;

const SELECTED_MARK = "▶ ";
const UNSELECTED_MARK = "  ";

// ANSI escape sequences (OSC `ESC]...BEL/ST`, CSI `ESC[...m`, and any other bare ESC)
// plus the C0/C1 control ranges, written with explicit \u code points so the source
// carries NO literal control bytes. Stripping these stops a prior input from injecting
// terminal escapes into the rendered overlay (same threat model as search-cmd.ts).
const ANSI_ESCAPE = new RegExp("\\u001b(?:\\][\\s\\S]*?(?:\\u0007|\\u001b\\\\)|\\[[0-9;?]*[ -/]*[@-~]|.)", "g");
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");

/** Strip ANSI escapes + control chars, collapse whitespace runs to one space, trim. */
function sanitize(text: string): string {
  return text
    .replace(ANSI_ESCAPE, "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop runs of identical consecutive entries (keeps the first of each run). Order preserved. */
function dedupeConsecutive(entries: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    if (out.length === 0 || out[out.length - 1] !== entry) out.push(entry);
  }
  return out;
}

/**
 * Filter + rank prior prompt-bar inputs against `query`.
 *
 * Pure. Case-insensitive substring match. Rank: starts-with the query outranks a
 * mere contains; within a rank, more-recent entries come first (the input list is
 * oldest→newest, so recency = higher original index). Consecutive duplicate inputs
 * are collapsed before ranking. An empty/whitespace query returns the most-recent
 * inputs (newest first). Capped at `MAX_HISTORY_RESULTS`.
 */
export function filterHistory(entries: readonly string[], query: string): string[] {
  const deduped = dedupeConsecutive(entries);
  // index = recency rank (later in the original list = more recent).
  const indexed = deduped.map((value, index) => ({ value, index }));
  const q = query.trim().toLowerCase();

  if (q === "") {
    return indexed
      .sort((a, b) => b.index - a.index)
      .slice(0, MAX_HISTORY_RESULTS)
      .map((e) => e.value);
  }

  const scored = indexed
    .map((e) => ({ ...e, rank: matchRank(e.value, q) }))
    .filter((e) => e.rank > 0);

  scored.sort((a, b) => b.rank - a.rank || b.index - a.index);
  return scored.slice(0, MAX_HISTORY_RESULTS).map((e) => e.value);
}

/** 2 = entry starts with the query, 1 = entry contains it, 0 = no match. Case-insensitive. */
function matchRank(entry: string, lowerQuery: string): number {
  const lower = entry.toLowerCase();
  if (lower.startsWith(lowerQuery)) return 2;
  if (lower.includes(lowerQuery)) return 1;
  return 0;
}

/** Open the picker over `entries` (oldest→newest): empty query, recent-first filtered view, top selected. */
export function openHistoryPicker(entries: readonly string[]): HistoryPickerState {
  return { entries, query: "", filtered: filterHistory(entries, ""), selectedIndex: 0 };
}

/** Re-filter for a new query and reset the selection to the first (top) row. */
export function updateQuery(state: HistoryPickerState, query: string): HistoryPickerState {
  return { ...state, query, filtered: filterHistory(state.entries, query), selectedIndex: 0 };
}

/**
 * Move the selection by `delta` (e.g. -1 up, +1 down), clamped to the filtered list
 * (no wrap past either end). An empty list keeps the index at 0.
 */
export function moveSelection(state: HistoryPickerState, delta: number): HistoryPickerState {
  const max = state.filtered.length - 1;
  if (max < 0) return { ...state, selectedIndex: 0 };
  const next = Math.max(0, Math.min(max, state.selectedIndex + delta));
  return { ...state, selectedIndex: next };
}

/** The currently-selected entry (the row the operator would pick), or null when the list is empty. */
export function selectedEntry(state: HistoryPickerState): string | null {
  return state.filtered[state.selectedIndex] ?? null;
}

/**
 * Render the overlay block: a query line, then one control-stripped row per filtered
 * entry (`▶ ` marks the selected row, `  ` the rest). An empty filtered list shows a
 * clear "no history" line. Both the echoed query and every entry are sanitized so a
 * prior input can never inject terminal escapes into the overlay.
 */
export function formatHistoryPicker(state: HistoryPickerState): string {
  const queryLine = `history › ${sanitize(state.query)}`;
  if (state.filtered.length === 0) return `${queryLine}\n  (no history)`;
  const rows = state.filtered.map((entry, i) => {
    const mark = i === state.selectedIndex ? SELECTED_MARK : UNSELECTED_MARK;
    return `${mark}${sanitize(entry)}`;
  });
  return `${queryLine}\n${rows.join("\n")}`;
}
