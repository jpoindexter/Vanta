import { describe, it, expect } from "vitest";
import { pruneAnalysis, formatPruneReport } from "./prune.js";
import type { RoadmapItem } from "./schema.js";

function makeItem(overrides: Partial<RoadmapItem> = {}): RoadmapItem {
  return {
    id: "TEST-1",
    track: "Core",
    title: "A well-specified feature card",
    status: "next",
    size: "S",
    summary: "A thorough and specific summary of the feature.",
    done: "Done when the feature works end-to-end.",
    tier: "pebble",
    ...overrides,
  };
}

describe("pruneAnalysis", () => {
  it("returns no candidates for a clean, well-specified item", () => {
    const items: RoadmapItem[] = [makeItem()];
    const result = pruneAnalysis(items);
    expect(result).toHaveLength(0);
  });

  it("flags next+sand items with a short summary as thin spec", () => {
    const items: RoadmapItem[] = [
      makeItem({ id: "THIN-1", tier: "sand", summary: "short" }),
    ];
    const result = pruneAnalysis(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("THIN-1");
    expect(result[0]?.confidence).toBe("medium");
    expect(result[0]?.reason).toContain("thin spec");
  });

  it("flags next+sand with empty summary as thin spec", () => {
    const items: RoadmapItem[] = [
      makeItem({ id: "THIN-2", tier: "sand", summary: "" }),
    ];
    const result = pruneAnalysis(items);
    expect(result[0]?.confidence).toBe("medium");
  });

  it("does not flag next+pebble with short summary (only sand)", () => {
    const items: RoadmapItem[] = [
      makeItem({ id: "PEBBLE-1", tier: "pebble", summary: "short" }),
    ];
    const result = pruneAnalysis(items);
    expect(result).toHaveLength(0);
  });

  it("flags next items with TBD in title as placeholder (high confidence)", () => {
    const items: RoadmapItem[] = [
      makeItem({ id: "TBD-1", title: "TBD feature for later" }),
    ];
    const result = pruneAnalysis(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("TBD-1");
    expect(result[0]?.confidence).toBe("high");
    expect(result[0]?.reason).toBe("placeholder card");
  });

  it("flags next items with TODO in title as placeholder", () => {
    const items: RoadmapItem[] = [
      makeItem({ id: "TODO-1", title: "TODO: implement the widget" }),
    ];
    const result = pruneAnalysis(items);
    expect(result[0]?.confidence).toBe("high");
  });

  it("flags next items with placeholder in title as placeholder", () => {
    const items: RoadmapItem[] = [
      makeItem({ id: "PH-1", title: "Placeholder for future auth work" }),
    ];
    const result = pruneAnalysis(items);
    expect(result[0]?.confidence).toBe("high");
  });

  it("does NOT flag 'Live todo / progress checklist' (todo as common noun)", () => {
    const items: RoadmapItem[] = [
      makeItem({
        id: "VANTA-TODO",
        title: "Live todo / progress checklist (TodoWrite pattern)",
      }),
    ];
    const result = pruneAnalysis(items);
    expect(result).toHaveLength(0);
  });

  it("flags horizon L items with low confidence", () => {
    const items: RoadmapItem[] = [
      makeItem({ id: "DESK-1", status: "horizon", size: "L", tier: undefined }),
    ];
    const result = pruneAnalysis(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("DESK-1");
    expect(result[0]?.confidence).toBe("low");
    expect(result[0]?.reason).toContain("aspirational");
  });

  it("does not flag horizon S items", () => {
    const items: RoadmapItem[] = [
      makeItem({ id: "HOR-S", status: "horizon", size: "S", tier: undefined }),
    ];
    expect(pruneAnalysis(items)).toHaveLength(0);
  });

  it("flags the first of two next items with matching title prefix as possible duplicate", () => {
    const items: RoadmapItem[] = [
      makeItem({ id: "DUP-1", title: "Implement search for all results" }),
      makeItem({ id: "DUP-2", title: "Implement search for all results" }),
    ];
    const result = pruneAnalysis(items);
    const dupCandidate = result.find((c) => c.reason.includes("duplicate"));
    expect(dupCandidate).toBeDefined();
    expect(dupCandidate?.id).toBe("DUP-1");
    expect(dupCandidate?.reason).toContain("DUP-2");
    expect(dupCandidate?.confidence).toBe("medium");
  });

  it("sorts results by confidence descending (high before medium before low)", () => {
    const items: RoadmapItem[] = [
      makeItem({ id: "HOR-L", status: "horizon", size: "L", tier: undefined }), // low
      makeItem({
        id: "THIN-S",
        tier: "sand",
        summary: "too short",
      }), // medium
      makeItem({ id: "PH-2", title: "TBD — figure out later" }), // high
    ];
    const result = pruneAnalysis(items);
    expect(result[0]?.confidence).toBe("high");
    expect(result[1]?.confidence).toBe("medium");
    expect(result[2]?.confidence).toBe("low");
  });

  it("does not flag shipped items", () => {
    const items: RoadmapItem[] = [
      makeItem({ id: "SHIP-1", status: "shipped", tier: "sand", summary: "x" }),
    ];
    expect(pruneAnalysis(items)).toHaveLength(0);
  });
});

describe("formatPruneReport", () => {
  it("returns 'nothing to prune' for empty candidates", () => {
    expect(formatPruneReport([])).toBe("nothing to prune");
  });

  it("includes count in header for one candidate", () => {
    const candidates = [
      { id: "X-1", title: "X", reason: "thin spec", confidence: "medium" as const },
    ];
    const report = formatPruneReport(candidates);
    expect(report).toContain("1 candidate for pruning");
    expect(report).toContain("[medium] X-1");
  });

  it("uses plural for multiple candidates", () => {
    const candidates = [
      { id: "A", title: "A", reason: "reason 1", confidence: "high" as const },
      { id: "B", title: "B", reason: "reason 2", confidence: "low" as const },
    ];
    const report = formatPruneReport(candidates);
    expect(report).toContain("2 candidates for pruning");
    expect(report).toContain("[high] A — reason 1");
    expect(report).toContain("[low] B — reason 2");
  });
});
