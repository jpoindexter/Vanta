import { describe, it, expect } from "vitest";
import {
  decomposeObjective,
  synthesize,
  MAX_SUB_QUERIES,
  type SubQueryResult,
} from "./research-decompose.js";

describe("decomposeObjective", () => {
  it("fans an objective into at least 2 labeled sub-queries", () => {
    const subs = decomposeObjective("should we adopt Bun over Node");
    expect(subs.length).toBeGreaterThanOrEqual(2);
    for (const s of subs) {
      expect(s.dimension.length).toBeGreaterThan(0);
      expect(s.query).toContain("should we adopt Bun over Node");
    }
  });

  it("gives each sub-query a distinct dimension", () => {
    const subs = decomposeObjective("evaluate vector DBs", 4);
    const dims = subs.map((s) => s.dimension);
    expect(new Set(dims).size).toBe(dims.length);
  });

  it("clamps the fan-out to the cap and never below 2", () => {
    expect(decomposeObjective("x", 99).length).toBe(MAX_SUB_QUERIES);
    expect(decomposeObjective("x", 1).length).toBe(2);
    expect(decomposeObjective("x", -5).length).toBe(2);
  });

  it("returns no sub-queries for an empty objective", () => {
    expect(decomposeObjective("   ")).toEqual([]);
  });

  it("normalizes whitespace in the embedded objective", () => {
    const subs = decomposeObjective("  pick   a   queue  ");
    expect(subs[0]?.query).toContain("pick a queue");
  });
});

describe("synthesize", () => {
  const results: SubQueryResult[] = [
    {
      dimension: "current state",
      query: "What is the current state of: caching?",
      toolsUsed: ["web_search", "web_fetch"],
      findings: "Redis dominates; Memcached is legacy.",
    },
    {
      dimension: "constraints",
      query: "What constraints apply to: caching?",
      toolsUsed: ["code_search"],
      findings: "Single-node memory budget is tight.",
    },
  ];

  it("shows each dimension with its tools and findings", () => {
    const report = synthesize(results);
    expect(report).toContain("## current state");
    expect(report).toContain("tools: web_search, web_fetch");
    expect(report).toContain("findings: Redis dominates; Memcached is legacy.");
    expect(report).toContain("## constraints");
    expect(report).toContain("tools: code_search");
    expect(report).toContain("Single-node memory budget is tight.");
  });

  it("lists the union of all tools used in the footer", () => {
    const report = synthesize(results);
    expect(report).toContain("tools used across research: web_search, web_fetch, code_search");
  });

  it("dedupes tools across dimensions in the footer", () => {
    const dupes: SubQueryResult[] = [
      { dimension: "a", query: "q1", toolsUsed: ["web_search"], findings: "f1" },
      { dimension: "b", query: "q2", toolsUsed: ["web_search"], findings: "f2" },
    ];
    const report = synthesize(dupes);
    expect(report).toContain("tools used across research: web_search");
    expect(report).not.toContain("web_search, web_search");
  });

  it("marks a dimension with no tools and no findings explicitly", () => {
    const empty: SubQueryResult[] = [
      { dimension: "current state", query: "q", toolsUsed: [], findings: "  " },
    ];
    const report = synthesize(empty);
    expect(report).toContain("tools: (none reported)");
    expect(report).toContain("findings: (no findings)");
  });

  it("returns a clear message when nothing ran", () => {
    expect(synthesize([])).toBe("No research dimensions ran.");
  });
});
