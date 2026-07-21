import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureBrain, readRegion, writeRegion, brainDigest } from "./store.js";
import { isBrainRegion } from "./regions.js";

const VANTA_HOME = join(tmpdir(), "vanta-brain-store-test");
const env = { ...process.env, VANTA_HOME };

describe("brain store", () => {
  beforeEach(async () => {
    await rm(VANTA_HOME, { recursive: true, force: true });
  });
  afterEach(async () => {
    await rm(VANTA_HOME, { recursive: true, force: true });
  });

  it("seeds all regions on ensureBrain", async () => {
    await ensureBrain(env);
    expect((await readRegion("identity", env)) ?? "").toContain("I am Vanta");
    expect(await readRegion("user_model", env)).not.toBeNull();
    expect(await readRegion("mood", env)).not.toBeNull();
  });

  it("identity seed carries the neurodivergent-first value", async () => {
    await ensureBrain(env);
    const identity = (await readRegion("identity", env)) ?? "";
    expect(identity).toMatch(/neurodivergent/i);
    expect(identity).not.toMatch(/Jason|is autistic|has ADHD|has dyslexia/i);
    expect(identity).toMatch(/without requiring a diagnosis/i);
  });

  it("append adds to a region without clobbering", async () => {
    await writeRegion("user_model", "Prefers terse, pattern-based replies.", { env, append: true });
    await writeRegion("user_model", "Works in Valencia.", { env, append: true });
    const c = (await readRegion("user_model", env)) ?? "";
    expect(c).toContain("Prefers terse");
    expect(c).toContain("Works in Valencia");
  });

  it("replace rewrites a region", async () => {
    await writeRegion("mood", "Focused.", { env });
    const c = (await readRegion("mood", env)) ?? "";
    expect(c.trim()).toBe("Focused.");
  });

  it("brainDigest summarizes regions and caps length", async () => {
    await writeRegion("semantic", "x".repeat(5000), { env });
    const d = await brainDigest(env, 200);
    expect(d).toContain("Semantic Memory");
    expect(d).toContain("…"); // capped
  });

  it("isBrainRegion validates region names", () => {
    expect(isBrainRegion("identity")).toBe(true);
    expect(isBrainRegion("nonsense")).toBe(false);
  });
});
