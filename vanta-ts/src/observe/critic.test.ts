import { describe, expect, it } from "vitest";
import { formatCriticNote } from "./critic.js";
import type { CriticScore } from "./critic.js";

describe("formatCriticNote", () => {
  it("renders a score bar + summary", () => {
    const score: CriticScore = { score: 8, issues: [], summary: "good turn, goal-focused" };
    const note = formatCriticNote(score);
    expect(note).toContain("8/10");
    expect(note).toContain("good turn");
    expect(note).toContain("█");
  });

  it("includes issues when score is low", () => {
    const score: CriticScore = { score: 3, issues: ["hallucinated result", "no verification"], summary: "poor" };
    const note = formatCriticNote(score);
    expect(note).toContain("hallucinated result");
    expect(note).toContain("no verification");
  });

  it("omits issues line when score is high and issues is empty", () => {
    const score: CriticScore = { score: 9, issues: [], summary: "excellent" };
    expect(formatCriticNote(score)).not.toContain("Issues:");
  });
});
