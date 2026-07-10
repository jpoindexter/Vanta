import { describe, expect, it } from "vitest";
import type { RoadmapItem } from "./schema.js";
import { activeRoadmapCount, formatRoadmapDrainGate, formatRoadmapStatus } from "./status-summary.js";

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

  it("reports a drained active queue when only shipped and parked cards remain", () => {
    const items = [
      card("A", "shipped"),
      card("B", "parked", "external proof"),
    ];
    expect(activeRoadmapCount(items)).toBe(0);
    expect(formatRoadmapDrainGate(items)).toContain("active roadmap drained: yes");
  });

  it("reports active work when any build-sequence status remains", () => {
    const items = [
      card("A", "building"),
      card("B", "blocked"),
      card("C", "next"),
      card("D", "horizon"),
      card("E", "parked", "external proof"),
    ];
    const out = formatRoadmapDrainGate(items);
    expect(activeRoadmapCount(items)).toBe(4);
    expect(out).toContain("active roadmap drained: no");
    expect(out).toContain("building: 1");
    expect(out).toContain("blocked: 1");
    expect(out).toContain("next: 1");
    expect(out).toContain("horizon: 1");
    expect(out).toContain("parked: 1");
  });
});
