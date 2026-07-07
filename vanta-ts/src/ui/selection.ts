import { wordLeft, wordRight } from "../term/composer-edits.js";
import { lineBounds, moveVertical } from "./vim-motions.js";

// TUI-SELECT — a pure text-selection model for the composer: an (anchor, cursor)
// pair over the flat buffer. Shift-motions extend the selection; typing/cut/paste
// replace it. No React, no clipboard I/O here — the composer hook wires those.

export type Sel = { anchor: number; cursor: number };

/** The ordered [start,end) span of a selection. */
export function selRange(s: Sel): { start: number; end: number } {
  return { start: Math.min(s.anchor, s.cursor), end: Math.max(s.anchor, s.cursor) };
}

/** True when nothing is actually selected (anchor === cursor). */
export function selEmpty(s: Sel | null): s is null {
  return s === null || s.anchor === s.cursor;
}

/** The selected substring ("" when empty). */
export function selectedText(value: string, s: Sel | null): string {
  if (selEmpty(s)) return "";
  const { start, end } = selRange(s);
  return value.slice(start, end);
}

/** Whole-buffer selection (Cmd+A). */
export function selectAll(value: string): Sel {
  return { anchor: 0, cursor: value.length };
}

/** Remove the selection from the buffer; cursor lands at the start. */
export function deleteSelection(value: string, s: Sel): { value: string; cursor: number } {
  const { start, end } = selRange(s);
  return { value: value.slice(0, start) + value.slice(end), cursor: start };
}

/** Replace the selection with `text` (typing over it / paste); cursor after the insert. */
export function replaceSelection(value: string, s: Sel, text: string): { value: string; cursor: number } {
  const { start, end } = selRange(s);
  return { value: value.slice(0, start) + text + value.slice(end), cursor: start + text.length };
}

/** The directions a shift-motion can extend the selection. */
export type SelMotion =
  | "charLeft" | "charRight" | "wordLeft" | "wordRight"
  | "lineStart" | "lineEnd" | "lineUp" | "lineDown" | "bufStart" | "bufEnd";

// Each motion → the new cursor index on `value` from clamped `c`.
const MOTIONS: Record<SelMotion, (value: string, c: number) => number> = {
  charLeft: (_v, c) => Math.max(0, c - 1),
  charRight: (v, c) => Math.min(v.length, c + 1),
  wordLeft: (v, c) => wordLeft(v, c),
  wordRight: (v, c) => wordRight(v, c),
  lineStart: (v, c) => lineBounds(v, c).start,
  lineEnd: (v, c) => lineBounds(v, c).end,
  lineUp: (v, c) => moveVertical(v, c, -1, 1),
  lineDown: (v, c) => moveVertical(v, c, 1, 1),
  bufStart: () => 0,
  bufEnd: (v) => v.length,
};

/** Where a motion lands the cursor on `value` from `cursor` (no selection state). */
export function motionCursor(value: string, cursor: number, motion: SelMotion): number {
  const c = Math.max(0, Math.min(cursor, value.length));
  return MOTIONS[motion](value, c);
}

/**
 * Extend (or start) a selection by a shift-motion. With no existing selection the
 * anchor is dropped at the current cursor; the cursor then moves to the motion
 * target. Returns the new selection (collapses to a caret when anchor===cursor).
 */
export function extendSelection(value: string, current: Sel | null, cursor: number, motion: SelMotion): Sel {
  const anchor = current ? current.anchor : cursor;
  return { anchor, cursor: motionCursor(value, cursor, motion) };
}
