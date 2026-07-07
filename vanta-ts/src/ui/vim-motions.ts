import { wordLeft } from "../term/composer-edits.js";

// VANTA-VIM-OPERATORS — pure motion + text-object resolution for vi normal mode.
// Everything here maps (value, cursor[, arg]) → an index or a [start,end) range,
// with no state and no React. vim-mode.ts composes these with operators + counts.

const isWs = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch);

/** Bounds of the line containing `cursor`: [start, end) excluding the newline. */
export function lineBounds(value: string, cursor: number): { start: number; end: number } {
  const c = Math.max(0, Math.min(cursor, value.length));
  const start = value.lastIndexOf("\n", c - 1) + 1;
  const nl = value.indexOf("\n", c);
  return { start, end: nl === -1 ? value.length : nl };
}

/** Start of the NEXT word (vi `w`): off the current word, then leading space. */
export function nextWordStart(value: string, cursor: number): number {
  let j = Math.max(0, Math.min(cursor, value.length));
  while (j < value.length && !isWs(value[j])) j++;
  while (j < value.length && isWs(value[j])) j++;
  return j;
}

/** End of the current/next word (vi `e`) — the last non-space char index. */
export function wordEnd(value: string, cursor: number): number {
  let j = Math.max(0, Math.min(cursor, value.length)) + 1;
  while (j < value.length && isWs(value[j])) j++; // to the next word
  while (j + 1 < value.length && !isWs(value[j + 1])) j++; // to its last char
  return Math.min(j, value.length - 1);
}

function firstNonBlank(value: string, cursor: number): number {
  const { start, end } = lineBounds(value, cursor);
  let j = start;
  while (j < end && isWs(value[j])) j++;
  return j;
}

/** Move down/up `n` lines keeping the column where the target line allows. */
export function moveVertical(value: string, cursor: number, dir: 1 | -1, n: number): number {
  let c = cursor;
  for (let i = 0; i < Math.max(1, n); i++) {
    const { start, end } = lineBounds(value, c);
    const col = c - start;
    if (dir === 1) {
      if (end >= value.length) break; // no line below
      const next = lineBounds(value, end + 1);
      c = next.start + Math.min(col, Math.max(0, next.end - next.start));
    } else {
      if (start === 0) break; // no line above
      const prev = lineBounds(value, start - 1);
      c = prev.start + Math.min(col, Math.max(0, prev.end - prev.start));
    }
  }
  return c;
}

/** Apply a count-repeatable simple motion `n` times. */
function repeat(fn: (v: string, c: number) => number, value: string, cursor: number, n: number): number {
  let c = cursor;
  for (let i = 0; i < Math.max(1, n); i++) c = fn(value, c);
  return c;
}

/** A charwise find: f/t forward, F/T backward, to `arg` on the current line.
 * Returns the target index or null when `arg` isn't found. `till` stops one short. */
export function findChar(value: string, cursor: number, o: { forward: boolean; till: boolean; arg: string }): number | null {
  const { start, end } = lineBounds(value, cursor);
  if (o.forward) {
    const at = value.indexOf(o.arg, cursor + 1);
    if (at === -1 || at >= end) return null;
    return o.till ? at - 1 : at;
  }
  const at = value.lastIndexOf(o.arg, cursor - 1);
  if (at === -1 || at < start) return null;
  return o.till ? at + 1 : at;
}

const isFindMotion = (m: string): boolean => m === "f" || m === "F" || m === "t" || m === "T";

// Count-aware cursor motions keyed by their vi letter. Each returns a target
// index on `value`. Find motions (f/F/t/T) are handled separately (need `arg`).
const TARGETS: Record<string, (v: string, c: number, n: number, b: { start: number; end: number }) => number> = {
  h: (_v, c, n, b) => Math.max(b.start, c - n),
  l: (_v, c, n, b) => Math.min(b.end, c + n),
  w: (v, c, n) => repeat(nextWordStart, v, c, n),
  b: (v, c, n) => repeat(wordLeft, v, c, n),
  e: (v, c, n) => repeat(wordEnd, v, c, n),
  j: (v, c, n) => moveVertical(v, c, 1, n),
  k: (v, c, n) => moveVertical(v, c, -1, n),
  0: (_v, _c, _n, b) => b.start,
  "^": (v, c) => firstNonBlank(v, c),
  $: (_v, _c, _n, b) => b.end,
};

