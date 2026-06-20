import { describe, it, expect } from "vitest";
import { resolveTierModel, isTierKeyword } from "./tier-override.js";

// The catalogued defaults this slice must preserve when no env override is set.
// These are the curated-first Anthropic model ids per tier in catalog.ts; if the
// catalog's lead model for a tier changes, this test should change with it.
const CATALOG_DEFAULTS = {
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5",
} as const;

describe("isTierKeyword", () => {
  it("returns true for each tier keyword", () => {
    expect(isTierKeyword("opus")).toBe(true);
    expect(isTierKeyword("sonnet")).toBe(true);
    expect(isTierKeyword("haiku")).toBe(true);
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(isTierKeyword("OPUS")).toBe(true);
    expect(isTierKeyword("  Sonnet ")).toBe(true);
  });

  it("returns false for a concrete model id or unrelated string", () => {
    expect(isTierKeyword("claude-opus-4-8")).toBe(false);
    expect(isTierKeyword("gpt-4o-mini")).toBe(false);
    expect(isTierKeyword("")).toBe(false);
  });
});

describe("resolveTierModel", () => {
  it("honors the env override for each tier", () => {
    const env = {
      VANTA_MODEL_OPUS: "claude-opus-4-8",
      VANTA_MODEL_SONNET: "claude-sonnet-4-6",
      VANTA_MODEL_HAIKU: "claude-haiku-4-5",
    } as NodeJS.ProcessEnv;
    expect(resolveTierModel("opus", env)).toBe("claude-opus-4-8");
    expect(resolveTierModel("sonnet", env)).toBe("claude-sonnet-4-6");
    expect(resolveTierModel("haiku", env)).toBe("claude-haiku-4-5");
  });

  it("uses an arbitrary pinned id from env (not just the catalog default)", () => {
    const env = { VANTA_MODEL_OPUS: "claude-opus-4-1" } as NodeJS.ProcessEnv;
    expect(resolveTierModel("opus", env)).toBe("claude-opus-4-1");
  });

  it("only the targeted tier's override applies; others fall back", () => {
    const env = { VANTA_MODEL_SONNET: "my-pinned-sonnet" } as NodeJS.ProcessEnv;
    expect(resolveTierModel("sonnet", env)).toBe("my-pinned-sonnet");
    expect(resolveTierModel("opus", env)).toBe(CATALOG_DEFAULTS.opus);
    expect(resolveTierModel("haiku", env)).toBe(CATALOG_DEFAULTS.haiku);
  });

  it("falls back to the catalogued default when the tier env var is unset", () => {
    const env = {} as NodeJS.ProcessEnv;
    expect(resolveTierModel("opus", env)).toBe(CATALOG_DEFAULTS.opus);
    expect(resolveTierModel("sonnet", env)).toBe(CATALOG_DEFAULTS.sonnet);
    expect(resolveTierModel("haiku", env)).toBe(CATALOG_DEFAULTS.haiku);
  });

  it("treats an empty or whitespace-only override as unset (catalog default)", () => {
    expect(resolveTierModel("opus", { VANTA_MODEL_OPUS: "" } as NodeJS.ProcessEnv)).toBe(
      CATALOG_DEFAULTS.opus,
    );
    expect(resolveTierModel("haiku", { VANTA_MODEL_HAIKU: "   " } as NodeJS.ProcessEnv)).toBe(
      CATALOG_DEFAULTS.haiku,
    );
  });

  it("is case-insensitive on the tier keyword", () => {
    const env = { VANTA_MODEL_OPUS: "pinned" } as NodeJS.ProcessEnv;
    expect(resolveTierModel("OPUS", env)).toBe("pinned");
    expect(resolveTierModel("  Haiku ", {} as NodeJS.ProcessEnv)).toBe(CATALOG_DEFAULTS.haiku);
  });

  it("returns null for a non-tier string (caller keeps literal-model behavior)", () => {
    expect(resolveTierModel("claude-opus-4-8", {} as NodeJS.ProcessEnv)).toBeNull();
    expect(resolveTierModel("gpt-4o-mini", {} as NodeJS.ProcessEnv)).toBeNull();
    expect(resolveTierModel("", {} as NodeJS.ProcessEnv)).toBeNull();
  });
});
