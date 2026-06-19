import { describe, it, expect } from "vitest";
import { analyzeCcrUsage, ccrVerdict, formatCcrUsage } from "./ccr-stats.js";

describe("ccrVerdict", () => {
  it("keeps when re-expansion is rare (<1/3)", () => {
    expect(ccrVerdict(0)).toBe("keep");
    expect(ccrVerdict(0.14)).toBe("keep");
    expect(ccrVerdict(0.32)).toBe("keep");
  });
  it("scopes at moderate re-expansion (1/3..2/3)", () => {
    expect(ccrVerdict(0.5)).toBe("scope");
  });
  it("retires when most stashes get pulled whole (>=2/3)", () => {
    expect(ccrVerdict(0.8)).toBe("retire");
    expect(ccrVerdict(1)).toBe("retire");
  });
});

describe("analyzeCcrUsage", () => {
  const events = [
    { event: "read_file: export function foo(){…}" },
    { event: "retrieve_original: {\n  full source…" },
    { event: "grep_files: 3 matches" },
    { event: "web_fetch: [vanta compressed … output truncated: 90000 chars original_id=\"abcd\"]" },
    { event: "retrieve_original: {\n  more…" },
  ];

  it("counts retrieves + offload deliveries and computes the rate", () => {
    const u = analyzeCcrUsage(events, 14); // 2 retrieves / 14 stashes ≈ 14%
    expect(u.retrieveCalls).toBe(2);
    expect(u.offloadDeliveries).toBe(1);
    expect(u.stashCount).toBe(14);
    expect(u.wholeRetrieveRate).toBeCloseTo(2 / 14, 5);
    expect(u.verdict).toBe("keep");
  });

  it("retires when retrieves swamp stashes", () => {
    const u = analyzeCcrUsage([{ event: "retrieve_original: x" }, { event: "retrieve_original: y" }], 2);
    expect(u.wholeRetrieveRate).toBe(1);
    expect(u.verdict).toBe("retire");
  });

  it("empty log with no stashes is a clean keep (rate 0, no division by zero)", () => {
    const u = analyzeCcrUsage([], 0);
    expect(u.wholeRetrieveRate).toBe(0);
    expect(u.verdict).toBe("keep");
  });

  it("clamps a retrieve count above stash count to 100%", () => {
    const u = analyzeCcrUsage([{ event: "retrieve_original: a" }, { event: "retrieve_original: b" }, { event: "retrieve_original: c" }], 2);
    expect(u.wholeRetrieveRate).toBe(1);
  });

  it("formats a human-readable verdict line", () => {
    expect(formatCcrUsage(analyzeCcrUsage(events, 14))).toMatch(/whole-retrieve rate: 14\.3%[\s\S]*KEEP/);
  });
});
