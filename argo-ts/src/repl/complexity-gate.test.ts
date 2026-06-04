import { describe, it, expect } from "vitest";
import {
  scoreComplexity,
  shouldSuggestPlanMode,
  buildComplexityNote,
  DEFAULT_COMPLEXITY_THRESHOLD,
  isPlanModeActive,
} from "./complexity-gate.js";
import { PLAN_MARKER } from "./plan-mode.js";
import type { Message } from "../types.js";

describe("scoreComplexity", () => {
  it("returns 0 for a simple message", () => {
    expect(scoreComplexity("what time is it?")).toBe(0);
  });

  it("scores refactor-class keywords high", () => {
    expect(scoreComplexity("refactor the auth module")).toBeGreaterThanOrEqual(3);
  });

  it("scores schema + multi-file together higher", () => {
    const score = scoreComplexity("migrate the database schema across all files");
    expect(score).toBeGreaterThanOrEqual(5);
  });

  it("caps at 10", () => {
    const heavy =
      "refactor the database schema across all files and rewrite the architecture somehow somehow";
    expect(scoreComplexity(heavy)).toBe(10);
  });

  it("default threshold is 5", () => {
    expect(DEFAULT_COMPLEXITY_THRESHOLD).toBe(5);
  });
});

describe("isPlanModeActive", () => {
  it("returns false when no system message", () => {
    const msgs: Message[] = [{ role: "user", content: "hi" }];
    expect(isPlanModeActive(msgs)).toBe(false);
  });

  it("returns false when system does not contain PLAN_MARKER", () => {
    const msgs: Message[] = [{ role: "system", content: "You are Argo." }];
    expect(isPlanModeActive(msgs)).toBe(false);
  });

  it("returns true when system contains PLAN_MARKER", () => {
    const msgs: Message[] = [{ role: "system", content: `base\n${PLAN_MARKER}\n⚡ plan mode` }];
    expect(isPlanModeActive(msgs)).toBe(true);
  });
});

describe("shouldSuggestPlanMode", () => {
  const noplan: Message[] = [{ role: "system", content: "You are Argo." }];
  const env = {};

  it("fires when score >= threshold and plan mode is off", () => {
    expect(shouldSuggestPlanMode(6, noplan, env)).toBe(true);
  });

  it("does not fire when score is below threshold", () => {
    expect(shouldSuggestPlanMode(4, noplan, env)).toBe(false);
  });

  it("does not fire when plan mode is already on", () => {
    const withPlan: Message[] = [{ role: "system", content: `base\n${PLAN_MARKER}` }];
    expect(shouldSuggestPlanMode(9, withPlan, env)).toBe(false);
  });

  it("does not fire when threshold is 0 (disabled)", () => {
    expect(shouldSuggestPlanMode(9, noplan, { ARGO_COMPLEXITY_GATE_THRESHOLD: "0" })).toBe(false);
  });

  it("respects ARGO_COMPLEXITY_GATE_THRESHOLD override", () => {
    expect(shouldSuggestPlanMode(3, noplan, { ARGO_COMPLEXITY_GATE_THRESHOLD: "3" })).toBe(true);
    expect(shouldSuggestPlanMode(2, noplan, { ARGO_COMPLEXITY_GATE_THRESHOLD: "3" })).toBe(false);
  });
});

describe("buildComplexityNote", () => {
  it("includes the score and mentions /planmode", () => {
    const note = buildComplexityNote(7);
    expect(note).toContain("7/10");
    expect(note).toContain("/planmode");
  });
});
