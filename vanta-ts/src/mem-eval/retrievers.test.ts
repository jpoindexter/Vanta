import { describe, it, expect } from "vitest";
import { fuseRrf, resolveRetriever, type RankCtx } from "./retrievers.js";
import type { MemoryRecord } from "./types.js";

const NOW = Date.parse("2024-07-01");

const records: MemoryRecord[] = [
  { id: "r1", session: 1, at: "2024-01-01", text: "Jason uses the Zed editor now" },
  { id: "r2", session: 1, at: "2024-01-02", text: "Vanta kernel is written in Rust" },
  { id: "r3", session: 1, at: "2024-01-03", text: "the brain stores markdown regions" },
];

const emptyCtx: RankCtx = { now: NOW, queryVec: null, recordVecs: new Map() };

describe("fuseRrf", () => {
  it("ranks an item that scores high in both lists above single-list winners", () => {
    const fused = fuseRrf([["x", "a", "b"], ["x", "b", "a"]]);
    expect(fused[0]).toBe("x"); // rank 0 in both lists → unambiguous winner
    expect(fused.slice(1)).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("returns each id once", () => {
    const fused = fuseRrf([["a", "b"], ["a", "b"]]);
    expect(fused).toEqual(["a", "b"]);
  });
});

describe("lexical retriever", () => {
  it("ranks the keyword-matching record first", () => {
    const ranked = resolveRetriever("lexical").rank("which editor does Jason use", records, emptyCtx);
    expect(ranked[0]).toBe("r1");
  });
});

describe("semantic retriever", () => {
  it("ranks by cosine over supplied vectors", () => {
    const recordVecs = new Map([
      ["r1", [1, 0, 0]],
      ["r2", [0, 1, 0]],
      ["r3", [0, 0, 1]],
    ]);
    const ctx: RankCtx = { now: NOW, queryVec: [0.9, 0.1, 0], recordVecs };
    const ranked = resolveRetriever("semantic").rank("q", records, ctx);
    expect(ranked[0]).toBe("r1");
  });

  it("returns nothing when no query vector", () => {
    expect(resolveRetriever("semantic").rank("q", records, emptyCtx)).toEqual([]);
  });
});

describe("hybrid retriever", () => {
  it("falls back to lexical when no embeddings are available", () => {
    const ranked = resolveRetriever("hybrid").rank("which editor does Jason use", records, emptyCtx);
    expect(ranked[0]).toBe("r1");
    expect(ranked).toHaveLength(records.length);
  });
});
