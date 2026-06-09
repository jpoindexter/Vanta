import { describe, it, expect } from "vitest";
import { childId, buildProposal, formatProposal } from "./decompose.js";
import type { RoadmapItem } from "./schema.js";

const SAMPLE_CARD: RoadmapItem = {
  id: "TEST-FEAT",
  title: "Test feature",
  summary: "Build a widget that does X.",
  done: "Widget renders. Widget accepts input. Widget saves state. Widget shows errors.",
  status: "next",
  track: "Core UX",
  size: "M",
  tier: "pebble",
  model: "sonnet",
  effort: "medium",
};

describe("childId", () => {
  it("generates ids with slice suffix", () => {
    expect(childId("FEAT", 1)).toBe("FEAT-S1");
    expect(childId("FEAT", 3)).toBe("FEAT-S3");
  });
});

describe("buildProposal", () => {
  it("produces children from done criteria", () => {
    const p = buildProposal(SAMPLE_CARD);
    expect(p.parent.id).toBe("TEST-FEAT");
    expect(p.children.length).toBeGreaterThan(1);
    for (const c of p.children) {
      expect(c.id).toContain("TEST-FEAT-S");
      expect(c.status).toBe("next");
      expect(c.size).toBe("S");
      expect(c.track).toBe(SAMPLE_CARD.track);
    }
  });

  it("caps at 8 children", () => {
    const manyDone = Array.from({ length: 20 }, (_, i) => `criteria ${i + 1}`).join(". ");
    const card = { ...SAMPLE_CARD, done: manyDone };
    const p = buildProposal(card);
    expect(p.children.length).toBeLessThanOrEqual(8);
  });

  it("handles a card with a very short done criteria", () => {
    const card = { ...SAMPLE_CARD, done: "It ships.", summary: "Short description." };
    const p = buildProposal(card);
    expect(p.children.length).toBeGreaterThanOrEqual(1);
  });
});

describe("formatProposal", () => {
  it("includes parent id and child ids", () => {
    const p = buildProposal(SAMPLE_CARD);
    const output = formatProposal(p);
    expect(output).toContain("TEST-FEAT");
    expect(output).toContain("TEST-FEAT-S1");
  });
});
