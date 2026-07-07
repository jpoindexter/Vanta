import { describe, it, expect } from "vitest";
import { vimNormalKey, INITIAL_VIM, type VimState, type VimKey } from "./vim-mode.js";
import type { Key } from "./composer-keys.js";

// VANTA-VIM-OPERATORS — operators+motions+counts, text objects, find motions.

const st = (o: Partial<VimState> = {}): VimState => ({ ...INITIAL_VIM, mode: "normal", ...o });
const K = (o: Partial<Key> = {}): Key => ({ ...o } as Key);

/** Type a sequence of normal-mode keys from a fresh state; return the final result. */
function run(value: string, cursor: number, keys: string): { value: string; cursor: number; state: VimState } {
  let state = st();
  let r = { value, cursor, state } as { value: string; cursor: number; state: VimState };
  for (const ch of keys) {
    const k: VimKey = { st: r.state, value: r.value, cursor: r.cursor, input: ch, key: K() };
    const out = vimNormalKey(k);
    r = { value: out.value, cursor: out.cursor, state: out.state };
  }
  return r;
}

describe("operator + motion", () => {
  it("dw deletes to the start of the next word", () => {
    expect(run("hello world", 0, "dw").value).toBe("world");
  });
  it("d$ deletes to end of line", () => {
    expect(run("hello world", 6, "d$").value).toBe("hello ");
  });
  it("db deletes back to the previous word", () => {
    expect(run("hello world", 6, "db").value).toBe("world");
  });
  it("de deletes to end of the current word (inclusive)", () => {
    expect(run("hello world", 0, "de").value).toBe(" world");
  });
});

describe("counts", () => {
  it("3dw deletes three words (the card's example)", () => {
    expect(run("one two three four", 0, "3dw").value).toBe("four");
  });
  it("2w moves forward two words", () => {
    expect(run("one two three", 0, "2w").cursor).toBe(8); // start of 'three'
  });
  it("d2w equals 2dw", () => {
    expect(run("a b c d", 0, "d2w").value).toBe(run("a b c d", 0, "2dw").value);
  });
  it("3x deletes three characters", () => {
    expect(run("abcdef", 0, "3x").value).toBe("def");
  });
});

describe("text objects", () => {
  it("ci' changes inside single quotes (the card's example)", () => {
    const r = run("say 'hello' now", 6, "ci'");
    expect(r.value).toBe("say '' now");
    expect(r.state.mode).toBe("insert");
  });
  it('di" deletes inside double quotes', () => {
    expect(run('a "bcd" e', 3, 'di"').value).toBe('a "" e');
  });
  it("ci( changes inside parentheses", () => {
    expect(run("f(x + y)", 4, "ci(").value).toBe("f()");
  });
  it("da( deletes around parentheses (inclusive)", () => {
    expect(run("f(x)g", 2, "da(").value).toBe("fg");
  });
  it("diw deletes the inner word", () => {
    expect(run("foo bar baz", 4, "diw").value).toBe("foo  baz");
  });
});

describe("find motions", () => {
  it("f( moves to the next '(' (the card's example)", () => {
    expect(run("ab(cd)", 0, "f(").cursor).toBe(2);
  });
  it("t) moves till just before ')'", () => {
    expect(run("(abc)", 0, "t)").cursor).toBe(3);
  });
  it("df) deletes through the next ')' (inclusive find)", () => {
    expect(run("a(bc)d", 1, "df)").value).toBe("ad");
  });
  it("dt, deletes up to (not including) the comma", () => {
    expect(run("abc,def", 0, "dt,").value).toBe(",def");
  });
  it("F finds backward", () => {
    expect(run("a.b.c", 4, "F.").cursor).toBe(3);
  });
  it("f with a missing target is a no-op", () => {
    expect(run("abc", 0, "fz").cursor).toBe(0);
  });
});

describe("intermediate state", () => {
  it("a partial count keeps the buffer pending", () => {
    const r = run("hello", 0, "2");
    expect(r.state.pending).toBe("2");
    expect(r.value).toBe("hello");
  });
  it("an operator awaiting a motion keeps pending", () => {
    expect(run("hello", 0, "d").state.pending).toBe("d");
  });
});
