import { wordLeft, wordRight, killToStart, killToEnd, killWordBack, deleteForward, yank } from "../term/composer-edits.js";

// Pure readline/emacs key logic for the v2 composer. No React, no Ink — a key +
// (value, cursor, killRing) maps to a new (value, cursor) and optionally a kill.
// Reuses the proven composer-edits primitives. History navigation is the same
// pure transform the old composer shipped.

export type Key = {
  leftArrow?: boolean; rightArrow?: boolean; upArrow?: boolean; downArrow?: boolean;
  ctrl?: boolean; meta?: boolean; shift?: boolean; tab?: boolean; return?: boolean;
  escape?: boolean; backspace?: boolean; delete?: boolean; super?: boolean;
};

export type Edit = { value: string; cursor: number; kill?: string };

export type HistState = { histIdx: number; draft: string; value: string };

/** ↑/↓ (or ^P/^N) over the input history. histIdx -1 = editing the live draft. */
export function navigateHistory(history: string[], state: HistState, dir: "up" | "down"): HistState {
  if (dir === "up") {
    if (history.length === 0) return state;
    const draft = state.histIdx === -1 ? state.value : state.draft;
    const histIdx = Math.min(state.histIdx + 1, history.length - 1);
    return { histIdx, draft, value: history[history.length - 1 - histIdx] ?? "" };
  }
  if (state.histIdx <= 0) return { histIdx: -1, draft: "", value: state.draft };
  const histIdx = state.histIdx - 1;
  return { ...state, histIdx, value: history[history.length - 1 - histIdx] ?? "" };
}

type S = { value: string; cursor: number; killRing: string };
type Entry = { match: (i: string, k: Key) => boolean; run: (s: S) => Edit };

// Movement + kill/yank readline chords. Each run is a one-liner so the table
// stays flat and the dispatcher's complexity is trivially low.
const TABLE: Entry[] = [
  { match: (i, k) => Boolean(k.leftArrow) || (Boolean(k.ctrl) && i === "b"), run: (s) => ({ value: s.value, cursor: Math.max(0, s.cursor - 1) }) },
  { match: (i, k) => Boolean(k.rightArrow) || (Boolean(k.ctrl) && i === "f"), run: (s) => ({ value: s.value, cursor: Math.min(s.value.length, s.cursor + 1) }) },
  { match: (i, k) => Boolean(k.ctrl) && i === "a", run: (s) => ({ value: s.value, cursor: 0 }) },
  { match: (i, k) => Boolean(k.ctrl) && i === "e", run: (s) => ({ value: s.value, cursor: s.value.length }) },
  { match: (i, k) => Boolean(k.meta) && i === "b", run: (s) => ({ value: s.value, cursor: wordLeft(s.value, s.cursor) }) },
  { match: (i, k) => Boolean(k.meta) && i === "f", run: (s) => ({ value: s.value, cursor: wordRight(s.value, s.cursor) }) },
  // ^U or Cmd+Backspace (super) — kill to line start (the macOS "clear line" chord)
  { match: (i, k) => (Boolean(k.ctrl) && i === "u") || (Boolean(k.super) && (Boolean(k.backspace) || Boolean(k.delete))), run: (s) => { const r = killToStart(s.value, s.cursor); return { value: r.value, cursor: r.cursor, kill: r.killed }; } },
  { match: (i, k) => Boolean(k.ctrl) && i === "k", run: (s) => { const r = killToEnd(s.value, s.cursor); return { value: r.value, cursor: s.cursor, kill: r.killed }; } },
  { match: (i, k) => (Boolean(k.ctrl) && i === "w") || (Boolean(k.meta) && (Boolean(k.backspace) || Boolean(k.delete))), run: (s) => { const r = killWordBack(s.value, s.cursor); return { value: r.value, cursor: r.cursor, kill: r.killed }; } },
  { match: (i, k) => Boolean(k.ctrl) && i === "d", run: (s) => ({ value: deleteForward(s.value, s.cursor), cursor: s.cursor }) },
  { match: (i, k) => Boolean(k.ctrl) && i === "y", run: (s) => { const r = yank(s.value, s.cursor, s.killRing); return { value: r.value, cursor: r.cursor }; } },
];

/** Most-recent history entry that extends `prefix` — returns the suffix to append,
 *  or "" when no match, prefix is empty, or the entry equals the prefix exactly. */
export function historyTypeahead(history: string[], prefix: string): string {
  if (!prefix || prefix.includes("\n")) return "";
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry !== undefined && entry !== prefix && entry.startsWith(prefix)) return entry.slice(prefix.length);
  }
  return "";
}

/** Apply one keypress to the buffer. Returns null for keys this layer ignores
 * (Enter, arrows used for history/palette, and other non-printables). */
export function readlineEdit(s: S, input: string, key: Key): Edit | null {
  const entry = TABLE.find((e) => e.match(input, key));
  if (entry) return entry.run(s);
  return charEdit(s, input, key);
}

function charEdit(s: S, input: string, key: Key): Edit | null {
  if (key.backspace || key.delete) {
    if (s.cursor === 0) return null;
    return { value: s.value.slice(0, s.cursor - 1) + s.value.slice(s.cursor), cursor: s.cursor - 1 };
  }
  if (isPrintable(input, key)) return { value: s.value.slice(0, s.cursor) + input + s.value.slice(s.cursor), cursor: s.cursor + input.length };
  return null;
}

function isPrintable(input: string, key: Key): boolean {
  return Boolean(input) && !key.ctrl && !key.meta && !key.super && !key.tab && !key.upArrow && !key.downArrow && !key.escape && !key.return;
}
