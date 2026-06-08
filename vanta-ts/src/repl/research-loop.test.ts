import { describe, it, expect } from "vitest";
import {
  buildResearchPrompt,
  buildResearchSummaryPrompt,
  estimateResearchCost,
} from "./research-loop.js";

describe("buildResearchPrompt", () => {
  it("contains the question", () => {
    const prompt = buildResearchPrompt({
      question: "What is the best search algorithm?",
      uncertainties: [],
    });
    expect(prompt).toContain("What is the best search algorithm?");
  });

  it("contains each uncertainty", () => {
    const prompt = buildResearchPrompt({
      question: "How does X work?",
      uncertainties: ["Is it O(log n)?", "Does it handle edge cases?"],
    });
    expect(prompt).toContain("Is it O(log n)?");
    expect(prompt).toContain("Does it handle edge cases?");
  });

  it("caps items exceeding 200 chars", () => {
    const long = "a".repeat(250);
    const prompt = buildResearchPrompt({
      question: "Q",
      uncertainties: [long],
    });
    // The item should be truncated (not contain the full 250-char string).
    expect(prompt).not.toContain(long);
    expect(prompt).toContain("a".repeat(199) + "…");
  });

  it("includes sources when provided", () => {
    const prompt = buildResearchPrompt({
      question: "Q",
      uncertainties: [],
      sources: ["https://example.com"],
    });
    expect(prompt).toContain("https://example.com");
  });

  it("omits the sources block when sources is absent", () => {
    const prompt = buildResearchPrompt({ question: "Q", uncertainties: [] });
    expect(prompt).not.toContain("starting sources");
  });
});

describe("buildResearchSummaryPrompt", () => {
  it("contains the question", () => {
    const prompt = buildResearchSummaryPrompt("What is X?", "Some findings.");
    expect(prompt).toContain("What is X?");
  });

  it("contains 'uncertain'", () => {
    const prompt = buildResearchSummaryPrompt("Q", "F");
    expect(prompt).toContain("uncertain");
  });

  it("includes the findings text", () => {
    const prompt = buildResearchSummaryPrompt("Q", "Key finding: Y is true.");
    expect(prompt).toContain("Key finding: Y is true.");
  });
});

describe("estimateResearchCost", () => {
  it("returns correct range for 5 sources", () => {
    expect(estimateResearchCost(5)).toEqual({ minTurns: 5, maxTurns: 15 });
  });

  it("returns zeros for 0 sources", () => {
    expect(estimateResearchCost(0)).toEqual({ minTurns: 0, maxTurns: 0 });
  });

  it("returns correct range for 1 source", () => {
    expect(estimateResearchCost(1)).toEqual({ minTurns: 1, maxTurns: 3 });
  });
});
