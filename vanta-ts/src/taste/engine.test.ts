import { describe, it, expect } from "vitest";
import { scoreTasteAlignment, compareDesigns, POSITIVE_TAGS, AVOID_TAGS } from "./engine.js";
import type { Asset } from "./asset-index.js";

const SAMPLE_ASSETS: Asset[] = [
  { id: "a1", type: "url", source: "https://ref.com", title: "Control Room", tags: ["operator-dossier", "signal-panel"], ingestedAt: "2024-01-01" },
];

describe("scoreTasteAlignment", () => {
  it("returns avoid for too-generic description", () => {
    const v = scoreTasteAlignment("generic saas too-generic dashboard", SAMPLE_ASSETS);
    expect(v.recommendation).toBe("avoid");
  });

  it("returns borderline for unknown description", () => {
    const v = scoreTasteAlignment("some random design", SAMPLE_ASSETS);
    expect(v.recommendation).toBe("borderline");
  });

  it("returns fits for operator-dossier + signal-panel", () => {
    const v = scoreTasteAlignment("operator-dossier signal-panel layout", SAMPLE_ASSETS);
    expect(v.recommendation).toBe("fits");
  });
});

describe("compareDesigns", () => {
  it("picks the better-fitting option", () => {
    const result = compareDesigns(
      "operator-dossier signal-panel dark control room",
      "too-generic colorful saas",
      SAMPLE_ASSETS,
    );
    expect(result.winner).toBe("A");
  });

  it("returns tie when both are borderline", () => {
    const result = compareDesigns("some design", "another design", SAMPLE_ASSETS);
    expect(result.winner).toBe("tie");
  });
});

describe("taste vocabulary", () => {
  it("positive tags include operator-dossier", () => {
    expect(POSITIVE_TAGS).toContain("operator-dossier");
  });

  it("avoid tags include too-generic and too-mascot", () => {
    expect(AVOID_TAGS).toContain("too-generic");
    expect(AVOID_TAGS).toContain("too-mascot");
  });
});
