import { describe, expect, it } from "vitest";
import { TIER_SEP, splitStableVolatile } from "../prompt.js";
import { applyCacheHints, cacheHintsEnabled, excludeDynamicSections } from "./cache-hints.js";

const STABLE = "# Vanta\nstable rules tier\n\n---\n\nProject context block";
const VOLATILE = "Active goals:\n- [1] ship it\n\nSession started: 2026-06-20T00:00:00Z";
const FULL = `${STABLE}${TIER_SEP}${VOLATILE}`;

describe("excludeDynamicSections", () => {
  it("returns only the stable prefix, dropping the volatile tail", () => {
    expect(excludeDynamicSections(FULL)).toBe(STABLE);
  });

  it("matches splitStableVolatile's stable half exactly", () => {
    expect(excludeDynamicSections(FULL)).toBe(splitStableVolatile(FULL).stable);
  });

  it("returns a prompt with no volatile section unchanged", () => {
    const noVolatile = "# Vanta\nonly a stable tier, no separator";
    expect(excludeDynamicSections(noVolatile)).toBe(noVolatile);
  });
});

describe("cacheHintsEnabled", () => {
  it("is off by default (empty env)", () => {
    expect(cacheHintsEnabled({})).toBe(false);
  });

  it("is on when VANTA_EXCLUDE_DYNAMIC_PROMPT=1", () => {
    expect(cacheHintsEnabled({ VANTA_EXCLUDE_DYNAMIC_PROMPT: "1" })).toBe(true);
  });

  it("is on when VANTA_CACHE_HINTS=1", () => {
    expect(cacheHintsEnabled({ VANTA_CACHE_HINTS: "1" })).toBe(true);
  });

  it("ignores non-'1' values (0, true)", () => {
    expect(cacheHintsEnabled({ VANTA_CACHE_HINTS: "0" })).toBe(false);
    expect(cacheHintsEnabled({ VANTA_EXCLUDE_DYNAMIC_PROMPT: "true" })).toBe(false);
  });
});

describe("applyCacheHints", () => {
  it("disabled (default) → full prompt byte-identical", () => {
    expect(applyCacheHints(FULL, {})).toBe(FULL);
  });

  it("enabled → drops the volatile tail (stable prefix only)", () => {
    expect(applyCacheHints(FULL, { VANTA_CACHE_HINTS: "1" })).toBe(STABLE);
    expect(applyCacheHints(FULL, { VANTA_EXCLUDE_DYNAMIC_PROMPT: "1" })).toBe(STABLE);
  });

  it("enabled with no volatile section → unchanged either way", () => {
    const noVolatile = "# Vanta\nonly a stable tier";
    expect(applyCacheHints(noVolatile, { VANTA_CACHE_HINTS: "1" })).toBe(noVolatile);
    expect(applyCacheHints(noVolatile, {})).toBe(noVolatile);
  });
});
