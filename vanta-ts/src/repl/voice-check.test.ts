import { describe, it, expect } from "vitest";
import {
  detectSycophancy,
  hasOpeningFlattery,
  isSycophantic,
  buildVoiceCheckText,
} from "./voice-check.js";

describe("hasOpeningFlattery", () => {
  it("flags a turn that opens with praise instead of the answer", () => {
    expect(hasOpeningFlattery("Great question! The answer is 42.")).toBe(true);
    expect(hasOpeningFlattery("That's a brilliant idea. Let's do it.")).toBe(true);
    expect(hasOpeningFlattery("You're absolutely right, the bug is in line 10.")).toBe(true);
  });

  it("passes a turn that leads with the answer", () => {
    expect(hasOpeningFlattery("The answer is 42 — here's why.")).toBe(false);
    // A superlative mid-text isn't an *opening* — opener check is positional.
    expect(hasOpeningFlattery("The build fails because the import path is wrong; great catch on the symptom though.")).toBe(false);
  });
});

describe("detectSycophancy", () => {
  it("flags opening flattery", () => {
    const hits = detectSycophancy("Excellent question! Vanta gates every tool call.");
    expect(hits.some((h) => h.kind === "opening-flattery")).toBe(true);
  });

  it("flags an unqualified superlative verdict on the user's work", () => {
    const hits = detectSycophancy("Your plan is perfect. Ship it.");
    expect(hits.some((h) => h.kind === "unqualified-superlative")).toBe(true);
  });

  it("flags empty agreement", () => {
    const hits = detectSycophancy("You're absolutely right. I'll change it.");
    // Both empty-agreement and opening-flattery can match this opener; the
    // empty-agreement axis must be present.
    expect(hits.some((h) => h.kind === "empty-agreement")).toBe(true);
  });

  it("returns at most one hit per kind", () => {
    const hits = detectSycophancy(
      "Great idea! You're absolutely right, you're so right, what a brilliant point.",
    );
    const kinds = hits.map((h) => h.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("passes calibrated praise that cites a concrete reason", () => {
    const text =
      "This works because the kernel assess() runs before dispatch, so the gate can't be bypassed. The error handling is solid.";
    expect(detectSycophancy(text)).toEqual([]);
  });

  it("passes a critical / push-back response", () => {
    const text =
      "This won't scale: the N+1 query in the loop will dominate at 10k rows. Move the lookup out of the loop first.";
    expect(detectSycophancy(text)).toEqual([]);
  });

  it("passes a plain factual answer with no praise", () => {
    expect(detectSycophancy("The kernel listens on port 7788. Restart it with cargo run.")).toEqual([]);
  });
});

describe("isSycophantic", () => {
  it("is true for over-validating text and false for calibrated text", () => {
    expect(isSycophantic("Brilliant! You're absolutely right.")).toBe(true);
    expect(isSycophantic("The test fails because the mock returns undefined.")).toBe(false);
  });
});

describe("buildVoiceCheckText", () => {
  it("returns null when there are no hits", () => {
    expect(buildVoiceCheckText([])).toBeNull();
  });

  it("formats each hit as a warning line with kind, phrase, and reason", () => {
    const note = buildVoiceCheckText(detectSycophancy("Great question! Your plan is perfect."));
    expect(note).toContain("⚠ voice [");
    expect(note).toContain("opening-flattery");
    expect(note).toContain("unqualified-superlative");
  });

  it("end-to-end: flags sycophantic text, stays silent on critical text", () => {
    expect(buildVoiceCheckText(detectSycophancy("Amazing idea, you nailed it!"))).not.toBeNull();
    expect(
      buildVoiceCheckText(detectSycophancy("Half-baked — the auth check is missing on the write path. Add it before this lands.")),
    ).toBeNull();
  });
});