/** Resolve a cursor motion to a target index, or null if unknown/blocked.
 * `arg` is the target char for find motions (f/F/t/T). Count-aware. */
export function motionTarget(value: string, cursor: number, motion: string, o: { count: number; arg?: string }): number | null {
  const c = Math.max(0, Math.min(cursor, value.length));
  if (isFindMotion(motion)) {
    return o.arg ? findChar(value, c, { forward: motion === "f" || motion === "t", till: motion === "t" || motion === "T", arg: o.arg }) : null;
  }
  const fn = TARGETS[motion];
  return fn ? fn(value, c, Math.max(1, o.count), lineBounds(value, c)) : null;
}

/** True when a motion is INCLUSIVE (covers the target char) for operators: e, f, t. */
export function isInclusiveMotion(motion: string): boolean {
  return motion === "e" || motion === "f" || motion === "t";
}

const PAIRS: Record<string, [string, string]> = {
  "(": ["(", ")"], ")": ["(", ")"], b: ["(", ")"],
  "[": ["[", "]"], "]": ["[", "]"],
  "{": ["{", "}"], "}": ["{", "}"], B: ["{", "}"],
  "<": ["<", ">"], ">": ["<", ">"],
};
const QUOTES = new Set(["'", '"', "`"]);

/** Range of a quote text object on the current line: inside (`i`) or around (`a`). */
function quoteRange(value: string, cursor: number, inclusive: boolean, q: string): { start: number; end: number } | null {
  const { start, end } = lineBounds(value, cursor);
  const opens: number[] = [];
  for (let i = start; i < end; i++) if (value[i] === q) opens.push(i);
  for (let p = 0; p + 1 < opens.length; p += 2) {
    const a = opens[p]!, b = opens[p + 1]!;
    if (cursor >= a && cursor <= b) return inclusive ? { start: a, end: b + 1 } : { start: a + 1, end: b };
  }
  return null;
}

/** Index of the enclosing OPEN bracket at/before `cursor`, or -1. */
function enclosingOpen(value: string, cursor: number, open: string, close: string): number {
  let depth = 0;
  for (let i = cursor; i >= 0; i--) {
    if (value[i] === close && i !== cursor) depth++;
    else if (value[i] === open) { if (depth === 0) return i; depth--; }
  }
  return -1;
}

/** Index of the matching CLOSE bracket after `openAt`, or -1. */
function matchingClose(value: string, openAt: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openAt + 1; i < value.length; i++) {
    if (value[i] === open) depth++;
    else if (value[i] === close) { if (depth === 0) return i; depth--; }
  }
  return -1;
}

/** Range of a bracket text object, scanning outward for the enclosing pair. */
function bracketRange(value: string, cursor: number, inclusive: boolean, pair: [string, string]): { start: number; end: number } | null {
  const openAt = enclosingOpen(value, cursor, pair[0], pair[1]);
  if (openAt === -1) return null;
  const closeAt = matchingClose(value, openAt, pair[0], pair[1]);
  if (closeAt === -1) return null;
  return inclusive ? { start: openAt, end: closeAt + 1 } : { start: openAt + 1, end: closeAt };
}

/** Inner/around word range (iw/aw): the word under the cursor, `around` adds trailing space. */
function wordRange(value: string, cursor: number, around: boolean): { start: number; end: number } {
  let s = cursor, e = cursor;
  while (s > 0 && !isWs(value[s - 1])) s--;
  while (e < value.length && !isWs(value[e])) e++;
  if (around) while (e < value.length && isWs(value[e])) e++;
  return { start: s, end: e };
}

/**
 * Resolve a text object `<i|a><obj>` (e.g. ci' → inclusive=false obj="'") to a
 * [start,end) range on the buffer, or null when there's no enclosing object.
 */
export function textObjectRange(value: string, cursor: number, inclusive: boolean, obj: string): { start: number; end: number } | null {
  if (QUOTES.has(obj)) return quoteRange(value, cursor, inclusive, obj);
  const pair = PAIRS[obj];
  if (pair) return bracketRange(value, cursor, inclusive, pair);
  if (obj === "w") return wordRange(value, cursor, inclusive);
  return null;
}
