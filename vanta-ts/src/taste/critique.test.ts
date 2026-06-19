import { describe, it, expect } from "vitest";
import {
  critiqueArtifact, brandViolations, formatCritique, formatDelta, axisOutOfFive,
} from "./critique.js";
import { defaultModel } from "./critique-store.js";

const M = defaultModel();

function score(content: string, kind: "text" | "markdown" | "html" = "text") {
  return critiqueArtifact({ content, kind }, M.weights, M.brand);
}

describe("taste critique core", () => {
  it("scores all five axes in 0..1 and an aggregate", () => {
    const r = score("Run `vanta doctor` to check health. It prints 3 results in under 1 second.");
    for (const v of Object.values(r.scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(r.overall).toBeGreaterThanOrEqual(0);
    expect(r.overall).toBeLessThanOrEqual(1);
  });

  it("penalizes a blue-to-purple gradient (brand-avoid)", () => {
    const v = brandViolations("background: linear-gradient(90deg, blue, purple);", M.brand);
    expect(v.join(" ")).toContain("blue-to-purple gradients");
    const r = score("<div style='background: linear-gradient(blue, purple)'>Hi</div>", "html");
    expect(r.scores.beauty).toBeLessThan(0.75);
    expect(r.notes.some((n) => n.includes("gradient"))).toBe(true);
  });

  it("flags lorem-ipsum filler as low usefulness", () => {
    const r = score("Lorem ipsum dolor sit amet, consectetur adipiscing elit.");
    expect(r.scores.usefulness).toBeLessThan(0.5);
    expect(r.notes.some((n) => n.includes("filler"))).toBe(true);
  });

  it("penalizes hype words on credibility", () => {
    const clean = score("This tool indexes your code and answers structural questions.");
    const hype = score("A revolutionary, world-class, game-changer that will supercharge synergy.");
    expect(hype.scores.credibility).toBeLessThan(clean.scores.credibility);
  });

  it("rewards a clear next step on actionability", () => {
    const withStep = score("Step 1. Install the CLI. Then run it.");
    const without = score("It is a thing that exists somewhere in the system.");
    expect(withStep.scores.actionability).toBeGreaterThan(without.scores.actionability);
  });

  it("scores an empty artifact at zero clarity", () => {
    const r = score("");
    expect(r.scores.clarity).toBe(0);
  });

  it("formats a critique block with all axes and notes", () => {
    const r = score("Open the file and run the tests. 5 pass.");
    const out = formatCritique("demo.md", r);
    expect(out).toContain("Taste critique — demo.md");
    expect(out).toContain("clarity");
    expect(out).toContain("Overall:");
  });

  it("computes a per-axis before/after delta", () => {
    const before = score("lorem ipsum revolutionary synergy");
    const after = score("Run `vanta doctor`. It checks 3 things in 1s. Step 1: build.");
    const delta = formatDelta(before, after);
    expect(delta).toContain("Overall delta:");
    expect(axisOutOfFive(after.overall)).toBeGreaterThan(axisOutOfFive(before.overall));
  });

  it("reports a clean artifact with no violations", () => {
    const r = score("Vanta gates every tool through the kernel. Run it to see 53 tests pass.");
    expect(r.notes.some((n) => n.includes("no taste violations"))).toBe(true);
  });
});
