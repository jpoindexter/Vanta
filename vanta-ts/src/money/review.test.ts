import { describe, it, expect } from "vitest";
import { suggestPrice, weeklyReview } from "./review.js";
import type { MoneyRecord } from "./store.js";

// Fixed epoch: 2024-01-15T12:00:00Z
const NOW = new Date("2024-01-15T12:00:00Z").getTime();
// One day before NOW — within week
const YESTERDAY = new Date("2024-01-14T12:00:00Z").toISOString();
// Eight days before NOW — outside week
const LAST_WEEK = new Date("2024-01-07T11:00:00Z").toISOString();

describe("suggestPrice", () => {
  it("returns median band from comparables", () => {
    const result = suggestPrice({ offer: "Consulting", comparables: [1000, 2000, 3000] });
    expect(result.low).toBe(1000);
    expect(result.median).toBe(2000);
    expect(result.high).toBe(3000);
    expect(result.note).toContain("Consulting");
  });

  it("handles even-length comparables (interpolated median)", () => {
    const result = suggestPrice({ offer: "Retainer", comparables: [1000, 3000] });
    expect(result.median).toBe(2000);
  });

  it("returns zero band + note for empty comparables", () => {
    const result = suggestPrice({ offer: "Widget", comparables: [] });
    expect(result.low).toBe(0);
    expect(result.median).toBe(0);
    expect(result.high).toBe(0);
    expect(result.note).toContain("No comparables");
    expect(result.note).toContain("Widget");
  });

  it("handles a single comparable", () => {
    const result = suggestPrice({ offer: "Audit", comparables: [5000] });
    expect(result.low).toBe(5000);
    expect(result.median).toBe(5000);
    expect(result.high).toBe(5000);
  });

  it("sorts unsorted comparables correctly", () => {
    const result = suggestPrice({ offer: "X", comparables: [3000, 1000, 2000] });
    expect(result.low).toBe(1000);
    expect(result.high).toBe(3000);
  });
});

describe("weeklyReview", () => {
  const baseRecords: MoneyRecord[] = [
    { kind: "revenue", amount: 500, ts: YESTERDAY },
    { kind: "revenue", amount: 200, ts: YESTERDAY },
    { kind: "revenue", amount: 800, ts: LAST_WEEK },   // out of week — excluded
    { kind: "prospect", id: "acme", name: "Acme Corp", stage: "booked", ts: YESTERDAY },
    { kind: "prospect", id: "beta", name: "Beta Ltd", stage: "lead", ts: LAST_WEEK },
    { kind: "offer", id: "retainer", name: "Retainer", ts: YESTERDAY },
    { kind: "offer", id: "audit", name: "Audit", ts: LAST_WEEK },   // out of week
  ];

  it("sums only in-week revenue", () => {
    const r = weeklyReview(baseRecords, NOW);
    expect(r.revenueThisWeek).toBe(700); // 500 + 200; 800 excluded
  });

  it("excludes out-of-week revenue", () => {
    const r = weeklyReview(baseRecords, NOW);
    expect(r.revenueThisWeek).not.toBe(1500);
  });

  it("pipeline value counts open (non-won/lost) prospects", () => {
    const r = weeklyReview(baseRecords, NOW);
    expect(r.pipelineValue).toBe(2); // acme:booked + beta:lead
  });

  it("excludes won/lost from pipeline", () => {
    const records: MoneyRecord[] = [
      { kind: "prospect", id: "won1", name: "Won Corp", stage: "won", ts: YESTERDAY },
      { kind: "prospect", id: "lost1", name: "Lost Inc", stage: "lost", ts: YESTERDAY },
      { kind: "prospect", id: "open1", name: "Open Co", stage: "lead", ts: YESTERDAY },
    ];
    const r = weeklyReview(records, NOW);
    expect(r.pipelineValue).toBe(1);
  });

  it("picks top prospect by stage priority (booked > replied > contacted > lead)", () => {
    const r = weeklyReview(baseRecords, NOW);
    expect(r.topProspect).toBe("Acme Corp"); // booked beats lead
  });

  it("returns null top prospect when no open prospects", () => {
    const records: MoneyRecord[] = [
      { kind: "prospect", id: "won1", name: "Done Corp", stage: "won", ts: YESTERDAY },
    ];
    const r = weeklyReview(records, NOW);
    expect(r.topProspect).toBeNull();
  });

  it("counts new offers this week only", () => {
    const r = weeklyReview(baseRecords, NOW);
    expect(r.newOffersThisWeek).toBe(1); // only retainer is in-week
  });

  it("returns zeros on empty records", () => {
    const r = weeklyReview([], NOW);
    expect(r.revenueThisWeek).toBe(0);
    expect(r.pipelineValue).toBe(0);
    expect(r.topProspect).toBeNull();
    expect(r.newOffersThisWeek).toBe(0);
  });

  it("uses last-write-wins for repeated prospect ids", () => {
    const records: MoneyRecord[] = [
      { kind: "prospect", id: "acme", name: "Acme Corp", stage: "lead", ts: YESTERDAY },
      { kind: "prospect", id: "acme", name: "Acme Corp", stage: "won", ts: YESTERDAY },
    ];
    const r = weeklyReview(records, NOW);
    expect(r.pipelineValue).toBe(0); // final state is won → excluded
  });
});
