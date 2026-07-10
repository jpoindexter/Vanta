import { describe, expect, it } from "vitest";
import type { RoadmapItem } from "./schema.js";
import { activeRoadmapCount, formatRoadmapCompletionGate, formatRoadmapDrainGate, formatRoadmapOpenWork, formatRoadmapStatus, nonShippedRoadmapCount, openRoadmapItems, summarizeRoadmapStatus } from "./status-summary.js";

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
    expect(nonShippedRoadmapCount(items)).toBe(1);
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

  it("summarizes active and parked counts for json output", () => {
    const summary = summarizeRoadmapStatus([
      card("A", "shipped"),
      card("B", "blocked"),
      card("C", "parked", "external proof"),
      card("D", "parked", "strategy decision"),
    ]);
    expect(summary).toMatchObject({
      total: 4,
      activeTotal: 1,
      activeDrained: false,
      complete: false,
      nonShippedTotal: 3,
      openTotal: 2,
      actionableOpenTotal: 2,
      terminalParkedTotal: 1,
      statuses: { shipped: 1, blocked: 1, parked: 2 },
      parkedReasons: { "external proof": 1, "strategy decision": 1 },
    });
  });

  it("reports completion by open work, not terminal parked resolutions", () => {
    const drainedButIncomplete = [
      card("A", "shipped"),
      card("B", "parked", "external proof"),
      card("C", "parked", "declined/n-a"),
      card("D", "parked", "duplicate"),
      card("E", "parked", "optional proof"),
      card("F", "parked", "strategy decision"),
    ];
    expect(formatRoadmapCompletionGate(drainedButIncomplete)).toContain("roadmap complete: no");
    expect(formatRoadmapCompletionGate(drainedButIncomplete)).toContain("open: 1");
    expect(formatRoadmapCompletionGate(drainedButIncomplete)).toContain("actionable open: 1");
    expect(formatRoadmapCompletionGate(drainedButIncomplete)).toContain("non-shipped: 5");
    expect(formatRoadmapCompletionGate(drainedButIncomplete)).toContain("terminal parked: 4");
    const terminalOnly = [
      card("A", "shipped"),
      card("C", "parked", "declined/n-a"),
      card("D", "parked", "duplicate"),
      card("E", "parked", "optional proof"),
      card("F", "parked", "strategy decision"),
    ];
    expect(formatRoadmapCompletionGate(terminalOnly)).toContain("roadmap complete: yes");
  });

  it("lists only open roadmap items", () => {
    const items = [
      card("A", "shipped"),
      card("B", "parked", "external proof"),
      card("C", "parked", "declined/n-a"),
      card("D", "parked", "optional proof"),
      card("F", "parked", "strategy decision"),
      card("E", "next"),
    ];
    expect(openRoadmapItems(items).map((item) => item.id)).toEqual(["B", "E"]);
    const out = formatRoadmapOpenWork(items);
    expect(out).toContain("open roadmap work: 2");
    expect(out).toContain("B (parked · external proof)");
    expect(out).toContain("E (next)");
    expect(out).not.toContain("C");
    expect(out).not.toContain("D");
    expect(out).not.toContain("F");
  });

  it("marks open items blocked by other open dependencies as not actionable", () => {
    const items = [
      { ...card("GATE", "parked", "external proof"), after: ["PROOF"] },
      card("PROOF", "parked", "external proof"),
    ];
    const open = openRoadmapItems(items);
    expect(open).toEqual([
      expect.objectContaining({ id: "GATE", actionable: false, blockedByOpenIds: ["PROOF"] }),
      expect.objectContaining({ id: "PROOF", actionable: true, blockedByOpenIds: [] }),
    ]);
    expect(summarizeRoadmapStatus(items).actionableOpenTotal).toBe(1);
    expect(formatRoadmapOpenWork(items)).toContain("GATE (parked · external proof) [after open: PROOF]");
  });
});
