import { describe, it, expect } from "vitest";
import { hasRtl, reorderBidi } from "./bidi.js";

// Logical-order fixtures. "שלום" is shin·lamed·vav·(final)mem in logical (memory)
// order; reversed it reads correctly L→R on a non-bidi terminal grid. We build the
// expected strings by reversing the SAME literal so the test states the algorithm,
// not a magic constant.
const SHALOM = "שלום"; // hello (Hebrew)
const SALAM = "سلام"; // hello (Arabic)
const rev = (s: string): string => [...s].reverse().join("");

describe("hasRtl", () => {
  it("returns false for pure-LTR text", () => {
    expect(hasRtl("hello world 123")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasRtl("")).toBe(false);
  });

  it("returns true when a Hebrew character is present", () => {
    expect(hasRtl(`a ${SHALOM} b`)).toBe(true);
  });

  it("returns true when an Arabic character is present", () => {
    expect(hasRtl(SALAM)).toBe(true);
  });
});

describe("reorderBidi — LTR is untouched", () => {
  it("returns pure-LTR text byte-identical", () => {
    const input = "the quick brown fox\njumped over 42 logs.";
    expect(reorderBidi(input)).toBe(input);
  });

  it("returns the same reference object semantics (identical string) for LTR", () => {
    const input = "no rtl here";
    expect(reorderBidi(input)).toStrictEqual(input);
  });
});

describe("reorderBidi — pure-RTL line", () => {
  it("reverses a single Hebrew word to visual order", () => {
    expect(reorderBidi(SHALOM)).toBe(rev(SHALOM));
  });

  it("reverses a single Arabic word to visual order", () => {
    expect(reorderBidi(SALAM)).toBe(rev(SALAM));
  });

  it("reverses two Hebrew words and mirrors their order (RTL base)", () => {
    // logical: "שלום עולם" (hello world). Visual under RTL base: each word reversed
    // AND the word order mirrored, so "עולם" appears first (leftmost) on screen.
    const input = `${SHALOM} עולם`;
    const expected = `${rev("עולם")} ${rev(SHALOM)}`;
    expect(reorderBidi(input)).toBe(expected);
  });
});

describe("reorderBidi — mixed RTL + LTR runs", () => {
  it("keeps an LTR run LTR while reversing the RTL run, mirrored under RTL base", () => {
    // Base is RTL (first strong char is Hebrew). The Latin run "OK" stays LTR; the
    // Hebrew run is reversed; run order mirrors so "OK" lands on the right.
    const input = `${SHALOM} OK`;
    const expected = `OK ${rev(SHALOM)}`;
    expect(reorderBidi(input)).toBe(expected);
  });

  it("keeps the LTR run first when the line's base direction is LTR", () => {
    // First strong char is Latin → LTR base → run order NOT mirrored; only the
    // embedded Hebrew run is reversed in place.
    const input = `Reply: ${SHALOM} now`;
    const expected = `Reply: ${rev(SHALOM)} now`;
    expect(reorderBidi(input)).toBe(expected);
  });
});

describe("reorderBidi — digits and Latin stay LTR inside RTL", () => {
  it("keeps an embedded number readable left-to-right", () => {
    // logical "שלום 42" → digits are an LTR run, kept "42"; Hebrew reversed; RTL
    // base mirrors run order so "42" is leftmost.
    const input = `${SHALOM} 42`;
    const expected = `42 ${rev(SHALOM)}`;
    expect(reorderBidi(input)).toBe(expected);
    expect(reorderBidi(input)).toContain("42"); // digits not reversed to "24"
  });

  it("does not reverse a multi-digit number embedded in Arabic", () => {
    const input = `${SALAM} 100`;
    expect(reorderBidi(input)).toContain("100");
    expect(reorderBidi(input)).not.toContain("001");
  });
});

describe("reorderBidi — multi-line", () => {
  it("reorders each line independently and leaves LTR lines untouched", () => {
    const input = `plain ascii line\n${SHALOM}\ntrailing 99`;
    const expected = `plain ascii line\n${rev(SHALOM)}\ntrailing 99`;
    expect(reorderBidi(input)).toBe(expected);
  });

  it("respects an explicit RTL base override on a line whose first char is Latin", () => {
    const input = `OK ${SHALOM}`;
    // Default (LTR base): "OK " stays, Hebrew reversed in place.
    expect(reorderBidi(input)).toBe(`OK ${rev(SHALOM)}`);
    // Forced RTL base: run order mirrors so the Hebrew run moves leftmost.
    expect(reorderBidi(input, "rtl")).toBe(`${rev(SHALOM)} OK`);
  });
});
