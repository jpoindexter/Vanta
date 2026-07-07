import type { Key } from "./composer-keys.js";
import {
  lineBounds, motionTarget, isInclusiveMotion, textObjectRange,
} from "./vim-motions.js";

// Pure vi-mode state machine for the composer. A normal-mode keypress maps
// (state, value, cursor) → new (state, value, cursor). Insert mode is the
// composer's normal readline path. VANTA-VIM-OPERATORS: `pending` accumulates a
// half-typed command so counts (3w), operator+motion (dw/d$/3dw), text objects
// (ci'/di(), and find motions (f(/dt,) all compose. vim-motions.ts is the pure
// geometry; this module is the parser + operator application.

export type VimMode = "normal" | "insert";
/** Vim state carried across keypresses. `pending` = the accumulated command buffer. */
export type VimState = { mode: VimMode; register: string; pending: string };
export const INITIAL_VIM: VimState = { mode: "normal", register: "", pending: "" };

export type VimResult = { value: string; cursor: number; state: VimState; handled: boolean };

/** Clamp to a valid normal-mode column (rest on the last char like vi). */
function clampNormal(value: string, cursor: number): number {
  const { start, end } = lineBounds(value, cursor);
  if (end === start) return start;
  return Math.max(start, Math.min(cursor, end - 1));
}

const done = (value: string, cursor: number, st: VimState, handled = true): VimResult =>
  ({ value, cursor: clampNormal(value, cursor), state: { ...st, pending: "" }, handled });

/** Keep the half-typed command; the composer waits for the next key. */
const waiting = (value: string, cursor: number, st: VimState, buffer: string): VimResult =>
  ({ value, cursor: clampNormal(value, cursor), state: { ...st, pending: buffer }, handled: true });

const enterInsert = (value: string, cursor: number, st: VimState): VimResult =>
  ({ value, cursor: Math.max(0, Math.min(cursor, value.length)), state: { ...st, mode: "insert", pending: "" }, handled: true });

type Op = (value: string, cursor: number, st: VimState) => VimResult;
const INSERT_OPS: Record<string, Op> = {
  i: (v, c, st) => enterInsert(v, c, st),
  a: (v, c, st) => enterInsert(v, Math.min(v.length, c + (lineBounds(v, c).end > lineBounds(v, c).start ? 1 : 0)), st),
  A: (v, c, st) => enterInsert(v, lineBounds(v, c).end, st),
  I: (v, c, st) => enterInsert(v, lineBounds(v, c).start, st),
  o: (v, c, st) => { const { end } = lineBounds(v, c); return enterInsert(v.slice(0, end) + "\n" + v.slice(end), end + 1, st); },
  O: (v, c, st) => { const { start } = lineBounds(v, c); return enterInsert(v.slice(0, start) + "\n" + v.slice(start), start, st); },
};

/** dd/cc/yy over `count` lines (linewise). `op` decides delete/change/yank. */
function linewiseOp(value: string, cursor: number, st: VimState, o: { op: string; count: number }): VimResult {
  const { op, count } = o;
  const first = lineBounds(value, cursor);
  let end = first.end;
  for (let i = 1; i < count; i++) { if (end >= value.length) break; end = lineBounds(value, end + 1).end; }
  const register = value.slice(first.start, end) + "\n";
  if (op === "y") return done(value, cursor, { ...st, register });
  if (op === "c") { // clear the line(s), enter insert at the start
    const next = value.slice(0, first.start) + value.slice(end);
    return { value: next, cursor: first.start, state: { ...st, register, mode: "insert", pending: "" }, handled: true };
  }
  const hasNl = end < value.length; // dd removes the trailing newline too
  const next = value.slice(0, first.start) + value.slice(hasNl ? end + 1 : end);
  return { value: next, cursor: clampNormal(next, first.start), state: { ...st, register, pending: "" }, handled: true };
}

/** Apply delete/change/yank over a [start,end) range. */
function applyOpRange(op: string, value: string, range: { start: number; end: number }, st: VimState): VimResult {
  const { start, end } = range;
  const register = value.slice(start, end);
  if (op === "y") return done(value, start, { ...st, register });
  const next = value.slice(0, start) + value.slice(end);
  if (op === "c") return { value: next, cursor: start, state: { ...st, register, mode: "insert", pending: "" }, handled: true };
  return { value: next, cursor: clampNormal(next, start), state: { ...st, register, pending: "" }, handled: true };
}

