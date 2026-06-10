import { describe, it, expect } from "vitest";
import { compactionReminder } from "./compaction-remind.js";

const NO_ENV: NodeJS.ProcessEnv = {};

describe("compactionReminder", () => {
  it("returns null below the default 70% threshold", () => {
    expect(compactionReminder(600, 1000, NO_ENV)).toBeNull();
  });

  it("returns a reminder at the threshold (70%)", () => {
    const note = compactionReminder(700, 1000, NO_ENV);
    expect(note).not.toBeNull();
    expect(note).toContain("%");
    expect(note).toContain("compress");
  });

  it("returns a reminder above the threshold", () => {
    const note = compactionReminder(900, 1000, NO_ENV);
    expect(note).toContain("%");
    expect(note).toContain("compress");
  });

  it("returns null when the window is zero", () => {
    expect(compactionReminder(900, 0, NO_ENV)).toBeNull();
  });

  it("returns null when the window is negative", () => {
    expect(compactionReminder(900, -1000, NO_ENV)).toBeNull();
  });

  it("respects VANTA_COMPACTION_REMIND_FRAC override (lower threshold fires earlier)", () => {
    const env: NodeJS.ProcessEnv = { VANTA_COMPACTION_REMIND_FRAC: "0.5" };
    expect(compactionReminder(600, 1000, env)).not.toBeNull(); // 60% ≥ 50%
    expect(compactionReminder(600, 1000, NO_ENV)).toBeNull(); // 60% < 70%
  });

  it("respects VANTA_COMPACTION_REMIND_FRAC override (higher threshold delays)", () => {
    const env: NodeJS.ProcessEnv = { VANTA_COMPACTION_REMIND_FRAC: "0.9" };
    expect(compactionReminder(800, 1000, env)).toBeNull(); // 80% < 90%
  });

  it("falls back to the default fraction when the override is not a positive number", () => {
    const env: NodeJS.ProcessEnv = { VANTA_COMPACTION_REMIND_FRAC: "nope" };
    expect(compactionReminder(800, 1000, env)).not.toBeNull(); // 80% ≥ default 70%
    expect(compactionReminder(600, 1000, env)).toBeNull(); // 60% < default 70%
  });

  it("clamps the displayed percentage below 100 even when over the window", () => {
    const note = compactionReminder(4500, 1000, NO_ENV); // 450% raw
    expect(note).toContain("99%");
    expect(note).not.toContain("450%");
  });
});
