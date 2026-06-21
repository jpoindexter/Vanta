import { describe, it, expect } from "vitest";
import { killWholeLine, yank, EMPTY_KILL, type KillYankState } from "./kill-yank.js";

describe("killWholeLine (Ctrl+U — clear all)", () => {
  it("clears the whole buffer and saves it to the kill-buffer, cursor → 0", () => {
    expect(killWholeLine("foo bar", 4, EMPTY_KILL)).toEqual({
      buffer: "",
      cursor: 0,
      state: { killBuffer: "foo bar" },
    });
  });
  it("clears regardless of cursor position (mid-line cursor still clears ALL)", () => {
    expect(killWholeLine("hello world", 0, EMPTY_KILL)).toEqual({
      buffer: "",
      cursor: 0,
      state: { killBuffer: "hello world" },
    });
  });
  it("on an already-empty buffer yields an empty kill-buffer (nothing to yank)", () => {
    expect(killWholeLine("", 0, EMPTY_KILL)).toEqual({ buffer: "", cursor: 0, state: { killBuffer: "" } });
  });
  it("kill twice replaces the kill-buffer with the latest killed text", () => {
    const first = killWholeLine("first", 5, EMPTY_KILL);
    const second = killWholeLine("second", 6, first.state);
    expect(second.state.killBuffer).toBe("second");
  });
  it("never mutates the input state", () => {
    const state: KillYankState = { killBuffer: "old" };
    const result = killWholeLine("text", 4, state);
    expect(state).toEqual({ killBuffer: "old" }); // input untouched
    expect(result.state).not.toBe(state); // a new object
  });
});

describe("yank (Ctrl+Y)", () => {
  it("inserts the kill-buffer at the cursor and advances past it", () => {
    // cursor 4 is just before "bar" → "foo " + "XY" + "bar"
    expect(yank("foo bar", 4, { killBuffer: "XY" })).toEqual({ buffer: "foo XYbar", cursor: 6 });
  });
  it("inserts at the start", () => {
    expect(yank("bar", 0, { killBuffer: "foo " })).toEqual({ buffer: "foo bar", cursor: 4 });
  });
  it("appends at the end", () => {
    expect(yank("foo", 3, { killBuffer: "bar" })).toEqual({ buffer: "foobar", cursor: 6 });
  });
  it("is a no-op when the kill-buffer is empty", () => {
    expect(yank("foo", 1, EMPTY_KILL)).toEqual({ buffer: "foo", cursor: 1 });
  });
  it("clamps an out-of-range cursor", () => {
    expect(yank("foo", 99, { killBuffer: "X" })).toEqual({ buffer: "fooX", cursor: 4 });
    expect(yank("foo", -5, { killBuffer: "X" })).toEqual({ buffer: "Xfoo", cursor: 1 });
  });
  it("never mutates the input state", () => {
    const state: KillYankState = { killBuffer: "X" };
    yank("foo", 0, state);
    expect(state).toEqual({ killBuffer: "X" });
  });
});

describe("kill → yank round-trip", () => {
  it("Ctrl+U then Ctrl+Y at the cleared cursor restores the original text", () => {
    const k = killWholeLine("foo bar", 4, EMPTY_KILL); // buffer "", cursor 0, killBuffer "foo bar"
    const y = yank(k.buffer, k.cursor, k.state);
    expect(y.buffer).toBe("foo bar");
    expect(y.cursor).toBe(7);
  });
  it("Ctrl+U then Ctrl+Y at a different cursor inserts the killed text there", () => {
    const k = killWholeLine("abc", 3, EMPTY_KILL); // killBuffer "abc"
    // type "xy" then yank at cursor 1 → "x" + "abc" + "y"
    const y = yank("xy", 1, k.state);
    expect(y.buffer).toBe("xabcy");
    expect(y.cursor).toBe(4);
  });
  it("yank twice pastes the kill-buffer twice (kill-buffer is not consumed)", () => {
    const state: KillYankState = { killBuffer: "ab" };
    const first = yank("", 0, state);
    const second = yank(first.buffer, first.cursor, state);
    expect(second.buffer).toBe("abab");
    expect(second.cursor).toBe(4);
  });
});
