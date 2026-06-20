import { describe, it, expect } from "vitest";
import {
  shouldSuggestContextUpgrade,
  buildContextUpgradeNote,
  isExtendedContextModel,
  resolveContextUpgradeThreshold,
  DEFAULT_CONTEXT_UPGRADE_THRESHOLD,
} from "./context-upgrade.js";

const EMPTY: NodeJS.ProcessEnv = {};
const W = 200_000; // a typical (non-extended) Claude window

describe("shouldSuggestContextUpgrade", () => {
  it("suggests when usage is at/above the default threshold on a non-extended model", () => {
    // 0.85 * 200k = 170k
    expect(shouldSuggestContextUpgrade(170_000, W, "claude-sonnet-4-6", EMPTY)).toBe(true);
    expect(shouldSuggestContextUpgrade(190_000, W, "claude-sonnet-4-6", EMPTY)).toBe(true);
  });

  it("does NOT suggest below the threshold (no behavior change)", () => {
    expect(shouldSuggestContextUpgrade(169_999, W, "claude-sonnet-4-6", EMPTY)).toBe(false);
    expect(shouldSuggestContextUpgrade(50_000, W, "claude-sonnet-4-6", EMPTY)).toBe(false);
  });

  it("does NOT suggest when the model is already extended-context, even when full", () => {
    expect(shouldSuggestContextUpgrade(900_000, 1_000_000, "claude-opus-4-8[1m]", EMPTY)).toBe(false);
    expect(shouldSuggestContextUpgrade(950_000, 1_000_000, "gemini-2.5-pro", EMPTY)).toBe(false);
  });

  it("threshold 0 disables the gate", () => {
    const env = { VANTA_CONTEXT_UPGRADE_THRESHOLD: "0" };
    expect(shouldSuggestContextUpgrade(199_000, W, "claude-sonnet-4-6", env)).toBe(false);
  });

  it("honors a VANTA_CONTEXT_UPGRADE_THRESHOLD env override", () => {
    const env = { VANTA_CONTEXT_UPGRADE_THRESHOLD: "0.5" };
    // 0.5 * 200k = 100k → 120k trips at 0.5 but not at the 0.85 default
    expect(shouldSuggestContextUpgrade(120_000, W, "claude-sonnet-4-6", env)).toBe(true);
    expect(shouldSuggestContextUpgrade(120_000, W, "claude-sonnet-4-6", EMPTY)).toBe(false);
  });

  it("does not suggest on degenerate inputs (zero/negative window or usage)", () => {
    expect(shouldSuggestContextUpgrade(170_000, 0, "claude-sonnet-4-6", EMPTY)).toBe(false);
    expect(shouldSuggestContextUpgrade(0, W, "claude-sonnet-4-6", EMPTY)).toBe(false);
    expect(shouldSuggestContextUpgrade(-1, W, "claude-sonnet-4-6", EMPTY)).toBe(false);
  });

  it("fires exactly at the threshold boundary (>=)", () => {
    expect(shouldSuggestContextUpgrade(170_000, W, "gpt-4o", EMPTY)).toBe(true);
  });
});

describe("isExtendedContextModel", () => {
  it("detects 1m/2m suffix variants (case-insensitive)", () => {
    expect(isExtendedContextModel("claude-opus-4-8[1m]")).toBe(true);
    expect(isExtendedContextModel("CLAUDE-OPUS-4-8[1M]")).toBe(true);
    expect(isExtendedContextModel("some-model-2m")).toBe(true);
  });
  it("detects native long-context Gemini families", () => {
    expect(isExtendedContextModel("gemini-2.5-pro")).toBe(true);
    expect(isExtendedContextModel("gemini-1.5-pro")).toBe(true);
  });
  it("returns false for standard-window models", () => {
    expect(isExtendedContextModel("claude-sonnet-4-6")).toBe(false);
    expect(isExtendedContextModel("gpt-4o")).toBe(false);
    expect(isExtendedContextModel("gemini-2.5-flash")).toBe(false);
  });
});

describe("resolveContextUpgradeThreshold", () => {
  it("defaults to 0.85 when unset", () => {
    expect(resolveContextUpgradeThreshold(EMPTY)).toBe(DEFAULT_CONTEXT_UPGRADE_THRESHOLD);
    expect(DEFAULT_CONTEXT_UPGRADE_THRESHOLD).toBe(0.85);
  });
  it("returns 0 only when explicitly set to 0 (disable)", () => {
    expect(resolveContextUpgradeThreshold({ VANTA_CONTEXT_UPGRADE_THRESHOLD: "0" })).toBe(0);
  });
  it("falls back to the default for out-of-range / non-numeric values", () => {
    expect(resolveContextUpgradeThreshold({ VANTA_CONTEXT_UPGRADE_THRESHOLD: "2" })).toBe(0.85);
    expect(resolveContextUpgradeThreshold({ VANTA_CONTEXT_UPGRADE_THRESHOLD: "-1" })).toBe(0.85);
    expect(resolveContextUpgradeThreshold({ VANTA_CONTEXT_UPGRADE_THRESHOLD: "abc" })).toBe(0.85);
    expect(resolveContextUpgradeThreshold({ VANTA_CONTEXT_UPGRADE_THRESHOLD: "" })).toBe(0.85);
  });
});

describe("buildContextUpgradeNote", () => {
  it("is a single line that names an extended-context option", () => {
    const note = buildContextUpgradeNote("claude-sonnet-4-6");
    expect(note).not.toContain("\n");
    expect(note.toLowerCase()).toContain("extended-context");
    expect(note).toContain("/model");
  });
  it("names a family-appropriate variant", () => {
    expect(buildContextUpgradeNote("claude-sonnet-4-6")).toContain("[1m]");
    expect(buildContextUpgradeNote("gemini-2.5-flash").toLowerCase()).toContain("gemini");
    expect(buildContextUpgradeNote("gpt-4o").toLowerCase()).toContain("gpt");
    expect(buildContextUpgradeNote("llama-3.3").toLowerCase()).toContain("1m-token-context");
  });
});
