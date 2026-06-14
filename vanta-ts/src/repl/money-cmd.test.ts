import { describe, it, expect } from "vitest";
import { formatMoney } from "./money-cmd.js";
import type { MoneyRecord } from "../money/store.js";

const recs: MoneyRecord[] = [
  { kind: "offer", id: "retainer", name: "Monthly Retainer", price: "$3k/mo", ts: "t1" },
  { kind: "prospect", id: "acme", name: "Acme Corp", stage: "contacted", ts: "t2" },
  { kind: "prospect", id: "beta", name: "Beta LLC", stage: "won", ts: "t3" },
  { kind: "revenue", amount: 3000, source: "acme", ts: "t4" },
];

describe("formatMoney", () => {
  it("includes revenue total, prospect count, and offer count in header", () => {
    const out = formatMoney(recs);
    expect(out).toContain("$3000 revenue");
    expect(out).toContain("2 prospect(s)");
    expect(out).toContain("1 offer(s)");
  });

  it("shows pipeline stages", () => {
    const out = formatMoney(recs);
    expect(out).toContain("contacted: 1");
    expect(out).toContain("won: 1");
  });

  it("lists offers with price", () => {
    const out = formatMoney(recs);
    expect(out).toContain("offer:retainer — Monthly Retainer · $3k/mo");
  });

  it("empty ledger prompts to record", () => {
    expect(formatMoney([])).toContain("empty");
  });

  it("zero revenue shows $0", () => {
    const noRevenue: MoneyRecord[] = [{ kind: "offer", id: "x", name: "Free Tier", ts: "t1" }];
    expect(formatMoney(noRevenue)).toContain("$0 revenue");
  });
});
