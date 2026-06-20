import { describe, it, expect } from "vitest";
import {
  scoreClarity,
  shouldClarify,
  resolveClarityThreshold,
  buildClarityNote,
  DEFAULT_CLARITY_THRESHOLD,
} from "./clarity-gate.js";

describe("scoreClarity", () => {
  it("scores a vague one-liner low", () => {
    // Arrange
    const instruction = "fix the thing somehow";
    // Act
    const score = scoreClarity(instruction);
    // Assert
    expect(score).toBeLessThan(DEFAULT_CLARITY_THRESHOLD);
  });

  it("scores a specific, anchored instruction high", () => {
    // Arrange
    const instruction = "add a zod schema to src/tools/clarify.ts that validates the question field";
    // Act
    const score = scoreClarity(instruction);
    // Assert
    expect(score).toBeGreaterThanOrEqual(DEFAULT_CLARITY_THRESHOLD);
  });

  it("returns 0 for an empty instruction", () => {
    expect(scoreClarity("")).toBe(0);
    expect(scoreClarity("   ")).toBe(0);
  });

  it("returns 0 for a bare gesture with no object", () => {
    expect(scoreClarity("do it")).toBe(0);
    expect(scoreClarity("make it work")).toBe(0);
  });

  it("treats a too-short directive as clear (nothing to clarify against)", () => {
    expect(scoreClarity("run tests")).toBe(1);
    expect(scoreClarity("ls")).toBe(1);
  });

  it("clamps the score into the 0..1 range", () => {
    const score = scoreClarity("add and implement and build the parser in src/parse.ts using the camelCase config 123");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("penalizes vagueness even when an action verb is present", () => {
    // Arrange — an action verb but a hedged object.
    const vague = scoreClarity("fix something with the build somehow");
    const specific = scoreClarity("fix the build error in src/index.ts line 42");
    // Assert — the hedged one scores strictly lower.
    expect(vague).toBeLessThan(specific);
  });

  it("rewards concrete anchors (filename, identifier, number)", () => {
    const bare = scoreClarity("update the handler to be better and cleaner overall");
    const anchored = scoreClarity("update the handleSubmit function in src/form.ts to debounce 300ms");
    expect(anchored).toBeGreaterThan(bare);
  });
});

describe("shouldClarify", () => {
  it("is true when the score is below the threshold (very ambiguous)", () => {
    expect(shouldClarify(0.1, DEFAULT_CLARITY_THRESHOLD)).toBe(true);
  });

  it("is false when the score is at or above the threshold (clear enough)", () => {
    expect(shouldClarify(DEFAULT_CLARITY_THRESHOLD, DEFAULT_CLARITY_THRESHOLD)).toBe(false);
    expect(shouldClarify(0.9, DEFAULT_CLARITY_THRESHOLD)).toBe(false);
  });

  it("is disabled when the threshold is 0", () => {
    expect(shouldClarify(0, 0)).toBe(false);
    expect(shouldClarify(0.01, 0)).toBe(false);
  });

  it("respects a custom threshold", () => {
    // A score of 0.5 trips a strict 0.6 gate but passes the conservative default.
    expect(shouldClarify(0.5, 0.6)).toBe(true);
    expect(shouldClarify(0.5, DEFAULT_CLARITY_THRESHOLD)).toBe(false);
  });
});

describe("resolveClarityThreshold", () => {
  it("falls back to the conservative default when unset", () => {
    expect(resolveClarityThreshold({})).toBe(DEFAULT_CLARITY_THRESHOLD);
  });

  it("falls back to the default for a non-numeric value", () => {
    expect(resolveClarityThreshold({ VANTA_CLARITY_THRESHOLD: "abc" })).toBe(DEFAULT_CLARITY_THRESHOLD);
  });

  it("falls back to the default for a negative value", () => {
    expect(resolveClarityThreshold({ VANTA_CLARITY_THRESHOLD: "-1" })).toBe(DEFAULT_CLARITY_THRESHOLD);
  });

  it("reads a valid override from the environment", () => {
    expect(resolveClarityThreshold({ VANTA_CLARITY_THRESHOLD: "0.6" })).toBe(0.6);
  });

  it("reads 0 as an explicit disable", () => {
    expect(resolveClarityThreshold({ VANTA_CLARITY_THRESHOLD: "0" })).toBe(0);
  });
});

describe("buildClarityNote", () => {
  it("renders a one-line clarify suggestion with the clarity percentage", () => {
    // Arrange / Act
    const note = buildClarityNote("fix the thing somehow");
    // Assert
    expect(note).toContain("clarity");
    expect(note).toContain("%");
    expect(note).toContain("clarify");
    expect(note.split("\n")).toHaveLength(1);
  });

  it("does not hard-block — the wording suggests, it does not halt", () => {
    const note = buildClarityNote("do it");
    expect(note.toLowerCase()).not.toContain("blocked");
    expect(note.toLowerCase()).not.toContain("abort");
  });
});

describe("default threshold is conservative", () => {
  it("only trips on genuinely-ambiguous instructions, not ordinary tasks", () => {
    // Arrange — a spread of ordinary, reasonably-specified instructions.
    const ordinary = [
      "add a test for the parser",
      "update the readme with the new command",
      "rename getUser to fetchUser across the file",
      "show me the git diff",
      "implement the clarity gate scorer",
    ];
    // Act / Assert — none of these trip the gate at the default threshold.
    for (const instruction of ordinary) {
      const score = scoreClarity(instruction);
      expect(shouldClarify(score, DEFAULT_CLARITY_THRESHOLD), instruction).toBe(false);
    }
  });

  it("trips on the genuinely-ambiguous ones", () => {
    const ambiguous = ["fix the thing somehow", "do it", "make it better", "handle this stuff"];
    for (const instruction of ambiguous) {
      const score = scoreClarity(instruction);
      expect(shouldClarify(score, DEFAULT_CLARITY_THRESHOLD), instruction).toBe(true);
    }
  });
});
