import { describe, it, expect } from "vitest";
import { vimNormalKey as vimNormalKeyObj, INITIAL_VIM, type VimState, type VimResult } from "./vim-mode.js";
import type { Key } from "./composer-keys.js";

const k = (over: Partial<Key> = {}): Key => ({ ...over });
const st = (over: Partial<VimState> = {}): VimState => ({ ...INITIAL_VIM, ...over });
/** Positional wrapper so the existing call sites stay readable. */
const vimNormalKey = (state: VimState, value: string, cursor: number, input: string, key: Key): VimResult =>
  vimNormalKeyObj({ st: state, value, cursor, input, key });

// `vimNormalKey` is pure: (state, value, cursor, input, key) → new state/value/cursor.
// Every motion/operator is covered here without rendering — the card's real coverage.

describe("vim motions — hjkl", () => {
  it("h moves left, clamped at line start", () => {
    expect(vimNormalKey(st(), "hello", 3, "h", k()).cursor).toBe(2);
    expect(vimNormalKey(st(), "hello", 0, "h", k()).cursor).toBe(0);
  });
  it("l moves right, resting on the last char (vi clamp)", () => {
    expect(vimNormalKey(st(), "hello", 1, "l", k()).cursor).toBe(2);
    expect(vimNormalKey(st(), "hello", 4, "l", k()).cursor).toBe(4); // last char, not past end
  });
  it("j moves down a line keeping the column", () => {
    const r = vimNormalKey(st(), "abc\ndefg", 1, "j", k());
    expect(r.cursor).toBe(5); // 'e' on line 2 (start 4 + col 1)
  });
  it("j on the last line is a no-op (clamped)", () => {
    expect(vimNormalKey(st(), "abc\ndef", 5, "j", k()).cursor).toBe(5);
  });
  it("k moves up a line keeping the column", () => {
    const r = vimNormalKey(st(), "abcd\nefgh", 7, "k", k()); // 'g' on line 2 (start 5), col 2
    expect(r.cursor).toBe(2); // col 2 on line 1 ('c')
  });
  it("k clamps the column when the line above is shorter", () => {
    const r = vimNormalKey(st(), "ab\nefgh", 6, "k", k()); // col 2 → line above len 2 → last char idx 1
    expect(r.cursor).toBe(1);
  });
});

describe("vim motions — w/b word", () => {
  it("w jumps to the next word start", () => {
    expect(vimNormalKey(st(), "foo bar baz", 0, "w", k()).cursor).toBe(4);
  });
  it("b jumps to the previous word start", () => {
    expect(vimNormalKey(st(), "foo bar baz", 8, "b", k()).cursor).toBe(4);
  });
});

describe("vim insert-entry operators", () => {
  it("i enters insert at the cursor", () => {
    const r = vimNormalKey(st(), "hello", 2, "i", k());
    expect(r.state.mode).toBe("insert");
    expect(r.cursor).toBe(2);
  });
  it("a enters insert one past the cursor", () => {
    const r = vimNormalKey(st(), "hello", 2, "a", k());
    expect(r.state.mode).toBe("insert");
    expect(r.cursor).toBe(3);
  });
  it("a on an empty line stays at column 0", () => {
    const r = vimNormalKey(st(), "", 0, "a", k());
    expect(r.cursor).toBe(0);
  });
  it("A enters insert at end of line", () => {
    const r = vimNormalKey(st(), "ab\ncd", 0, "A", k());
    expect(r.cursor).toBe(2);
    expect(r.state.mode).toBe("insert");
  });
  it("I enters insert at start of line", () => {
    const r = vimNormalKey(st(), "ab\ncd", 4, "I", k());
    expect(r.cursor).toBe(3);
  });
  it("o opens a line below and enters insert", () => {
    const r = vimNormalKey(st(), "ab\ncd", 1, "o", k());
    expect(r.value).toBe("ab\n\ncd");
    expect(r.cursor).toBe(3);
    expect(r.state.mode).toBe("insert");
  });
  it("O opens a line above and enters insert", () => {
    const r = vimNormalKey(st(), "ab\ncd", 4, "O", k());
    expect(r.value).toBe("ab\n\ncd");
    expect(r.cursor).toBe(3);
    expect(r.state.mode).toBe("insert");
  });
});

describe("vim dd — delete line", () => {
  it("requires two d presses; first sets pending", () => {
    const first = vimNormalKey(st(), "a\nb\nc", 2, "d", k());
    expect(first.state.pending).toBe("d");
    expect(first.value).toBe("a\nb\nc");
    const second = vimNormalKey(first.state, "a\nb\nc", 2, "d", k());
    expect(second.value).toBe("a\nc");
    expect(second.state.register).toBe("b\n");
    expect(second.state.pending).toBe("");
  });
  it("deletes the only line to empty", () => {
    const after = vimNormalKey(st({ pending: "d" }), "solo", 1, "d", k());
    expect(after.value).toBe("");
    expect(after.state.register).toBe("solo\n");
  });
  it("a non-d after d cancels the pending operator", () => {
    const r = vimNormalKey(st({ pending: "d" }), "abc", 0, "l", k());
    expect(r.value).toBe("abc");
    expect(r.state.pending).toBe("");
  });
});

describe("vim yy + p — yank and paste line", () => {
  it("yy yanks the current line without changing the buffer", () => {
    const first = vimNormalKey(st(), "x\ny\nz", 2, "y", k());
    expect(first.state.pending).toBe("y");
    const r = vimNormalKey(first.state, "x\ny\nz", 2, "y", k());
    expect(r.value).toBe("x\ny\nz");
    expect(r.state.register).toBe("y\n");
  });
  it("p pastes the register's line below the current line", () => {
    const r = vimNormalKey(st({ register: "dup\n" }), "a\nb", 0, "p", k());
    expect(r.value).toBe("a\ndup\nb");
    expect(r.cursor).toBe(2); // start of pasted line
  });
  it("p with an empty register is a no-op", () => {
    const r = vimNormalKey(st(), "a\nb", 0, "p", k());
    expect(r.value).toBe("a\nb");
  });
  it("yy then p duplicates the line", () => {
    const y = vimNormalKey(st({ pending: "y" }), "line", 0, "y", k());
    const p = vimNormalKey(y.state, "line", 0, "p", k());
    expect(p.value).toBe("line\nline");
  });
});

describe("vim normal-mode key handling", () => {
  it("drops an unmapped printable (handled:false, no insert)", () => {
    const r = vimNormalKey(st(), "hello", 0, "z", k());
    expect(r.handled).toBe(false);
    expect(r.value).toBe("hello");
    expect(r.state.mode).toBe("normal");
  });
  it("Escape clears pending and stays in normal mode", () => {
    const r = vimNormalKey(st({ pending: "d" }), "hello", 2, "", k({ escape: true }));
    expect(r.state.pending).toBe("");
    expect(r.state.mode).toBe("normal");
    expect(r.handled).toBe(true);
  });
  it("ctrl/meta chords are not treated as motions", () => {
    const r = vimNormalKey(st(), "hello", 0, "l", k({ ctrl: true }));
    expect(r.handled).toBe(false);
  });
});
