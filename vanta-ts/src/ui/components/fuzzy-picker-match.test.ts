import { describe, it, expect } from "vitest";
import { fuzzyMatch, fuzzyRank } from "./fuzzy-picker-match.js";

describe("fuzzyMatch — pure subsequence scoring", () => {
  it("matches an empty query against anything at score 0", () => {
    expect(fuzzyMatch("anything", "")).toEqual({ score: 0, indices: [] });
  });

  it("returns null when a query char is missing", () => {
    expect(fuzzyMatch("abc", "x")).toBeNull();
  });

  it("returns null when chars are present but out of order", () => {
    expect(fuzzyMatch("abc", "ba")).toBeNull();
  });

  it("matches a subsequence and reports the matched indices", () => {
    const m = fuzzyMatch("abcde", "ace");
    expect(m).not.toBeNull();
    expect(m!.indices).toEqual([0, 2, 4]);
  });

  it("is case-insensitive", () => {
    expect(fuzzyMatch("ReadFile", "rf")).not.toBeNull();
  });

  it("scores a contiguous prefix above a scattered match", () => {
    const contiguous = fuzzyMatch("readme", "rea")!.score;
    const scattered = fuzzyMatch("rxexax", "rea")!.score;
    expect(contiguous).toBeGreaterThan(scattered);
  });

  it("rewards a word-boundary match over a mid-word one", () => {
    const boundary = fuzzyMatch("foo-bar", "b")!.score;
    const midword = fuzzyMatch("foobar", "b")!.score;
    expect(boundary).toBeGreaterThan(midword);
  });
});

describe("fuzzyRank — ranking + capping", () => {
  const items = ["apple", "grape", "pineapple", "banana"];

  it("returns all items in order for an empty query", () => {
    const hits = fuzzyRank(items, "", (s) => s);
    expect(hits.map((h) => h.item)).toEqual(items);
  });

  it("filters to only the matching items", () => {
    const hits = fuzzyRank(items, "app", (s) => s);
    expect(hits.map((h) => h.item).sort()).toEqual(["apple", "pineapple"]);
  });

  it("excludes non-matches entirely", () => {
    const hits = fuzzyRank(items, "xyz", (s) => s);
    expect(hits).toEqual([]);
  });

  it("ranks the best match first", () => {
    // "apple" starts with the query → outranks "pineapple" where it's mid-word.
    const hits = fuzzyRank(items, "apple", (s) => s);
    expect(hits[0]!.item).toBe("apple");
  });

  it("respects the limit", () => {
    const hits = fuzzyRank(items, "a", (s) => s, 2);
    expect(hits.length).toBe(2);
  });

  it("extracts match text via the accessor for object items", () => {
    const objs = [{ name: "alpha" }, { name: "beta" }];
    const hits = fuzzyRank(objs, "alp", (o) => o.name);
    expect(hits.map((h) => h.item.name)).toEqual(["alpha"]);
  });
});
