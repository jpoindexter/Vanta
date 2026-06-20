import { describe, expect, it } from "vitest";
import { SPINNER_VERBS } from "./figures.js";
import {
  DEFAULT_SPINNER_VERBS,
  SPINNER_VERBS_ENV,
  parseUserVerbs,
  resolveSpinnerVerbs,
  spinnerVerbAt,
} from "./spinner-verbs.js";

const ESC = String.fromCharCode(0x1b); // terminal escape, never allowed in a verb

describe("DEFAULT_SPINNER_VERBS", () => {
  it("mirrors the built-in figures.ts verb list (single source of truth)", () => {
    expect(DEFAULT_SPINNER_VERBS).toEqual([...SPINNER_VERBS]);
    expect(DEFAULT_SPINNER_VERBS.length).toBeGreaterThan(0);
  });
});

describe("parseUserVerbs", () => {
  it("splits a comma-separated list and trims each entry", () => {
    expect(parseUserVerbs("Thinking, Working , Cooking")).toEqual([
      "Thinking",
      "Working",
      "Cooking",
    ]);
  });

  it("splits a pipe-separated list", () => {
    expect(parseUserVerbs("Thinking|Working|Cooking")).toEqual([
      "Thinking",
      "Working",
      "Cooking",
    ]);
  });

  it("accepts a mix of comma and pipe separators", () => {
    expect(parseUserVerbs("a, b|c , d")).toEqual(["a", "b", "c", "d"]);
  });

  it("drops empty and whitespace-only entries", () => {
    expect(parseUserVerbs("a,,  ,b,|,c")).toEqual(["a", "b", "c"]);
  });

  it("control-strips each verb so a terminal escape can't be injected", () => {
    const malicious = `Th${ESC}[31mink`; // ESC + CSI red-color sequence embedded
    const [verb] = parseUserVerbs(malicious);
    expect(verb).toBe("Th[31mink");
    expect(verb).not.toContain(ESC);
  });

  it("strips NUL, DEL, and C1 control chars", () => {
    const raw = `a${String.fromCharCode(0)}b${String.fromCharCode(0x7f)}c${String.fromCharCode(0x9b)}d`;
    expect(parseUserVerbs(raw)).toEqual(["abcd"]);
  });

  it("returns an empty array for undefined", () => {
    expect(parseUserVerbs(undefined)).toEqual([]);
  });

  it("returns an empty array for a blank string", () => {
    expect(parseUserVerbs("   ")).toEqual([]);
    expect(parseUserVerbs("")).toEqual([]);
    expect(parseUserVerbs(", | ,")).toEqual([]);
  });
});

describe("resolveSpinnerVerbs", () => {
  it("returns the default verbs when the env var is unset", () => {
    expect(resolveSpinnerVerbs({})).toEqual([...DEFAULT_SPINNER_VERBS]);
  });

  it("returns the default verbs when the env var is blank", () => {
    expect(resolveSpinnerVerbs({ [SPINNER_VERBS_ENV]: "   " })).toEqual([
      ...DEFAULT_SPINNER_VERBS,
    ]);
  });

  it("returns the default verbs when the env var has only separators/empties", () => {
    expect(resolveSpinnerVerbs({ [SPINNER_VERBS_ENV]: ", | ," })).toEqual([
      ...DEFAULT_SPINNER_VERBS,
    ]);
  });

  it("overrides the default with the user's verbs when provided", () => {
    expect(resolveSpinnerVerbs({ [SPINNER_VERBS_ENV]: "Pondering|Brewing" })).toEqual([
      "Pondering",
      "Brewing",
    ]);
  });

  it("returns a fresh array, not the shared default reference", () => {
    const result = resolveSpinnerVerbs({});
    expect(result).not.toBe(DEFAULT_SPINNER_VERBS);
    result.push("mutated");
    expect(DEFAULT_SPINNER_VERBS).not.toContain("mutated");
  });
});

describe("spinnerVerbAt", () => {
  const verbs = ["one", "two", "three"];

  it("picks the verb at the tick", () => {
    expect(spinnerVerbAt(verbs, 0)).toBe("one");
    expect(spinnerVerbAt(verbs, 1)).toBe("two");
    expect(spinnerVerbAt(verbs, 2)).toBe("three");
  });

  it("cycles and wraps past the end of the list", () => {
    expect(spinnerVerbAt(verbs, 3)).toBe("one");
    expect(spinnerVerbAt(verbs, 4)).toBe("two");
    expect(spinnerVerbAt(verbs, 7)).toBe("two");
  });

  it("handles a single-verb list (always that verb)", () => {
    expect(spinnerVerbAt(["only"], 0)).toBe("only");
    expect(spinnerVerbAt(["only"], 99)).toBe("only");
  });

  it("wraps a negative tick into range instead of going out of bounds", () => {
    expect(spinnerVerbAt(verbs, -1)).toBe("three");
    expect(spinnerVerbAt(verbs, -3)).toBe("one");
  });

  it("floors a fractional tick", () => {
    expect(spinnerVerbAt(verbs, 1.9)).toBe("two");
  });

  it("falls back to the default list (never blank) when given an empty list", () => {
    expect(spinnerVerbAt([], 0)).toBe(DEFAULT_SPINNER_VERBS[0]);
  });

  it("treats a non-finite tick as 0", () => {
    expect(spinnerVerbAt(verbs, Number.NaN)).toBe("one");
    expect(spinnerVerbAt(verbs, Number.POSITIVE_INFINITY)).toBe("one");
  });
});
