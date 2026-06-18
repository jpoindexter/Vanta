import { describe, it, expect } from "vitest";
import {
  extractDates, extractDurations, buildTemporalIndex,
  classifyTemporalQuery, temporalRank, type TemporalRecord,
} from "./temporal.js";

const NOW = Date.parse("2024-07-01");

describe("extractDates", () => {
  it("pulls ISO dates and bare years (deduped, sorted)", () => {
    const ds = extractDates("met on 2023-09-01, again in 2024, signed 2023-09-01");
    expect(ds).toHaveLength(2); // dup ISO collapsed; 2024 added
    expect(ds[0]).toBe(Date.parse("2023-09-01"));
  });

  it("does not double-count a year already in an ISO date", () => {
    expect(extractDates("on 2023-09-01")).toHaveLength(1);
  });
});

describe("extractDurations", () => {
  it("normalizes durations to years", () => {
    expect(extractDurations("for 15 years")).toEqual([15]);
    expect(extractDurations("about 6 months")[0]).toBeCloseTo(0.5, 3);
  });
});

describe("classifyTemporalQuery", () => {
  it("recognizes earliest/latest/duration/in-year and otherwise none", () => {
    expect(classifyTemporalQuery("the earliest event").type).toBe("earliest");
    expect(classifyTemporalQuery("most recent thing").type).toBe("latest");
    expect(classifyTemporalQuery("how long has it been").type).toBe("duration");
    expect(classifyTemporalQuery("what happened in 2023")).toEqual({ type: "in-year", year: 2023 });
    expect(classifyTemporalQuery("who is the customer").type).toBe("none");
  });
});

describe("temporalRank", () => {
  const records: TemporalRecord[] = [
    { id: "old", text: "first commit on 2010-03-12" },
    { id: "mid", text: "moved on 2023-09-01" },
    { id: "new", text: "rewrite on 2026-06-17" },
    { id: "dur", text: "a developer for 15 years" },
    { id: "none", text: "likes numbered lists" },
  ];
  const index = buildTemporalIndex(records);

  it("ranks the earliest-dated memory first for an 'earliest' query", () => {
    expect(temporalRank("the earliest recorded event", records, index, NOW)[0]).toBe("old");
  });

  it("ranks the latest-dated memory first for a 'most recent' query", () => {
    expect(temporalRank("the most recent event", records, index, NOW)[0]).toBe("new");
  });

  it("ranks the duration-bearing memory first for a 'how long' query", () => {
    expect(temporalRank("how long has Jason worked", records, index, NOW)[0]).toBe("dur");
  });

  it("falls back to lexical for a non-temporal query", () => {
    expect(temporalRank("numbered lists", records, index, NOW)[0]).toBe("none");
  });
});
