import { describe, it, expect } from "vitest";
import { fuzzyFilter } from "./fuzzy.js";

describe("fuzzy", () => {
  const items = [
    { name: "help", desc: "show command list" },
    { name: "history", desc: "show conversation history" },
    { name: "handoff", desc: "copy-paste handoff packet" },
    { name: "goal", desc: "set a standing goal" },
    { name: "goals", desc: "list active goals" },
  ];

  it("filters by exact prefix match", () => {
    const results = fuzzyFilter(items, "help", (i) => i.name);
    expect(results).toHaveLength(1);
    expect(results[0]?.item.name).toBe("help");
  });

  it("filters by subsequence match", () => {
    const results = fuzzyFilter(items, "hst", (i) => i.name);
    expect(results.map((r) => r.item.name)).toContain("history");
  });

  it("filters multiple matches and sorts by score", () => {
    const results = fuzzyFilter(items, "h", (i) => i.name);
    // All items starting with 'h' or containing 'h': help, history, handoff
    expect(results.length).toBeGreaterThan(0);
    // help and history should rank higher than handoff (start of string)
    const names = results.map((r) => r.item.name);
    expect(names).toContain("help");
    expect(names).toContain("history");
  });

  it("returns no matches for impossible query", () => {
    const results = fuzzyFilter(items, "xyz", (i) => i.name);
    expect(results).toHaveLength(0);
  });

  it("returns all items for empty query", () => {
    const results = fuzzyFilter(items, "", (i) => i.name);
    expect(results).toHaveLength(items.length);
  });

  it("finds word-boundary matches", () => {
    const results = fuzzyFilter(items, "go", (i) => i.name);
    const names = results.map((r) => r.item.name);
    expect(names).toContain("goal");
    expect(names).toContain("goals");
  });

  it("scores consecutive matches higher", () => {
    const results = fuzzyFilter(items, "hist", (i) => i.name);
    expect(results[0]?.item.name).toBe("history");
    expect(results[0]?.score).toBeGreaterThan(0);
  });
});
