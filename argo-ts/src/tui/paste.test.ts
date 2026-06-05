import { describe, it, expect } from "vitest";
import {
  newPasteStore,
  lineCount,
  shouldCollapse,
  pasteRef,
  collapse,
  expandPastes,
} from "./paste.js";

describe("shouldCollapse", () => {
  it("ignores short single-line input (normal typing/paste of a word)", () => {
    expect(shouldCollapse("hello")).toBe(false);
    expect(shouldCollapse("a")).toBe(false);
  });
  it("collapses a long single-line block", () => {
    expect(shouldCollapse("x".repeat(200))).toBe(true);
  });
  it("collapses a multi-line block (>=4 lines)", () => {
    expect(shouldCollapse("a\nb\nc\nd")).toBe(true);
    expect(shouldCollapse("a\nb")).toBe(false);
  });
});

describe("lineCount", () => {
  it("counts lines, empty is 0", () => {
    expect(lineCount("")).toBe(0);
    expect(lineCount("one")).toBe(1);
    expect(lineCount("a\nb\nc")).toBe(3);
  });
});

describe("pasteRef", () => {
  it("uses +lines for multi-line and +chars for single-line", () => {
    expect(pasteRef(1, "a\nb\nc\nd\ne")).toBe("[Pasted text #1 +5 lines]");
    expect(pasteRef(2, "x".repeat(250))).toBe("[Pasted text #2 +250 chars]");
  });
});

describe("collapse + expandPastes round-trip", () => {
  it("replaces a paste with a ref and expands it back on submit", () => {
    const store = newPasteStore();
    const big = "line1\nline2\nline3\nline4\nline5";
    const ref = collapse(store, big);
    expect(ref).toBe("[Pasted text #1 +5 lines]");

    const composed = `here is the code: ${ref} please review`;
    expect(expandPastes(composed, store)).toBe(`here is the code: ${big} please review`);
  });

  it("numbers multiple pastes and expands each", () => {
    const store = newPasteStore();
    const r1 = collapse(store, "a\nb\nc\nd");
    const r2 = collapse(store, "x".repeat(300));
    expect(r1).toBe("[Pasted text #1 +4 lines]");
    expect(r2).toBe("[Pasted text #2 +300 chars]");
    expect(expandPastes(`${r1} and ${r2}`, store)).toBe(`a\nb\nc\nd and ${"x".repeat(300)}`);
  });

  it("leaves an edited/unknown ref untouched", () => {
    const store = newPasteStore();
    expect(expandPastes("[Pasted text #9 +99 lines]", store)).toBe("[Pasted text #9 +99 lines]");
  });

  it("is a no-op when nothing was pasted", () => {
    const store = newPasteStore();
    expect(expandPastes("just typed text", store)).toBe("just typed text");
  });
});
