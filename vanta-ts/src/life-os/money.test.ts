import { describe, it, expect } from "vitest";
import { buildMoneyBrief, ESCAPE_LADDER } from "./money.js";
import { LifeOsSchema } from "./schema.js";

const EMPTY = LifeOsSchema.parse({});

describe("buildMoneyBrief", () => {
  it("renders with empty data", () => {
    const out = buildMoneyBrief(EMPTY);
    expect(out).toContain("Money");
    expect(out).toContain("Escape ladder");
    expect(out).toContain("Next action");
  });

  it("shows revenue vs target", () => {
    const data = LifeOsSchema.parse({
      revenue: [{ id: "r1", description: "client", amount: 2000, date: new Date().toISOString().slice(0, 10) }],
    });
    const out = buildMoneyBrief(data, 5000);
    expect(out).toContain("$2,000");
    expect(out).toContain("40%");
  });

  it("escape ladder shows progress bar and percent", () => {
    const out = buildMoneyBrief(EMPTY, 5000);
    expect(out).toContain("░"); // bar present even at 0%
    expect(out).toContain("%");
  });

  it("shows opportunities sorted by value", () => {
    const data = LifeOsSchema.parse({
      opportunities: [
        { id: "o1", title: "Big deal", value: 5000, status: "active" },
        { id: "o2", title: "Small deal", value: 500, status: "lead" },
      ],
    });
    const out = buildMoneyBrief(data);
    expect(out).toContain("Big deal");
    const bigIdx = out.indexOf("Big deal");
    const smallIdx = out.indexOf("Small deal");
    expect(bigIdx).toBeLessThan(smallIdx);
  });
});

describe("ESCAPE_LADDER", () => {
  it("has at least 5 rungs", () => {
    expect(ESCAPE_LADDER.length).toBeGreaterThanOrEqual(5);
  });
  it("targets are ascending", () => {
    for (let i = 1; i < ESCAPE_LADDER.length; i++) {
      expect(ESCAPE_LADDER[i]!.target).toBeGreaterThan(ESCAPE_LADDER[i - 1]!.target);
    }
  });
});
