import { wordLeft } from "../term/composer-edits.js";
import type { Key } from "./composer-keys.js";

// Pure vi-mode state machine for the composer. No React, no Ink — a keypress in
// normal mode maps (state, value, cursor) → new (state, value, cursor). Insert
// mode is handled by the composer's normal readline path; this module only owns
// normal-mode motions/operators and the transitions that enter insert mode.
// Fully unit-testable in isolation (vim-mode.test.ts). `register` is vi's single
// unnamed line register; `pending` holds a half-typed operator (d→dd, y→yy).

export type VimMode = "normal" | "insert";

/** Vim state carried across keypresses. */
export type VimState = { mode: VimMode; register: string; pending: string };

export const INITIAL_VIM: VimState = { mode: "normal", register: "", pending: "" };

/** Result of one normal-mode keypress. `handled:false` means the composer should
 * drop the key (normal mode never inserts a printable char). */
export type VimResult = { value: string; cursor: number; state: VimState; handled: boolean };

/** Bounds of the line containing `cursor`: [start, end) excluding the newline. */
function lineBounds(value: string, cursor: number): { start: number; end: number } {
  const c = Math.max(0, Math.min(cursor, value.length));
  const start = value.lastIndexOf("\n", c - 1) + 1;
  const nl = value.indexOf("\n", c);
  return { start, end: nl === -1 ? value.length : nl };
}

/** Clamp the cursor to a valid normal-mode column (rest on the last char like
 * vi; one-past-end only on an empty line). */
function clampNormal(value: string, cursor: number): number {
  const { start, end } = lineBounds(value, cursor);
  if (end === start) return start; // empty line
  return Math.max(start, Math.min(cursor, end - 1));
}

const isWs = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch);

/** vi `w` — start of the NEXT word: skip the current word, then leading space. */
function nextWordStart(value: string, cursor: number): number {
  let j = Math.max(0, Math.min(cursor, value.length));
  while (j < value.length && !isWs(value[j])) j++; // off the current word
  while (j < value.length && isWs(value[j])) j++; // onto the next word's first char
  return j;
}

const done = (value: string, cursor: number, st: VimState, handled = true): VimResult =>
  ({ value, cursor: clampNormal(value, cursor), state: { ...st, pending: "" }, handled });

type Op = (value: string, cursor: number, st: VimState) => VimResult;

const enterInsert = (value: string, cursor: number, st: VimState): VimResult =>
  ({ value, cursor: Math.max(0, Math.min(cursor, value.length)), state: { ...st, mode: "insert", pending: "" }, handled: true });

/** i/a/A/I/o/O — enter insert mode at the right spot. */
const INSERT_OPS: Record<string, Op> = {
  i: (v, c, st) => enterInsert(v, c, st),
  a: (v, c, st) => enterInsert(v, Math.min(v.length, c + (lineBounds(v, c).end > lineBounds(v, c).start ? 1 : 0)), st),
  A: (v, c, st) => enterInsert(v, lineBounds(v, c).end, st),
  I: (v, c, st) => enterInsert(v, lineBounds(v, c).start, st),
  o: (v, c, st) => { const { end } = lineBounds(v, c); return enterInsert(v.slice(0, end) + "\n" + v.slice(end), end + 1, st); },
  O: (v, c, st) => { const { start } = lineBounds(v, c); return enterInsert(v.slice(0, start) + "\n" + v.slice(start), start, st); },
};

/** hjkl, w, b — return a new cursor on the same value. */
const MOTIONS: Record<string, (v: string, c: number) => number> = {
  h: (v, c) => { const { start } = lineBounds(v, c); return Math.max(start, c - 1); },
  l: (v, c) => clampNormal(v, c + 1),
  j: (v, c) => moveVertical(v, c, 1),
  k: (v, c) => moveVertical(v, c, -1),
  w: (v, c) => clampNormal(v, nextWordStart(v, c)),
  b: (v, c) => clampNormal(v, wordLeft(v, c)),
};

/** Move down/up one line, keeping the column where the target line allows. */
function moveVertical(value: string, cursor: number, dir: 1 | -1): number {
  const { start, end } = lineBounds(value, cursor);
  const col = cursor - start;
  if (dir === 1) {
    if (end >= value.length) return clampNormal(value, cursor); // no line below
    const next = lineBounds(value, end + 1);
    return clampNormal(value, next.start + Math.min(col, next.end - next.start));
  }
  if (start === 0) return clampNormal(value, cursor); // no line above
  const prev = lineBounds(value, start - 1);
  return clampNormal(value, prev.start + Math.min(col, prev.end - prev.start));
}

/** dd — delete the current line into the register (linewise). */
function deleteLine(value: string, cursor: number, st: VimState): VimResult {
  const { start, end } = lineBounds(value, cursor);
  const hasNl = end < value.length;
  const next = value.slice(0, start) + value.slice(hasNl ? end + 1 : end);
  const register = value.slice(start, end) + "\n";
  return { value: next, cursor: clampNormal(next, start), state: { ...st, register, pending: "" }, handled: true };
}

/** yy — yank the current line into the register (buffer unchanged). */
function yankLine(value: string, cursor: number, st: VimState): VimResult {
  const { start, end } = lineBounds(value, cursor);
  return done(value, cursor, { ...st, register: value.slice(start, end) + "\n" });
}

/** p — paste the register's line below the current line (linewise). */
function paste(value: string, cursor: number, st: VimState): VimResult {
  if (!st.register) return done(value, cursor, st);
  const body = st.register.endsWith("\n") ? st.register.slice(0, -1) : st.register;
  const { end } = lineBounds(value, cursor);
  return { value: value.slice(0, end) + "\n" + body + value.slice(end), cursor: end + 1, state: { ...st, pending: "" }, handled: true };
}

/** A normal-mode keypress: the carried state plus the buffer it acts on. */
export type VimKey = { st: VimState; value: string; cursor: number; input: string; key: Key };

/** Resolve a pending operator (d→dd, y→yy). Any other key cancels it. */
function pendingStep(k: VimKey): VimResult {
  const { st, value, cursor, input } = k;
  if (st.pending === "d") return input === "d" ? deleteLine(value, cursor, st) : done(value, cursor, st);
  return input === "y" ? yankLine(value, cursor, st) : done(value, cursor, st);
}

/** Resolve a fresh keypress (no pending operator). */
function freshStep(k: VimKey): VimResult {
  const { st, value, cursor, input, key } = k;
  if (key.ctrl || key.meta) return done(value, cursor, st, false);
  if (input === "d" || input === "y") return { value, cursor: clampNormal(value, cursor), state: { ...st, pending: input }, handled: true };
  const insertOp = INSERT_OPS[input];
  if (insertOp) return insertOp(value, clampNormal(value, cursor), st);
  const motion = MOTIONS[input];
  if (motion) return done(value, motion(value, clampNormal(value, cursor)), st);
  if (input === "p") return paste(value, cursor, st);
  return done(value, cursor, st, false);
}

/** Apply one normal-mode keypress to (value, cursor). Threads d/y operator state
 * through `st.pending`. Insert mode is handled by the composer, not here. */
export function vimNormalKey(k: VimKey): VimResult {
  if (k.key.escape) return done(k.value, k.cursor, k.st);
  if (k.st.pending) return pendingStep(k);
  return freshStep(k);
}
