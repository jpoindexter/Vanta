import { describe, it, expect } from "vitest";
import { formatRadar } from "./radar-cmd.js";
import type { Opportunity } from "../radar/store.js";

const opp = (id: string, overrides: Partial<Opportunity> = {}): Opportunity => ({
  kind: "opportunity", id, title: `Title ${id}`, status: "new", ts: "t1", ...overrides,
});

describe("formatRadar", () => {
  it("shows ranked opportunities with score + status", () => {
    const recs: Opportunity[] = [
      opp("a", { pain: 0.8, buyer: 0.7, status: "validated" }),
      opp("b", { pain: 0.2, buyer: 0.1, status: "new" }),
    ];
    const out = formatRadar(recs);
    expect(out).toContain("2 opportunities");
    expect(out).toContain("[1.50]");
    expect(out).toContain("validated");
    const lines = out.split("\n");
    expect(lines[1]).toContain("a");
    expect(lines[2]).toContain("b");
  });

  it("empty radar prompts to record", () => {
    expect(formatRadar([])).toContain("empty");
  });

  it("single opportunity uses singular label", () => {
    expect(formatRadar([opp("x")])).toContain("1 opportunity");
  });

  it("includes note when present", () => {
    const out = formatRadar([opp("a", { note: "early signal" })]);
    expect(out).toContain("early signal");
  });
});
