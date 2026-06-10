import { describe, it, expect } from "vitest";
import { humanAge, freshnessCaveat, annotateMemory } from "./freshness.js";

const DAY_MS = 86_400_000;

describe("humanAge", () => {
  it("returns 'today' for age 0", () => {
    expect(humanAge(0)).toBe("today");
  });

  it("returns 'today' for any age under one day", () => {
    expect(humanAge(DAY_MS - 1)).toBe("today");
  });

  it("returns 'today' for a future/clock-skew negative age", () => {
    expect(humanAge(-DAY_MS)).toBe("today");
  });

  it("returns 'yesterday' for exactly one day", () => {
    expect(humanAge(DAY_MS)).toBe("yesterday");
  });

  it("returns 'N days ago' for N >= 2 days", () => {
    expect(humanAge(2 * DAY_MS)).toBe("2 days ago");
    expect(humanAge(47 * DAY_MS)).toBe("47 days ago");
  });

  it("floors a partial day", () => {
    expect(humanAge(2 * DAY_MS + DAY_MS / 2)).toBe("2 days ago");
  });
});

describe("freshnessCaveat", () => {
  it("returns null for today (age 0)", () => {
    expect(freshnessCaveat(0)).toBeNull();
  });

  it("returns null for yesterday (exactly one day)", () => {
    expect(freshnessCaveat(DAY_MS)).toBeNull();
  });

  it("returns null just under the two-day fresh boundary", () => {
    expect(freshnessCaveat(2 * DAY_MS - 1)).toBeNull();
  });

  it("returns a caveat at two days", () => {
    const caveat = freshnessCaveat(2 * DAY_MS);
    expect(caveat).toContain("2 days ago");
    expect(caveat).toContain("verify file:line citations");
  });

  it("returns a caveat naming the human age for 47 days", () => {
    const caveat = freshnessCaveat(47 * DAY_MS);
    expect(caveat).toContain("47 days ago");
  });
});

describe("annotateMemory", () => {
  it("returns content unchanged for a fresh memory (today)", () => {
    expect(annotateMemory("note body", 0)).toBe("note body");
  });

  it("returns content unchanged for yesterday", () => {
    expect(annotateMemory("note body", DAY_MS)).toBe("note body");
  });

  it("prepends a caveat for a stale memory (47 days)", () => {
    const out = annotateMemory("note body", 47 * DAY_MS);
    expect(out).toContain("47 days ago");
    expect(out).toContain("note body");
    expect(out.startsWith("[memory is")).toBe(true);
    expect(out.endsWith("note body")).toBe(true);
  });
});
