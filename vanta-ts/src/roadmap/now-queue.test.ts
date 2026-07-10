import { describe, it, expect } from "vitest";
import { selectNowCandidates, formatNowEmptyState, formatNowQueue } from "./now-queue.js";
import type { RoadmapItem } from "./schema.js";

const mk = (
  id: string,
  status: RoadmapItem["status"],
  tier?: RoadmapItem["tier"],
  size = "M",
): RoadmapItem => ({
  id,
  title: `Title ${id}`,
  track: "Backlog",
  status,
  size,
  summary: "",
  done: "",
  tier,
});

describe("selectNowCandidates", () => {
  it("returns [] for empty items", () => {
    expect(selectNowCandidates([])).toEqual([]);
  });

  it("returns [] when building count already equals wipLimit", () => {
    const items = [mk("A", "building"), mk("B", "building"), mk("C", "next", "rock")];
    expect(selectNowCandidates(items, 2)).toEqual([]);
  });

  it("returns [] when no next items exist", () => {
    const items = [mk("A", "shipped"), mk("B", "horizon")];
    expect(selectNowCandidates(items, 2)).toEqual([]);
  });

  it("orders by tier: rock before sand", () => {
    const items = [mk("A", "next", "sand"), mk("B", "next", "rock")];
    const result = selectNowCandidates(items, 2);
    expect(result[0]?.id).toBe("B");
    expect(result[1]?.id).toBe("A");
  });

  it("orders by tier: rock before pebble before sand", () => {
    const items = [mk("A", "next", "sand"), mk("B", "next", "pebble"), mk("C", "next", "rock")];
    const result = selectNowCandidates(items, 3);
    expect(result.map((r) => r.id)).toEqual(["C", "B", "A"]);
  });

  it("orders by size within the same tier: S before M before L", () => {
    const items = [
      mk("A", "next", "rock", "L"),
      mk("B", "next", "rock", "S"),
      mk("C", "next", "rock", "M"),
    ];
    const result = selectNowCandidates(items, 3);
    expect(result.map((r) => r.id)).toEqual(["B", "C", "A"]);
  });

  it("uses id alphabetical as tiebreaker within same tier/size", () => {
    const items = [mk("C", "next", "pebble", "S"), mk("A", "next", "pebble", "S"), mk("B", "next", "pebble", "S")];
    const result = selectNowCandidates(items, 3);
    expect(result.map((r) => r.id)).toEqual(["A", "B", "C"]);
  });

  it("returns at most wipLimit candidates (default 2)", () => {
    const items = [mk("A", "next", "rock"), mk("B", "next", "rock"), mk("C", "next", "rock")];
    expect(selectNowCandidates(items)).toHaveLength(2);
  });

  it("respects remaining capacity (1 building + wipLimit 2 → 1 candidate)", () => {
    const items = [mk("A", "building"), mk("B", "next", "rock"), mk("C", "next", "sand")];
    const result = selectNowCandidates(items, 2);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("B");
  });

  it("items with undefined tier sort after items with a tier", () => {
    const items = [mk("A", "next", undefined, "S"), mk("B", "next", "rock", "S")];
    const result = selectNowCandidates(items, 2);
    expect(result[0]?.id).toBe("B");
    expect(result[1]?.id).toBe("A");
  });
});

describe("formatNowQueue", () => {
  it("returns 'nothing to propose' for empty candidates", () => {
    expect(formatNowQueue([])).toBe("nothing to propose");
  });

  it("contains the item id in output", () => {
    const item = mk("EF-123", "next", "rock");
    const out = formatNowQueue([item]);
    expect(out).toContain("EF-123");
  });

  it("contains the item title", () => {
    const item = mk("FOO", "next", "pebble");
    const out = formatNowQueue([item]);
    expect(out).toContain("Title FOO");
  });

  it("includes tier and size annotation", () => {
    const item = mk("X", "next", "rock", "S");
    const out = formatNowQueue([item]);
    expect(out).toContain("rock");
    expect(out).toContain("/S");
  });

  it("renders a fallback dash when tier is undefined", () => {
    const item = mk("Y", "next", undefined, "M");
    const out = formatNowQueue([item]);
    expect(out).toContain("—");
  });

  it("formats multiple candidates on separate lines", () => {
    const items = [mk("A", "next", "rock", "S"), mk("B", "next", "pebble", "M")];
    const out = formatNowQueue(items);
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("A");
    expect(lines[1]).toContain("B");
  });
});

describe("formatNowEmptyState", () => {
  it("returns only nothing to propose when there are no blocked, parked, or horizon cards", () => {
    expect(formatNowEmptyState([mk("A", "shipped")])).toBe("nothing to propose");
  });

  it("reports blocked, parked, and decision-only horizon cards", () => {
    const out = formatNowEmptyState([
      mk("BLOCKED", "blocked", "rock", "S"),
      mk("PARKED", "parked", "rock", "S"),
      mk("DECIDE", "horizon", "pebble", "M"),
    ]);
    expect(out).toContain("nothing to propose");
    expect(out).toContain("blocked: 1");
    expect(out).toContain("BLOCKED");
    expect(out).toContain("parked: 1");
    expect(out).toContain("PARKED");
    expect(out).toContain("needs decision: 1");
    expect(out).toContain("DECIDE");
  });

  it("caps long blocker lists to three visible cards", () => {
    const out = formatNowEmptyState([
      mk("A", "blocked", "rock", "S"),
      mk("B", "blocked", "rock", "S"),
      mk("C", "blocked", "rock", "S"),
      mk("D", "blocked", "rock", "S"),
    ]);
    expect(out).toContain("blocked: 4");
    expect(out).toContain("A");
    expect(out).toContain("B");
    expect(out).toContain("C");
    expect(out).not.toContain("D -");
    expect(out).toContain("1 more hidden");
  });

  it("does not tell the operator to clear parked cards like active blockers", () => {
    const out = formatNowEmptyState([
      mk("A", "parked", "rock", "S"),
      mk("B", "parked", "rock", "S"),
      mk("C", "parked", "rock", "S"),
      mk("D", "parked", "rock", "S"),
    ]);
    expect(out).toContain("parked: 4");
    expect(out).toContain("review with `vanta roadmap unblock` before reviving");
    expect(out).not.toContain("clear one first");
  });
});
