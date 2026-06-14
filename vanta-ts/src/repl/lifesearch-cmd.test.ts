import { describe, it, expect } from "vitest";
import { formatLife, relevanceBar } from "./lifesearch-cmd.js";
import type { RankedResult } from "../search/life-rank.js";

describe("relevanceBar", () => {
  it("returns all filled for score 1", () => {
    const bar = relevanceBar(1);
    expect(bar).not.toContain("░");
  });

  it("returns all empty for score 0", () => {
    const bar = relevanceBar(0);
    expect(bar).not.toContain("█");
  });

  it("clamps values outside [0,1]", () => {
    expect(() => relevanceBar(-0.5)).not.toThrow();
    expect(() => relevanceBar(1.5)).not.toThrow();
  });
});

describe("formatLife", () => {
  it("returns a no-hits line for empty hits array", () => {
    const out = formatLife([], "acme");
    expect(out).toBe('no local hits for "acme"');
  });

  it("returns header + ranked rows for hits", () => {
    const hits: RankedResult[] = [
      { source: "world", snippet: "Bob works at Acme", relevance: 0.82 },
      { source: "money", snippet: "Invoice from Acme", relevance: 0.45 },
    ];
    const out = formatLife(hits, "acme");
    expect(out).toContain('life search: "acme"');
    expect(out).toContain("2 hit(s)");
    expect(out).toContain("world · Bob works at Acme");
    expect(out).toContain("money · Invoice from Acme");
  });

  it("shows singular hit count in header", () => {
    const hits: RankedResult[] = [{ source: "world", snippet: "Alice", relevance: 0.5 }];
    const out = formatLife(hits, "alice");
    expect(out).toContain("1 hit(s)");
  });

  it("includes relevance percentage in each row", () => {
    const hits: RankedResult[] = [
      { source: "radar", snippet: "opportunity score", relevance: 0.75 },
    ];
    const out = formatLife(hits, "opportunity");
    expect(out).toContain("75%");
  });
});
