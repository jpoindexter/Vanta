import { describe, it, expect } from "vitest";
import {
  selRange, selEmpty, selectedText, selectAll, deleteSelection, replaceSelection,
  motionCursor, extendSelection, type Sel,
} from "./selection.js";

// TUI-SELECT — the pure composer selection model.

describe("selRange / selEmpty / selectedText", () => {
  it("orders anchor/cursor into [start,end)", () => {
    expect(selRange({ anchor: 5, cursor: 2 })).toEqual({ start: 2, end: 5 });
    expect(selRange({ anchor: 2, cursor: 5 })).toEqual({ start: 2, end: 5 });
  });
  it("an anchor===cursor selection is empty", () => {
    expect(selEmpty({ anchor: 3, cursor: 3 })).toBe(true);
    expect(selEmpty(null)).toBe(true);
    expect(selEmpty({ anchor: 1, cursor: 4 })).toBe(false);
  });
  it("selectedText slices the range (empty → \"\")", () => {
    expect(selectedText("hello world", { anchor: 0, cursor: 5 })).toBe("hello");
    expect(selectedText("hello", { anchor: 2, cursor: 2 })).toBe("");
  });
});

describe("selectAll / delete / replace", () => {
  it("selectAll spans the whole buffer", () => {
    expect(selectAll("abc")).toEqual({ anchor: 0, cursor: 3 });
  });
  it("deleteSelection removes the range, cursor at the start", () => {
    expect(deleteSelection("hello world", { anchor: 5, cursor: 11 })).toEqual({ value: "hello", cursor: 5 });
  });
  it("replaceSelection swaps the range for text (typing/paste over a selection)", () => {
    expect(replaceSelection("hello world", { anchor: 0, cursor: 5 }, "hi")).toEqual({ value: "hi world", cursor: 2 });
    // typing a single char over a selection replaces it
    expect(replaceSelection("abcde", { anchor: 1, cursor: 4 }, "X")).toEqual({ value: "aXe", cursor: 2 });
  });
});

describe("motionCursor", () => {
  const v = "one two\nthree four";
  it("char left/right clamp at the buffer bounds", () => {
    expect(motionCursor(v, 0, "charLeft")).toBe(0);
    expect(motionCursor("ab", 2, "charRight")).toBe(2);
    expect(motionCursor("ab", 1, "charRight")).toBe(2);
  });
  it("word left/right jump by word (end-of-word forward, like the composer's ⌥→)", () => {
    expect(motionCursor(v, 0, "wordRight")).toBe(3); // end of 'one'
    expect(motionCursor(v, 7, "wordLeft")).toBe(4); // start of 'two'
  });
  it("line start/end respect the current line", () => {
    expect(motionCursor(v, 5, "lineStart")).toBe(0);
    expect(motionCursor(v, 5, "lineEnd")).toBe(7); // before the \n
    expect(motionCursor(v, 10, "lineStart")).toBe(8); // second line
  });
  it("line up/down move vertically keeping the column", () => {
    expect(motionCursor(v, 12, "lineUp")).toBe(4); // 'three'[4]→line1 col4
    expect(motionCursor(v, 4, "lineDown")).toBe(12);
  });
  it("buffer start/end jump to the extremes", () => {
    expect(motionCursor(v, 5, "bufStart")).toBe(0);
    expect(motionCursor(v, 5, "bufEnd")).toBe(v.length);
  });
});

describe("extendSelection", () => {
  it("drops the anchor at the cursor when starting a fresh selection", () => {
    const s = extendSelection("hello", null, 2, "charRight");
    expect(s).toEqual({ anchor: 2, cursor: 3 });
  });
  it("keeps the anchor and moves the cursor when extending", () => {
    const first: Sel = extendSelection("hello", null, 0, "charRight"); // {0,1}
    const second = extendSelection("hello", first, first.cursor, "charRight"); // {0,2}
    expect(second).toEqual({ anchor: 0, cursor: 2 });
  });
  it("can shrink back through the anchor (shift-left after shift-right)", () => {
    const s = extendSelection("hello", { anchor: 2, cursor: 4 }, 4, "charLeft");
    expect(s).toEqual({ anchor: 2, cursor: 3 });
  });
  it("shift+word-right selects a word from the start (to end-of-word)", () => {
    const s = extendSelection("hello world", null, 0, "wordRight");
    expect(selectedText("hello world", s)).toBe("hello");
  });
});
