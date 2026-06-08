import { describe, it, expect } from "vitest";
import { detectSlop, formatSlopNote } from "./anti-slop.js";

describe("detectSlop", () => {
  it("returns empty for clean text", () => {
    expect(detectSlop("The function returns a string. Here is how it works.")).toEqual([]);
  });

  it("detects sycophancy", () => {
    const hits = detectSlop("Great question! Let me explain this.");
    expect(hits.some((h) => h.kind === "sycophancy")).toBe(true);
  });

  it("detects AI-magic phrasing", () => {
    const hits = detectSlop("As an AI language model, I can help with that.");
    expect(hits.some((h) => h.kind === "ai-magic")).toBe(true);
  });

  it("detects corporate buzzwords", () => {
    const hits = detectSlop("We should leverage our synergies here.");
    expect(hits.some((h) => h.kind === "corporate")).toBe(true);
  });

  it("detects empty filler", () => {
    const hits = detectSlop("That said, the answer is 42.");
    expect(hits.some((h) => h.kind === "empty-filler")).toBe(true);
  });

  it("detects fake closing", () => {
    const hits = detectSlop("Hope that helps! Let me know if you have questions.");
    expect(hits.some((h) => h.kind === "fake-closing")).toBe(true);
  });

  it("detects overcautious phrasing", () => {
    const hits = detectSlop("Please note that this is experimental.");
    expect(hits.some((h) => h.kind === "overcautious")).toBe(true);
  });

  it("reports at most one hit per kind", () => {
    const hits = detectSlop("Great question! Great question again!");
    const sycophancy = hits.filter((h) => h.kind === "sycophancy");
    expect(sycophancy.length).toBe(1);
  });

  it("detects multiple kinds in one text", () => {
    const hits = detectSlop("Great question! That said, I hope this helps.");
    const kinds = new Set(hits.map((h) => h.kind));
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe("formatSlopNote", () => {
  it("returns null for no hits", () => {
    expect(formatSlopNote([])).toBeNull();
  });

  it("formats a single hit", () => {
    const hits = detectSlop("Great question! Let me help.");
    const note = formatSlopNote(hits);
    expect(note).toContain("slop");
    expect(note).toContain("sycophancy");
  });

  it("formats multiple hits on separate lines", () => {
    const hits = detectSlop("Great question! As an AI, I hope this helps.");
    const note = formatSlopNote(hits);
    expect(note?.split("\n").length).toBeGreaterThan(1);
  });
});
