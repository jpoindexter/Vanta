import { describe, it, expect } from "vitest";
import type { Key } from "ink";
import { parseChord, matchChord, formatChord } from "./chord.js";

// Build a Key with only the named fields true (everything else false).
function key(over: Partial<Key>): Key {
  const base = {
    ctrl: false, meta: false, shift: false, upArrow: false, downArrow: false,
    leftArrow: false, rightArrow: false, return: false, backspace: false,
    delete: false, escape: false, tab: false, pageUp: false, pageDown: false,
    wheelUp: false, wheelDown: false, home: false, end: false,
  };
  return { ...base, ...over } as Key;
}

describe("parseChord", () => {
  it("parses a ctrl + letter chord", () => {
    expect(parseChord("ctrl+o")).toEqual({ ctrl: true, shift: false, meta: false, char: "o" });
  });
  it("parses shift + named key", () => {
    expect(parseChord("shift+tab")).toEqual({ ctrl: false, shift: true, meta: false, named: "tab" });
  });
  it("canonicalises aliases (enter → return, pgup → pageup)", () => {
    expect(parseChord("enter").named).toBe("return");
    expect(parseChord("pgup").named).toBe("pageup");
  });
  it("accepts alt/option as meta", () => {
    expect(parseChord("alt+f").meta).toBe(true);
    expect(parseChord("option+b").meta).toBe(true);
  });
  it("throws on an unknown modifier", () => {
    expect(() => parseChord("hyper+x")).toThrow(/unknown modifier/);
  });
  it("throws on an unknown multi-char key", () => {
    expect(() => parseChord("ctrl+nope")).toThrow(/unknown key/);
  });
  it("throws on an empty spec", () => {
    expect(() => parseChord("  ")).toThrow(/empty/);
  });
});

describe("matchChord", () => {
  it("matches ctrl+o against the live event", () => {
    expect(matchChord(parseChord("ctrl+o"), "o", key({ ctrl: true }))).toBe(true);
  });
  it("rejects ctrl+o when ctrl is absent", () => {
    expect(matchChord(parseChord("ctrl+o"), "o", key({}))).toBe(false);
  });
  it("matches shift+tab but not plain tab", () => {
    expect(matchChord(parseChord("shift+tab"), "", key({ tab: true, shift: true }))).toBe(true);
    expect(matchChord(parseChord("tab"), "", key({ tab: true, shift: true }))).toBe(false);
  });
  it("matches a named scroll chord (shift+up)", () => {
    expect(matchChord(parseChord("shift+up"), "", key({ upArrow: true, shift: true }))).toBe(true);
  });
  it("requires modifiers to match exactly", () => {
    // plain tab must NOT match when shift is held
    expect(matchChord(parseChord("tab"), "", key({ tab: true }))).toBe(true);
    expect(matchChord(parseChord("ctrl+end"), "", key({ end: true, ctrl: true }))).toBe(true);
  });
});

describe("formatChord", () => {
  it("renders modifiers + letters", () => {
    expect(formatChord(parseChord("ctrl+o"))).toBe("^O");
  });
  it("renders shift + tab as ⇧⇥", () => {
    expect(formatChord(parseChord("shift+tab"))).toBe("⇧⇥");
  });
  it("renders shift + up as ⇧↑", () => {
    expect(formatChord(parseChord("shift+up"))).toBe("⇧↑");
  });
  it("renders ctrl + end", () => {
    expect(formatChord(parseChord("ctrl+end"))).toBe("^end");
  });
});
