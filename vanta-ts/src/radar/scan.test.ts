import { describe, it, expect } from "vitest";
import { rankOpportunities, draftOffer } from "./scan.js";
import type { Opportunity } from "./store.js";

function opp(overrides: Partial<Opportunity> & Pick<Opportunity, "id">): Opportunity {
  return {
    kind: "opportunity",
    title: overrides.id,
    status: "new",
    ts: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("rankOpportunities", () => {
  it("returns empty array for empty input", () => {
    expect(rankOpportunities([])).toEqual([]);
  });

  it("orders by composite score descending", () => {
    const opps = [
      opp({ id: "low", pain: 0.2, buyer: 0.1 }),
      opp({ id: "high", pain: 0.9, buyer: 0.8 }),
      opp({ id: "mid", pain: 0.5, buyer: 0.5 }),
    ];
    const result = rankOpportunities(opps);
    expect(result.map((o) => o.id)).toEqual(["high", "mid", "low"]);
  });

  it("attaches compositeScore to each ranked opportunity", () => {
    const opps = [opp({ id: "a", pain: 0.6, buyer: 0.4 })];
    const result = rankOpportunities(opps);
    expect(result[0]?.compositeScore).toBeCloseTo(1.0);
  });

  it("uses recency as tie-break (newer wins)", () => {
    const opps = [
      opp({ id: "older", pain: 0.5, buyer: 0.5, ts: "2026-01-01T00:00:00.000Z" }),
      opp({ id: "newer", pain: 0.5, buyer: 0.5, ts: "2026-06-01T00:00:00.000Z" }),
    ];
    const result = rankOpportunities(opps);
    expect(result[0]?.id).toBe("newer");
    expect(result[1]?.id).toBe("older");
  });

  it("deduplicates by id (last write wins) before ranking", () => {
    const opps = [
      opp({ id: "x", pain: 0.1, buyer: 0.1, ts: "2026-01-01T00:00:00.000Z" }),
      opp({ id: "x", pain: 0.9, buyer: 0.9, ts: "2026-06-01T00:00:00.000Z" }),
    ];
    const result = rankOpportunities(opps);
    expect(result).toHaveLength(1);
    expect(result[0]?.compositeScore).toBeCloseTo(1.8);
  });

  it("treats missing pain/buyer as 0", () => {
    const opps = [opp({ id: "zero" })];
    const result = rankOpportunities(opps);
    expect(result[0]?.compositeScore).toBe(0);
  });
});

describe("draftOffer", () => {
  it("includes the opportunity title", () => {
    const o = opp({ id: "saas-pain", title: "SaaS pricing too complex" });
    expect(draftOffer(o)).toContain("SaaS pricing too complex");
  });

  it("includes a problem statement", () => {
    const o = opp({ id: "a", title: "Slow onboarding", note: "Users drop off in step 3" });
    const draft = draftOffer(o);
    expect(draft).toContain("Problem");
    expect(draft).toContain("Users drop off in step 3");
  });

  it("includes audience derived from source", () => {
    const o = opp({ id: "b", title: "B2B billing pain", source: "reddit/r/startups" });
    const draft = draftOffer(o);
    expect(draft).toContain("reddit/r/startups");
    expect(draft).toContain("Audience");
  });

  it("falls back to generic audience when source is absent", () => {
    const o = opp({ id: "c", title: "Generic pain" });
    const draft = draftOffer(o);
    expect(draft).toContain("the right buyer");
  });

  it("includes pain score when present", () => {
    const o = opp({ id: "d", title: "Expensive problem", pain: 0.9 });
    const draft = draftOffer(o);
    expect(draft).toContain("pain 0.9");
  });

  it("includes a next-step line", () => {
    const o = opp({ id: "e", title: "E" });
    expect(draftOffer(o)).toContain("Next step");
  });
});
