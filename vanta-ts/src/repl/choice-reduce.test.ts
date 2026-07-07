import { describe, it, expect } from "vitest";
import { topNextItems, wasReduced, MAX_VISIBLE_CHOICES, rankAllItems, formatChoiceList } from "./choice-reduce.js";
import type { RoadmapItem } from "../roadmap/schema.js";

const item = (overrides: Partial<RoadmapItem> & {id: string}): RoadmapItem => ({
  track: "Test",
  title: overrides.id,
  status: "next",
  size: "M",
  summary: "",
  done: "",
  ...overrides,
});

describe("topNextItems", () => {
  it("returns all items when count <= MAX_VISIBLE_CHOICES", () => {
    const items = [item({ id: "A" }), item({ id: "B" })];
    expect(topNextItems(items)).toHaveLength(2);
  });

  it("returns only MAX_VISIBLE_CHOICES items when list is longer", () => {
    const items = Array.from({ length: 10 }, (_, i) => item({ id: `I${i}` }));
    expect(topNextItems(items)).toHaveLength(MAX_VISIBLE_CHOICES);
  });

  it("prefers sand tier over pebble and rock", () => {
    const items = [
      item({ id: "big", tier: "rock", size: "L" }),
      item({ id: "small", tier: "sand", size: "S" }),
      item({ id: "mid", tier: "pebble", size: "M" }),
      item({ id: "big2", tier: "rock", size: "M" }),
    ];
    const top = topNextItems(items, 2);
    expect(top[0]?.id).toBe("small");
    expect(top[1]?.id).toBe("mid");
  });

  it("prefers smaller size within the same tier", () => {
    const items = [
      item({ id: "large-pebble", tier: "pebble", size: "L" }),
      item({ id: "small-pebble", tier: "pebble", size: "S" }),
    ];
    const top = topNextItems(items, 1);
    expect(top[0]?.id).toBe("small-pebble");
  });

  it("uses position as tiebreaker (earlier first)", () => {
    const items = [
      item({ id: "first", tier: "sand", size: "M" }),
      item({ id: "second", tier: "sand", size: "M" }),
    ];
    const top = topNextItems(items, 1);
    expect(top[0]?.id).toBe("first");
  });

  it("MAX_VISIBLE_CHOICES is 3", () => {
    expect(MAX_VISIBLE_CHOICES).toBe(3);
  });
});

describe("wasReduced", () => {
  it("returns true when total exceeds MAX_VISIBLE_CHOICES", () => {
    expect(wasReduced(4)).toBe(true);
  });
  it("returns false when total is at or below MAX_VISIBLE_CHOICES", () => {
    expect(wasReduced(3)).toBe(false);
    expect(wasReduced(2)).toBe(false);
  });
});

describe("rankAllItems / formatChoiceList (ND-CHOICE-REDUCE: full list on request)", () => {
  const five = ["a", "b", "c", "d", "e"].map((id) => item({ id, size: "M" }));

  it("rankAllItems returns every item (no cap), still effort-ranked", () => {
    expect(rankAllItems(five)).toHaveLength(5);
  });

  it("defaults to the top 3 + a hidden-count line naming the affordance", () => {
    const out = formatChoiceList(five, { hint: "/suggest all" });
    expect(out.split("\n").filter((l) => l.startsWith("  - "))).toHaveLength(MAX_VISIBLE_CHOICES);
    expect(out).toContain("2 more (/suggest all)");
  });

  it("shows the full list when all:true (no hidden-count line)", () => {
    const out = formatChoiceList(five, { all: true });
    expect(out.split("\n").filter((l) => l.startsWith("  - "))).toHaveLength(5);
    expect(out).not.toContain("more (");
  });

  it("no hidden line when the list already fits", () => {
    const out = formatChoiceList([item({ id: "solo" })], { hint: "x" });
    expect(out).not.toContain("more (");
  });

  it("empty listing is explicit", () => {
    expect(formatChoiceList([])).toBe("(nothing ready)");
  });
});
