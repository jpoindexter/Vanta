import { describe, it, expect } from "vitest";
import { toProspect } from "./promote.js";
import type { Opportunity } from "./store.js";

const base: Opportunity = {
  kind: "opportunity",
  id: "opp-1",
  title: "Automate expense reports",
  source: "r/startups",
  pain: 0.8,
  buyer: 0.6,
  note: "Finance teams spend 4h/week on manual reconciliation",
  status: "new",
  ts: "2026-06-14T10:00:00.000Z",
};

describe("toProspect", () => {
  it("maps title to prospect name", () => {
    const p = toProspect(base);
    expect(p.name).toBe("Automate expense reports");
  });

  it("sets stage to 'lead' (earliest pipeline stage)", () => {
    const p = toProspect(base);
    expect(p.stage).toBe("lead");
  });

  it("carries pain score in the note", () => {
    const p = toProspect(base);
    expect(p.note).toContain("pain:0.80");
  });

  it("carries composite score in the note", () => {
    const p = toProspect(base);
    // composite = 0.8 + 0.6 = 1.40
    expect(p.note).toContain("score:1.40");
  });

  it("carries the opportunity note (detail) in the prospect note", () => {
    const p = toProspect(base);
    expect(p.note).toContain("Finance teams spend 4h/week on manual reconciliation");
  });

  it("falls back to title as detail when no opportunity note", () => {
    const opp: Opportunity = { ...base, note: undefined };
    const p = toProspect(opp);
    expect(p.note).toContain("Automate expense reports");
  });

  it("carries source in the note when present", () => {
    const p = toProspect(base);
    expect(p.note).toContain("source:r/startups");
  });

  it("omits source fragment when opportunity has no source", () => {
    const opp: Opportunity = { ...base, source: undefined };
    const p = toProspect(opp);
    expect(p.note).not.toContain("source:");
  });

  it("uses '?' for pain when pain is undefined", () => {
    const opp: Opportunity = { ...base, pain: undefined };
    const p = toProspect(opp);
    expect(p.note).toContain("pain:?");
  });

  it("assigns a fresh UUID id (not the opportunity id)", () => {
    const p = toProspect(base);
    expect(p.id).not.toBe(base.id);
    // UUID v4 format
    expect(p.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("produces a fresh ts on each call", async () => {
    const p1 = toProspect(base);
    await new Promise((r) => setTimeout(r, 2));
    const p2 = toProspect(base);
    // Both are valid ISO strings; p2 ts >= p1 ts
    expect(new Date(p2.ts).getTime()).toBeGreaterThanOrEqual(new Date(p1.ts).getTime());
  });
});
