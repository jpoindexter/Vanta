import { describe, expect, it } from "vitest";
import {
  composerSelectionCommand, extendComposerSelection, selectionMotionForKey,
} from "./composer-selection.js";

describe("composer selection key mapping", () => {
  it("maps Shift+Arrow to character selection motions", () => {
    expect(selectionMotionForKey({ shift: true, leftArrow: true })).toBe("charLeft");
    expect(selectionMotionForKey({ shift: true, rightArrow: true })).toBe("charRight");
  });

  it("maps Shift+Option+Arrow to word selection motions", () => {
    expect(selectionMotionForKey({ shift: true, meta: true, leftArrow: true })).toBe("wordLeft");
    expect(selectionMotionForKey({ shift: true, meta: true, rightArrow: true })).toBe("wordRight");
  });

  it("extends the visible composer selection from the caret", () => {
    expect(extendComposerSelection("hello", 2, null, { shift: true, rightArrow: true })).toEqual({
      value: "hello",
      cursor: 3,
      selection: { anchor: 2, cursor: 3 },
    });
  });
});

describe("composer selection commands", () => {
  it("Cmd+A selects the whole buffer", () => {
    expect(composerSelectionCommand("a", { super: true }, "hello", null)).toEqual({
      value: "hello",
      cursor: 5,
      selection: { anchor: 0, cursor: 5 },
    });
  });

  it("typing over a selection replaces it", () => {
    expect(composerSelectionCommand("X", {}, "hello", { anchor: 1, cursor: 4 })).toEqual({
      value: "hXo",
      cursor: 2,
      selection: null,
    });
  });

  it("Backspace deletes the selected range", () => {
    expect(composerSelectionCommand("", { backspace: true }, "hello", { anchor: 1, cursor: 4 })).toEqual({
      value: "ho",
      cursor: 1,
      selection: null,
    });
  });

  it("Cmd+C reports clipboard text without mutating the buffer", () => {
    expect(composerSelectionCommand("c", { super: true }, "hello", { anchor: 1, cursor: 4 })).toEqual({
      value: "hello",
      cursor: 4,
      selection: { anchor: 1, cursor: 4 },
      clipboard: "ell",
    });
  });

  it("Cmd+X reports clipboard text and cuts the range", () => {
    expect(composerSelectionCommand("x", { super: true }, "hello", { anchor: 1, cursor: 4 })).toEqual({
      value: "ho",
      cursor: 1,
      selection: null,
      clipboard: "ell",
    });
  });
});
