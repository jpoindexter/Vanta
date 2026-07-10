import { describe, expect, it } from "vitest";
import type { RoadmapItem } from "./schema.js";
import { formatRoadmapStatus } from "./status-summary.js";

function card(id: string, status: RoadmapItem["status"], parkedReason?: RoadmapItem["parkedReason"]): RoadmapItem {
  return { id, status, parkedReason, track: "Operator", title: id, size: "S", summary: "", done: "" };
}

describe("formatRoadmapStatus", () => {
  it("prints status counts in schema order", () => {
    const out = formatRoadmapStatus([
      card("A", "shipped"),
      card("B", "building"),
      card("C", "parked", "external proof"),
    ]);
    expect(out).toContain("total: 3");
    expect(out).toContain("shipped: 1");
    expect(out).toContain("building: 1");
    expect(out).toContain("blocked: 0");
    expect(out).toContain("parked: 1");
  });

  it("prints parked reason counts only when parked cards exist", () => {
    const out = formatRoadmapStatus([
      card("A", "parked", "external proof"),
      card("B", "parked", "external proof"),
      card("C", "parked", "declined/n-a"),
      card("D", "next"),
    ]);
    expect(out).toContain("parked reasons:");
    expect(out).toContain("- external proof: 2");
    expect(out).toContain("- declined/n-a: 1");
  });

  it("omits parked reason section when no cards are parked", () => {
    const out = formatRoadmapStatus([card("A", "shipped")]);
    expect(out).not.toContain("parked reasons:");
  });
});
