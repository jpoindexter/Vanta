import { describe, it, expect } from "vitest";
import { splitForLimit, utf16Len, byteLen, measure } from "./split.js";

describe("utf16Len", () => {
  it("counts an astral emoji as two code units", () => {
    expect(utf16Len("a")).toBe(1);
    expect(utf16Len("😀")).toBe(2); // U+1F600 is a surrogate pair in UTF-16
    expect(utf16Len("a😀b")).toBe(4);
  });
});

describe("byteLen", () => {
  it("counts UTF-8 bytes, not characters, for multibyte input", () => {
    expect(byteLen("abc")).toBe(3);
    expect(byteLen("é")).toBe(2); // U+00E9 = 2 UTF-8 bytes
    expect(byteLen("€")).toBe(3); // U+20AC = 3 UTF-8 bytes
    expect(byteLen("😀")).toBe(4); // U+1F600 = 4 UTF-8 bytes
  });
});

describe("measure", () => {
  it("counts chars and utf16 by code units, bytes by UTF-8 length", () => {
    expect(measure("😀", "chars")).toBe(2);
    expect(measure("😀", "utf16")).toBe(2);
    expect(measure("😀", "bytes")).toBe(4);
    expect(measure("é", "chars")).toBe(1);
    expect(measure("é", "bytes")).toBe(2);
  });
});

describe("splitForLimit — no split needed", () => {
  it("returns the text unchanged when it fits the limit", () => {
    expect(splitForLimit("short reply", 100, "chars")).toEqual(["short reply"]);
  });

  it("returns the text unchanged at the exact boundary (inclusive limit)", () => {
    const text = "x".repeat(10);
    expect(splitForLimit(text, 10, "chars")).toEqual([text]);
  });

  it("passes empty text through as a single empty segment", () => {
    expect(splitForLimit("", 10, "chars")).toEqual([""]);
  });

  it("treats a non-positive limit as a no-op passthrough", () => {
    expect(splitForLimit("anything", 0, "chars")).toEqual(["anything"]);
  });
});

describe("splitForLimit — newline-boundary splitting", () => {
  it("breaks across newline boundaries into multiple under-limit segments", () => {
    const text = ["aaaa", "bbbb", "cccc", "dddd"].join("\n"); // 4 lines of 4
    const segments = splitForLimit(text, 9, "chars"); // "aaaa\nbbbb" = 9 fits, +cccc would be 14
    expect(segments).toEqual(["aaaa\nbbbb", "cccc\ndddd"]);
    for (const s of segments) expect(s.length).toBeLessThanOrEqual(9);
  });

  it("packs as many whole lines as fit before flushing", () => {
    const text = ["one", "two", "three", "four"].join("\n");
    const segments = splitForLimit(text, 8, "chars"); // "one\ntwo"=7 fits; +three overflows
    expect(segments).toEqual(["one\ntwo", "three", "four"]);
    for (const s of segments) expect(s.length).toBeLessThanOrEqual(8);
  });

  it("puts each line in its own segment when a pair never fits together", () => {
    const text = ["aaaaa", "bbbbb"].join("\n"); // each 5, together 11 > 6
    expect(splitForLimit(text, 6, "chars")).toEqual(["aaaaa", "bbbbb"]);
  });
});

describe("splitForLimit — hard-split of an over-long single line", () => {
  it("hard-splits a line with no newline that exceeds the limit", () => {
    const text = "x".repeat(25);
    const segments = splitForLimit(text, 10, "chars");
    expect(segments).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
    for (const s of segments) expect(s.length).toBeLessThanOrEqual(10);
  });

  it("hard-splits an over-long line then resumes packing the next line", () => {
    const text = `${"x".repeat(15)}\nshort`;
    const segments = splitForLimit(text, 10, "chars");
    // 15 x's -> [10 x's] + remainder "xxxxx"; then "xxxxx\nshort" (11) overflows -> flush remainder, "short" alone
    expect(segments).toEqual(["x".repeat(10), "x".repeat(5), "short"]);
    for (const s of segments) expect(s.length).toBeLessThanOrEqual(10);
  });

  it("never returns an over-limit segment for a long mixed reply", () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i} ${"y".repeat(i)}`).join("\n");
    const segments = splitForLimit(text, 30, "chars");
    expect(segments.length).toBeGreaterThan(1);
    for (const s of segments) expect(s.length).toBeLessThanOrEqual(30);
    // reassembling drops the boundary newlines we broke on, but every char survives
    expect(segments.join("").replace(/\n/g, "")).toBe(text.replace(/\n/g, ""));
  });
});

describe("splitForLimit — UTF-16 unit (Telegram)", () => {
  it("counts an astral emoji as 2 toward the limit", () => {
    // limit 4: "😀😀" = 4 utf16 units exactly; a third emoji must spill over
    const text = "😀😀😀";
    const segments = splitForLimit(text, 4, "utf16");
    expect(segments).toEqual(["😀😀", "😀"]);
    for (const s of segments) expect(utf16Len(s)).toBeLessThanOrEqual(4);
  });

  it("would NOT split the same emoji string under a char limit that fits its code points", () => {
    // 3 emoji = 6 utf16 units but only 3 "characters" by code point; we budget by
    // code units for both chars/utf16, so the behavior matches — documents intent.
    expect(splitForLimit("😀😀😀", 6, "utf16")).toEqual(["😀😀😀"]);
  });
});

describe("splitForLimit — bytes unit (IRC)", () => {
  it("counts multibyte chars by their UTF-8 byte cost", () => {
    // each "€" = 3 bytes; limit 6 -> 2 per segment
    const text = "€€€€"; // 12 bytes
    const segments = splitForLimit(text, 6, "bytes");
    expect(segments).toEqual(["€€", "€€"]);
    for (const s of segments) expect(byteLen(s)).toBeLessThanOrEqual(6);
  });

  it("does not split a byte string that fits the byte budget", () => {
    expect(splitForLimit("héllo", 6, "bytes")).toEqual(["héllo"]); // 6 bytes exactly
  });

  it("splits a string that fits in chars but exceeds the byte budget", () => {
    const text = "ééé"; // 3 chars, 6 bytes
    expect(splitForLimit(text, 4, "bytes")).toEqual(["éé", "é"]);
  });
});
