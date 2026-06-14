import { describe, it, expect } from "vitest";
import {
  wordLeft,
  wordRight,
  killToStart,
  killToEnd,
  killWordBack,
  deleteForward,
  yank,
} from "./composer-edits.js";

describe("wordLeft", () => {
  it("stays at 0 when already at start", () => {
    expect(wordLeft("hello world", 0)).toBe(0);
  });
  it("jumps to the start of the word the cursor is in", () => {
    expect(wordLeft("hello world", 11)).toBe(6); // end of "world" → before "world"
  });
  it("skips trailing whitespace then the word", () => {
    expect(wordLeft("foo bar ", 8)).toBe(4); // trailing space + "bar"
  });
  it("collapses a run of spaces to the prior word start", () => {
    expect(wordLeft("a   b", 5)).toBe(4); // cursor after "b" → start of "b"
    expect(wordLeft("a   b", 4)).toBe(0); // cursor before "b" → across spaces to "a"
  });
  it("stops at a newline (newline is whitespace)", () => {
    expect(wordLeft("ab\ncd", 5)).toBe(3); // start of "cd", not across the \n
  });
  it("clamps an out-of-range index", () => {
    expect(wordLeft("hi", 99)).toBe(0);
  });
});

describe("wordRight", () => {
  it("stays at end when already at end", () => {
    expect(wordRight("hello", 5)).toBe(5);
  });
  it("jumps to the end of the current word", () => {
    expect(wordRight("hello world", 0)).toBe(5);
  });
  it("skips leading whitespace then the word", () => {
    expect(wordRight("  hi", 0)).toBe(4);
  });
  it("collapses a run of spaces to the next word end", () => {
    expect(wordRight("a   b", 1)).toBe(5); // across spaces, end of "b"
  });
  it("stops at a newline", () => {
    expect(wordRight("ab\ncd", 0)).toBe(2); // end of "ab", before the \n
  });
});

describe("killToStart (Ctrl+U)", () => {
  it("kills everything before the cursor and zeroes the cursor", () => {
    expect(killToStart("foo bar", 4)).toEqual({ value: "bar", cursor: 0, killed: "foo " });
  });
  it("kills the whole line at end", () => {
    expect(killToStart("line", 4)).toEqual({ value: "", cursor: 0, killed: "line" });
  });
  it("is a no-op at the start", () => {
    expect(killToStart("line", 0)).toEqual({ value: "line", cursor: 0, killed: "" });
  });
});

describe("killToEnd (Ctrl+K)", () => {
  it("kills from the cursor to the end, cursor unchanged", () => {
    expect(killToEnd("foo bar", 3)).toEqual({ value: "foo", killed: " bar" });
  });
  it("is a no-op at the end", () => {
    expect(killToEnd("foo", 3)).toEqual({ value: "foo", killed: "" });
  });
});

describe("killWordBack (Ctrl+W)", () => {
  it("kills the word and trailing space before the cursor", () => {
    expect(killWordBack("foo bar", 7)).toEqual({ value: "foo ", cursor: 4, killed: "bar" });
  });
  it("kills 'foo ' from 'foo ' (word + its trailing space)", () => {
    expect(killWordBack("foo ", 4)).toEqual({ value: "", cursor: 0, killed: "foo " });
  });
  it("is a no-op at the start", () => {
    expect(killWordBack("foo", 0)).toEqual({ value: "foo", cursor: 0, killed: "" });
  });
  it("preserves text after the cursor", () => {
    expect(killWordBack("foo bar baz", 7)).toEqual({ value: "foo  baz", cursor: 4, killed: "bar" });
  });
});

describe("deleteForward (Ctrl+D)", () => {
  it("deletes the char under the cursor", () => {
    expect(deleteForward("abc", 1)).toBe("ac");
  });
  it("deletes the first char at position 0", () => {
    expect(deleteForward("abc", 0)).toBe("bc");
  });
  it("is a no-op at the end of the line", () => {
    expect(deleteForward("abc", 3)).toBe("abc");
  });
  it("is a no-op on empty input (Ctrl+D must not exit)", () => {
    expect(deleteForward("", 0)).toBe("");
  });
});

describe("yank (Ctrl+Y)", () => {
  it("inserts killed text at the cursor and advances past it", () => {
    // cursor 4 is just before "bar" → "foo " + "XY" + "bar"
    expect(yank("foo bar", 4, "XY")).toEqual({ value: "foo XYbar", cursor: 6 });
  });
  it("appends at the end", () => {
    expect(yank("foo", 3, "bar")).toEqual({ value: "foobar", cursor: 6 });
  });
  it("is a no-op when the kill ring is empty", () => {
    expect(yank("foo", 1, "")).toEqual({ value: "foo", cursor: 1 });
  });
});

describe("kill → yank round-trip", () => {
  it("Ctrl+K then Ctrl+Y restores the original text", () => {
    const k = killToEnd("hello world", 5); // value "hello", killed " world"
    const y = yank(k.value, k.value.length, k.killed);
    expect(y.value).toBe("hello world");
    expect(y.cursor).toBe(11);
  });
  it("Ctrl+U then Ctrl+Y at the new cursor restores the original text", () => {
    const k = killToStart("foo bar", 4); // value "bar", killed "foo ", cursor 0
    const y = yank(k.value, k.cursor, k.killed);
    expect(y.value).toBe("foo bar");
    expect(y.cursor).toBe(4);
  });
});
