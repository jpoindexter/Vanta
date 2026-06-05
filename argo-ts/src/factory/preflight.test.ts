import { describe, it, expect } from "vitest";
import { scoreAmbiguity, shouldClarify, buildPrefightNote } from "./preflight.js";
import type { WorkItem } from "./types.js";

const item = (description: string, extra: Partial<WorkItem> = {}): WorkItem => ({
  category: "roadmap",
  description,
  ...extra,
});

describe("scoreAmbiguity", () => {
  it("scores a very short description highly ambiguous", () => {
    expect(scoreAmbiguity(item("fix"))).toBeGreaterThan(0.7);
  });

  it("scores a TODO item as ambiguous", () => {
    expect(scoreAmbiguity(item("TODO: figure something out"))).toBeGreaterThan(0.5);
  });

  it("scores a descriptive item as clear", () => {
    const desc = "Fix the failing vitest snapshot in src/tui/app.test.tsx line 42";
    expect(scoreAmbiguity(item(desc, { targetFile: "src/tui/app.test.tsx" }))).toBeLessThan(0.5);
  });
});

describe("shouldClarify", () => {
  it("returns true for vague items at default threshold", () => {
    expect(shouldClarify(item("do stuff"))).toBe(true);
  });

  it("returns false for clear items", () => {
    const desc = "Implement parseRoadmapItem to extract bold IDs from ROADMAP.md checkboxes";
    expect(shouldClarify(item(desc, { targetFile: "factory/triage.ts" }))).toBe(false);
  });

  it("disabled when threshold is 0", () => {
    expect(shouldClarify(item("x"), { ARGO_PREFLIGHT_THRESHOLD: "0" })).toBe(false);
  });
});

describe("buildPrefightNote", () => {
  it("mentions the ambiguity score", () => {
    const note = buildPrefightNote(item("do stuff"));
    expect(note).toContain("ambiguity=");
    expect(note).toContain("preflight");
  });
});
