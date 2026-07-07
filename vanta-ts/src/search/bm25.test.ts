import { describe, it, expect } from "vitest";
import { lemmatize, tokenizeLemmas, buildBm25Index, idf, bm25Score, normalizeBm25, bm25Rank } from "./bm25.js";

// BRAIN-BM25-LEXICAL — IDF-weighted, lemmatized, 0..1-normalized lexical scoring.

describe("lemmatize", () => {
  it.each([
    ["cats", "cat"], ["stories", "story"], ["classes", "class"],
    ["running", "runn"], ["walked", "walk"], ["class", "class"], ["bus", "bus"], ["is", "is"],
  ])("%s → %s", (input, out) => expect(lemmatize(input)).toBe(out));

  it("tokenizeLemmas drops stopwords + short tokens and lemmatizes", () => {
    expect(tokenizeLemmas("The cats are running to a class")).toEqual(["cat", "runn", "class"]);
  });
});

describe("idf", () => {
  it("weights a rare term higher than a common one", () => {
    const index = buildBm25Index([
      { id: "1", text: "apple banana" }, { id: "2", text: "apple cherry" }, { id: "3", text: "apple date" },
    ]);
    // "apple" is in all 3 docs (common), "banana" in 1 (rare) → banana IDF higher.
    expect(idf("banana", index)).toBeGreaterThan(idf("apple", index));
  });
});

describe("normalizeBm25", () => {
  it("is a monotonic sigmoid bounded to (0,1)", () => {
    expect(normalizeBm25(0)).toBeGreaterThan(0);
    expect(normalizeBm25(0)).toBeLessThan(0.5);
    expect(normalizeBm25(100)).toBeGreaterThan(0.99);
    expect(normalizeBm25(10)).toBeGreaterThan(normalizeBm25(1));
  });
});

describe("bm25Score / bm25Rank", () => {
  const docs = [
    { id: "a", text: "the quick brown fox jumps" },
    { id: "b", text: "a lazy dog sleeps all day in the sun" },
    { id: "c", text: "quick foxes are quick and clever" },
  ];

  it("ranks the doc matching MORE distinct query terms first (IDF-weighted)", () => {
    const ranked = bm25Rank("quick fox", docs);
    // "a" matches both "quick" AND "fox"; "c" matches only "quick" (foxes stems to
    // "foxe", not "fox") → a outranks c; b matches neither and is absent.
    expect(ranked.map((r) => r.id)).toEqual(["a", "c"]);
    expect(ranked.every((r) => r.score > 0 && r.score < 1)).toBe(true);
  });

  it("returns nothing for a query with no matching terms (empty signal)", () => {
    expect(bm25Rank("zebra", docs)).toEqual([]);
  });

  it("lemmatization matches a plural query to a singular doc term", () => {
    const ranked = bm25Rank("jumps", docs); // "jumps" → "jump", doc a has "jumps"→"jump"
    expect(ranked.map((r) => r.id)).toContain("a");
  });

  it("length-normalizes: a term in a short doc outscores the same term in a long padded doc", () => {
    const short = { id: "s", text: "signal here" };
    const long = { id: "l", text: `signal ${"filler ".repeat(50)}` };
    const ranked = bm25Rank("signal", [short, long]);
    expect(ranked[0]?.id).toBe("s");
  });

  it("score is 0 for a doc missing the query term", () => {
    const index = buildBm25Index(docs);
    expect(bm25Score(["zebra"], "a", index)).toBe(0);
  });
});
