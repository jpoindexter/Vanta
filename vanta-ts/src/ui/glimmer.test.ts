import { describe, expect, it } from "vitest";
import { GLIMMER_ENV, glimmerBand, glimmerEnabled, glimmerSegments, plainSegments } from "./glimmer.js";

describe("glimmerEnabled", () => {
  it("is on by default for a normal interactive TUI session", () => {
    expect(glimmerEnabled({}, true)).toBe(true);
  });

  it("is on when VANTA_GLIMMER=1", () => {
    expect(glimmerEnabled({ [GLIMMER_ENV]: "1" }, true)).toBe(true);
  });

  it("is on when VANTA_GLIMMER=true", () => {
    expect(glimmerEnabled({ [GLIMMER_ENV]: "true" }, true)).toBe(true);
  });

  it("is off for explicit off values", () => {
    expect(glimmerEnabled({ [GLIMMER_ENV]: "0" }, true)).toBe(false);
    expect(glimmerEnabled({ [GLIMMER_ENV]: "false" }, true)).toBe(false);
    expect(glimmerEnabled({ [GLIMMER_ENV]: "off" }, true)).toBe(false);
    expect(glimmerEnabled({ [GLIMMER_ENV]: "no" }, true)).toBe(false);
  });

  it("respects reduced-motion and bare/scripted gates", () => {
    expect(glimmerEnabled({ VANTA_REDUCED_MOTION: "1" }, true)).toBe(false);
    expect(glimmerEnabled({ NO_COLOR: "1" }, true)).toBe(false);
    expect(glimmerEnabled({ VANTA_BARE: "1" }, true)).toBe(false);
    expect(glimmerEnabled({}, false)).toBe(false);
  });
});

describe("glimmerBand", () => {
  it("returns an empty set for zero length", () => {
    expect(glimmerBand(0, 5).size).toBe(0);
  });

  it("returns the default-width band at the swept start position", () => {
    // tick 0, length 10, default width 3 → indices {0,1,2}.
    expect([...glimmerBand(10, 0)].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("sweeps one position forward per tick", () => {
    expect([...glimmerBand(10, 1)].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect([...glimmerBand(10, 2)].sort((a, b) => a - b)).toEqual([2, 3, 4]);
  });

  it("wraps the band around the end of the text", () => {
    // start at the last index → band wraps to the front.
    expect([...glimmerBand(5, 4)].sort((a, b) => a - b)).toEqual([0, 1, 4]);
  });

  it("wraps the start position cyclically per tick", () => {
    // tick 10 on length 10 == tick 0.
    expect([...glimmerBand(10, 10)].sort((a, b) => a - b)).toEqual([...glimmerBand(10, 0)].sort((a, b) => a - b));
  });

  it("respects an explicit band width", () => {
    expect([...glimmerBand(10, 0, { bandWidth: 5 })].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it("clamps band width to the text length", () => {
    expect(glimmerBand(3, 0, { bandWidth: 99 }).size).toBe(3);
  });

  it("floors and wraps a negative or fractional tick", () => {
    // floor(-1) = -1 → ((-1 % 5) + 5) % 5 = 4 → band {4,0,1} → sorted [0,1,4].
    expect([...glimmerBand(5, -1)].sort((a, b) => a - b)).toEqual([0, 1, 4]);
    expect([...glimmerBand(5, 1.9)].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });
});

describe("glimmerSegments", () => {
  it("returns [] for empty text", () => {
    expect(glimmerSegments("", 0)).toEqual([]);
  });

  it("splits text into ordered bright/normal runs covering the whole text", () => {
    const segments = glimmerSegments("working", 0);
    // Default width 3 → first 3 chars bright, rest normal.
    expect(segments).toEqual([
      { text: "wor", bright: true },
      { text: "king", bright: false },
    ]);
  });

  it("reconstructs the original text exactly (concat of segment texts)", () => {
    for (const tick of [0, 1, 3, 7, 12]) {
      const text = "processing";
      const joined = glimmerSegments(text, tick).map((s) => s.text).join("");
      expect(joined).toBe(text);
    }
  });

  it("preserves character order across a wrapped band", () => {
    const text = "abcde";
    // tick 4, width 3 → bright {0,1,4}: a(b) bright, cd normal, e bright.
    const segments = glimmerSegments(text, 4);
    expect(segments).toEqual([
      { text: "ab", bright: true },
      { text: "cd", bright: false },
      { text: "e", bright: true },
    ]);
    expect(segments.map((s) => s.text).join("")).toBe(text);
  });

  it("advances the band as the tick advances", () => {
    const text = "analyzing";
    const t0 = glimmerSegments(text, 0);
    const t1 = glimmerSegments(text, 1);
    expect(t1).not.toEqual(t0);
    // Both still reconstruct the text.
    expect(t0.map((s) => s.text).join("")).toBe(text);
    expect(t1.map((s) => s.text).join("")).toBe(text);
  });

  it("honors an explicit band width", () => {
    expect(glimmerSegments("abcdef", 0, { bandWidth: 2 })).toEqual([
      { text: "ab", bright: true },
      { text: "cdef", bright: false },
    ]);
  });
});

describe("plainSegments (off / static render path)", () => {
  it("returns the whole text as one normal segment", () => {
    expect(plainSegments("working")).toEqual([{ text: "working", bright: false }]);
  });

  it("returns [] for empty text", () => {
    expect(plainSegments("")).toEqual([]);
  });

  it("matches the original text with no bright runs", () => {
    const segments = plainSegments("processing");
    expect(segments.every((s) => !s.bright)).toBe(true);
    expect(segments.map((s) => s.text).join("")).toBe("processing");
  });
});
