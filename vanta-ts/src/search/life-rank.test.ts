import { describe, it, expect } from "vitest";
import { rankResults, tokenize } from "./life-rank.js";
import type { LifeHit } from "./life.js";

const NOW = new Date("2024-06-01T00:00:00Z").getTime();

describe("tokenize", () => {
  it("splits on non-alphanumeric boundaries", () => {
    expect(tokenize("Hello, World!")).toEqual(["hello", "world"]);
  });
  it("lowercases everything", () => {
    expect(tokenize("FOO BAR")).toEqual(["foo", "bar"]);
  });
  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("rankResults", () => {
  it("returns empty array when given no results", () => {
    expect(rankResults([], "foo", NOW)).toEqual([]);
  });

  it("more query-term hits rank higher", () => {
    const hits: LifeHit[] = [
      { source: "world", snippet: "revenue contract signed" },
      { source: "world", snippet: "revenue revenue contract contract revenue" },
    ];
    const ranked = rankResults(hits, "revenue contract", NOW);
    expect(ranked[0]?.snippet).toContain("revenue revenue contract");
  });

  it("exact phrase beats scattered tokens", () => {
    const scattered: LifeHit = {
      source: "radar",
      snippet: "client wants revenue; contract is elsewhere",
    };
    const exact: LifeHit = {
      source: "radar",
      snippet: "revenue contract finalised today",
    };
    const ranked = rankResults([scattered, exact], "revenue contract", NOW);
    expect(ranked[0]?.snippet).toBe(exact.snippet);
  });

  it("newer record (ISO date in snippet) breaks a tie between otherwise equal hits", () => {
    const older: LifeHit = {
      source: "team",
      snippet: "meeting notes 2023-01-01 agenda: budget review",
    };
    const newer: LifeHit = {
      source: "team",
      snippet: "meeting notes 2024-05-01 agenda: budget review",
    };
    const ranked = rankResults([older, newer], "budget review", NOW);
    expect(ranked[0]?.snippet).toBe(newer.snippet);
  });

  it("relevance is always within [0, 1]", () => {
    const hits: LifeHit[] = [
      { source: "money", snippet: "invoice paid 2024-04-15" },
      { source: "world", snippet: "completely unrelated content here" },
      {
        source: "errors",
        snippet: "invoice invoice invoice invoice invoice paid paid paid paid paid",
      },
    ];
    const ranked = rankResults(hits, "invoice paid", NOW);
    for (const r of ranked) {
      expect(r.relevance).toBeGreaterThanOrEqual(0);
      expect(r.relevance).toBeLessThanOrEqual(1);
    }
  });

  it("title/source match adds a bonus", () => {
    const sourceMiss: LifeHit = {
      source: "world",
      snippet: "some entry about project alpha",
    };
    const sourceHit: LifeHit = {
      source: "project",
      snippet: "some entry about project alpha",
    };
    const ranked = rankResults([sourceMiss, sourceHit], "project", NOW);
    expect(ranked[0]?.source).toBe("project");
  });

  it("returns results sorted descending by relevance", () => {
    const hits: LifeHit[] = [
      { source: "world", snippet: "no match here at all" },
      { source: "world", snippet: "payment received from client" },
      { source: "money", snippet: "payment payment payment" },
    ];
    const ranked = rankResults(hits, "payment", NOW);
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(ranked[i]!.relevance).toBeGreaterThanOrEqual(ranked[i + 1]!.relevance);
    }
  });

  it("RankedResult preserves source and snippet from LifeHit", () => {
    const hit: LifeHit = { source: "errors", snippet: "crash on startup" };
    const [result] = rankResults([hit], "crash", NOW);
    expect(result?.source).toBe("errors");
    expect(result?.snippet).toBe("crash on startup");
  });
});