/** The [start,end) span an operator+motion covers, honoring inclusive motions. */
function motionRange(value: string, cursor: number, motion: string, o: { count: number; arg?: string }): { start: number; end: number } | null {
  const target = motionTarget(value, cursor, motion, o);
  if (target === null) return null;
  if (target >= cursor) return { start: cursor, end: target + (isInclusiveMotion(motion) ? 1 : 0) };
  return { start: target, end: cursor };
}

const isOperator = (ch: string): boolean => ch === "d" || ch === "y" || ch === "c";
const isFind = (ch: string): boolean => ch === "f" || ch === "F" || ch === "t" || ch === "T";
/** Split a leading count off a command fragment (1 when absent). */
function splitCount(s: string): { count: number; rest: string } {
  const m = s.match(/^([1-9][0-9]*)([\s\S]*)$/);
  return m ? { count: parseInt(m[1] ?? "1", 10), rest: m[2] ?? "" } : { count: 1, rest: s };
}

type Span = { start: number; end: number };
// The range an operator's TARGET (text object / find / motion) covers:
// a Span, "wait" (needs more keys), or null (invalid → cancel).
function operatorTargetRange(value: string, cursor: number, a: string, n: number): Span | "wait" | null {
  const a0 = a.charAt(0), a1 = a.charAt(1);
  if (a0 === "i" || a0 === "a") return a.length < 2 ? "wait" : textObjectRange(value, cursor, a0 === "a", a1);
  if (isFind(a0)) return a.length < 2 ? "wait" : motionRange(value, cursor, a0, { count: n, arg: a1 });
  return motionRange(value, cursor, a0, { count: n }); // dw d$ d0 db de dh dl
}

/** Resolve an operator command from `value/cursor/st` + {op, count, arg, buffer}. */
function resolveOperator(value: string, cursor: number, st: VimState, o: { op: string; count: number; arg: string; buffer: string }): VimResult {
  const inner = splitCount(o.arg); // d3w → count*3
  const n = o.count * inner.count;
  const a = inner.rest;
  if (a === "") return waiting(value, cursor, st, o.buffer);
  if (a === o.op) return linewiseOp(value, cursor, st, { op: o.op, count: n }); // dd/cc/yy
  const r = operatorTargetRange(value, cursor, a, n);
  if (r === "wait") return waiting(value, cursor, st, o.buffer);
  return r ? applyOpRange(o.op, value, r, st) : done(value, cursor, st);
}

/** Resolve a non-operator command (motion / insert entry / x / p). */
function resolveSimple(value: string, cursor: number, st: VimState, o: { count: number; rest: string; buffer: string }): VimResult {
  const { count, rest, buffer } = o;
  const ch = rest.charAt(0);
  const insertOp = INSERT_OPS[ch];
  if (insertOp) return insertOp(value, clampNormal(value, cursor), st);
  if (isFind(ch)) { // f( t) F" T,
    if (rest.length < 2) return waiting(value, cursor, st, buffer);
    const target = motionTarget(value, cursor, ch, { count, arg: rest.charAt(1) });
    return target === null ? done(value, cursor, st) : done(value, target, st);
  }
  if (ch === "x") { const { end } = lineBounds(value, cursor); const to = Math.min(end, cursor + Math.max(1, count)); return applyOpRange("d", value, { start: cursor, end: to }, st); }
  if (ch === "p") return paste(value, cursor, st);
  const target = motionTarget(value, cursor, ch, { count }); // h l w b e 0 ^ $
  return target === null ? done(value, cursor, st, false) : done(value, target, st);
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

/**
 * Apply one normal-mode keypress. Accumulates into `pending` until a full
 * command (count? operator? motion|textobject|find) is typed, then executes.
 */
export function vimNormalKey(k: VimKey): VimResult {
  const { st, value, cursor, input, key } = k;
  if (key.escape) return done(value, cursor, { ...st, pending: "" });
  if (key.ctrl || key.meta || input === "") return done(value, cursor, st, false);
  const buffer = st.pending + input;
  const { count, rest } = splitCount(buffer);
  if (rest === "") return waiting(value, cursor, st, buffer); // building a count
  const head = rest.charAt(0);
  if (isOperator(head)) return resolveOperator(value, cursor, st, { op: head, count, arg: rest.slice(1), buffer });
  return resolveSimple(value, cursor, st, { count, rest, buffer });
}
