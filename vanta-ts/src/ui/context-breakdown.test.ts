import { describe, it, expect } from "vitest";
import { contextBreakdown } from "./context-breakdown.js";
import type { CtxCategory } from "./context-breakdown.js";

const msgs = [
  { role: "system",    content: "A".repeat(400) },  // 400 chars → 100 tok
  { role: "user",      content: "B".repeat(200) },  // 200 chars → 50 tok
  { role: "assistant", content: "C".repeat(600) },  // 600 chars → 150 tok
  { role: "user",      content: "D".repeat(100) },  // 100 chars → 25 tok
  { role: "assistant", content: "E".repeat(100) },  // 100 chars → 25 tok
  { role: "tool",      content: "F".repeat(80)  },  // 80  chars → 20 tok
];

describe("contextBreakdown — buckets + ordering", () => {
  it("returns one category per active role, sorted by tokens desc", () => {
    const cats = contextBreakdown(msgs);
    const labels = cats.map((c) => c.label);
    // Should include all four active roles; no Tools bucket without toolChars
    expect(labels).toContain("Assistant");
    expect(labels).toContain("System prompt");
    expect(labels).toContain("User");
    expect(labels).toContain("Tool results");
    // Sorted descending
    for (let i = 0; i < cats.length - 1; i++) {
      expect(cats[i]!.tokens).toBeGreaterThanOrEqual(cats[i + 1]!.tokens);
    }
  });

  it("tokens ≈ ceil(chars / 4)", () => {
    const cats = contextBreakdown(msgs);
    const byLabel = Object.fromEntries(cats.map((c) => [c.label, c])) as Record<string, CtxCategory>;
    // System: 400 chars → ceil(400/4) = 100
    expect(byLabel["System prompt"]?.tokens).toBe(100);
    // User: 200+100 = 300 chars → ceil(300/4) = 75
    expect(byLabel["User"]?.tokens).toBe(75);
    // Assistant: 600+100 = 700 chars → ceil(700/4) = 175
    expect(byLabel["Assistant"]?.tokens).toBe(175);
    // Tool results: 80 chars → ceil(80/4) = 20
    expect(byLabel["Tool results"]?.tokens).toBe(20);
  });

  it("drops zero-token categories", () => {
    const cats = contextBreakdown([{ role: "user", content: "hi" }]);
    const labels = cats.map((c) => c.label);
    expect(labels).not.toContain("System prompt");
    expect(labels).not.toContain("Assistant");
    expect(labels).not.toContain("Tool results");
  });

  it("adds a Tools bucket when toolChars is given", () => {
    const cats = contextBreakdown(msgs, 800); // 800 chars → ceil(800/4) = 200 tok
    const toolsBucket = cats.find((c) => c.label === "Tools");
    expect(toolsBucket).toBeDefined();
    expect(toolsBucket?.tokens).toBe(200);
  });

  it("does not add a Tools bucket when toolChars is 0", () => {
    const cats = contextBreakdown(msgs, 0);
    expect(cats.find((c) => c.label === "Tools")).toBeUndefined();
  });

  it("treats 'function' role the same as 'tool'", () => {
    const cats = contextBreakdown([{ role: "function", content: "X".repeat(40) }]);
    const bucket = cats.find((c) => c.label === "Tool results");
    expect(bucket?.tokens).toBe(Math.ceil(40 / 4));
  });

  it("handles missing content gracefully (counts as 0 chars)", () => {
    expect(() => contextBreakdown([{ role: "user" }])).not.toThrow();
    const cats = contextBreakdown([{ role: "user" }]);
    // No user content → user bucket should be absent
    expect(cats.find((c) => c.label === "User")).toBeUndefined();
  });
});
