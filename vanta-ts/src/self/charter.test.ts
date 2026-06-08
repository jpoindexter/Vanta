import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureCharter, charterTier, DEFAULT_CHARTER } from "./charter.js";

describe("charter", () => {
  it("DEFAULT_CHARTER contains should/should-not sections", () => {
    expect(DEFAULT_CHARTER).toContain("I should");
    expect(DEFAULT_CHARTER).toContain("I should not");
    expect(DEFAULT_CHARTER).toContain("inspectable");
  });

  it("ensureCharter creates the charter file when missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "charter-test-"));
    try {
      const content = await ensureCharter(dir);
      expect(content).toContain("I should");
      // Second call returns existing file unchanged
      const content2 = await ensureCharter(dir);
      expect(content2).toBe(content);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("charterTier wraps the charter in a labelled prompt section", () => {
    const tier = charterTier("## test charter");
    expect(tier).toContain("values charter");
    expect(tier).toContain("## test charter");
  });

  it("charterTier returns empty string for empty input", () => {
    expect(charterTier("")).toBe("");
    expect(charterTier("   ")).toBe("");
  });
});
