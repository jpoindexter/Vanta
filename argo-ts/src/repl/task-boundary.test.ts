import { describe, it, expect } from "vitest";
import {
  extractKeywords,
  topicOverlap,
  isTopicShift,
  buildTopicShiftNote,
  buildBoundaryConfirmation,
  BOUNDARY_MARKER,
} from "./task-boundary.js";
import type { Goal } from "../types.js";

describe("extractKeywords", () => {
  it("lowercases and removes stopwords and short words", () => {
    const kw = extractKeywords("Add authentication to the login form");
    expect(kw.has("to")).toBe(false); // stopword
    expect(kw.has("the")).toBe(false); // stopword
    expect(kw.has("authentication")).toBe(true);
    expect(kw.has("login")).toBe(true);
    expect(kw.has("form")).toBe(true);
  });

  it("returns an empty set for a stopword-only string", () => {
    expect(extractKeywords("I am the").size).toBe(0);
  });
});

describe("topicOverlap", () => {
  it("returns 1.0 for identical strings", () => {
    expect(topicOverlap("refactor auth module", "refactor auth module")).toBe(1);
  });

  it("returns 0 when there is no word overlap", () => {
    expect(topicOverlap("fix the login form", "deploy the roadmap board")).toBe(0);
  });

  it("returns partial overlap for related strings", () => {
    const score = topicOverlap("auth login form", "auth register form");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("returns 1 when both strings are empty", () => {
    expect(topicOverlap("", "")).toBe(1);
  });
});

describe("isTopicShift", () => {
  const goal: Goal = { id: 1, text: "Refactor the auth module for the new security audit", status: "active" };

  it("returns false when message overlaps with the active goal", () => {
    expect(isTopicShift("Let us refactor the auth security module", goal, 0.15)).toBe(false);
  });

  it("returns true when message is about a completely different topic", () => {
    expect(isTopicShift("Can you help me write a grocery shopping list for the week", goal, 0.15)).toBe(true);
  });

  it("returns false when message starts with a slash command", () => {
    expect(isTopicShift("/status", goal, 0.15)).toBe(false);
  });

  it("returns false when message is too short to judge", () => {
    expect(isTopicShift("help", goal, 0.15)).toBe(false);
  });

  it("returns false when no active goal", () => {
    expect(isTopicShift("completely different topic here please", null, 0.15)).toBe(false);
  });
});

describe("buildTopicShiftNote", () => {
  it("mentions /boundary", () => {
    expect(buildTopicShiftNote()).toContain("/boundary");
  });
});

describe("buildBoundaryConfirmation", () => {
  it("includes the previous goal when provided", () => {
    const text = buildBoundaryConfirmation("Ship Argo v1");
    expect(text).toContain("Ship Argo v1");
    expect(text).toContain("boundary marked");
  });
  it("works without a previous goal", () => {
    const text = buildBoundaryConfirmation(null);
    expect(text).toContain("boundary marked");
  });
});

describe("BOUNDARY_MARKER", () => {
  it("is a non-empty string", () => {
    expect(typeof BOUNDARY_MARKER).toBe("string");
    expect(BOUNDARY_MARKER.length).toBeGreaterThan(0);
  });
});
