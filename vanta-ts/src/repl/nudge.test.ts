import { describe, it, expect } from "vitest";
import { shouldNudge, buildNudgeText, DEFAULT_NUDGE_EVERY } from "./nudge.js";
import type { Goal } from "../types.js";

const g = (id: number, text: string, status: "active" | "done" = "active"): Goal => ({ id, text, status });

describe("shouldNudge", () => {
  it("returns false when every is 0 (disabled)", () => {
    expect(shouldNudge(5, 0)).toBe(false);
    expect(shouldNudge(10, 0)).toBe(false);
  });

  it("returns false when turnIndex is 0", () => {
    expect(shouldNudge(0, DEFAULT_NUDGE_EVERY)).toBe(false);
  });

  it("returns true on exact multiples of every", () => {
    expect(shouldNudge(5, 5)).toBe(true);
    expect(shouldNudge(10, 5)).toBe(true);
    expect(shouldNudge(3, 3)).toBe(true);
  });

  it("returns false on non-multiple turns", () => {
    expect(shouldNudge(1, 5)).toBe(false);
    expect(shouldNudge(7, 5)).toBe(false);
    expect(shouldNudge(4, 5)).toBe(false);
  });

  it("returns false for negative every (also disabled)", () => {
    expect(shouldNudge(5, -1)).toBe(false);
  });
});

describe("buildNudgeText", () => {
  it("returns null when goals list is empty", () => {
    expect(buildNudgeText([])).toBeNull();
  });

  it("returns null when all goals are done", () => {
    expect(buildNudgeText([g(1, "ship feature", "done"), g(2, "write tests", "done")])).toBeNull();
  });

  it("returns a nudge string for an active goal", () => {
    const note = buildNudgeText([g(1, "ship v1")]);
    expect(note).not.toBeNull();
    expect(note).toContain("ship v1");
    expect(note).toContain("/next");
  });

  it("uses the first active goal even if there are multiple", () => {
    const note = buildNudgeText([g(1, "goal A"), g(2, "goal B")]);
    expect(note).toContain("goal A");
    expect(note).not.toContain("goal B");
  });

  it("truncates goal text beyond 60 chars", () => {
    const long = "x".repeat(80);
    const note = buildNudgeText([g(1, long)])!;
    expect(note.length).toBeLessThan(120);
    expect(note).toContain("…");
  });

  it("does not truncate a short goal", () => {
    const note = buildNudgeText([g(1, "short")])!;
    expect(note).not.toContain("…");
  });
});
