import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractCorrectionRule, reflectAfterTurn } from "./reflect-correct.js";

describe("extractCorrectionRule", () => {
  it("returns null for a regular message", () => {
    expect(extractCorrectionRule("can you help me with this?")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractCorrectionRule("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(extractCorrectionRule("   ")).toBeNull();
  });

  it("returns a rule for 'no, that's wrong'", () => {
    const r = extractCorrectionRule("no, that's wrong — stop doing it that way");
    expect(r).not.toBeNull();
    expect(r).toMatch(/^Rule:/);
  });

  it("returns a rule for 'stop doing X'", () => {
    const r = extractCorrectionRule("stop doing that please");
    expect(r).not.toBeNull();
    expect(r).toMatch(/^Rule:/);
  });

  it("returns a rule for 'actually you should'", () => {
    const r = extractCorrectionRule("actually you should always check first");
    expect(r).not.toBeNull();
    expect(r).toMatch(/^Rule:/);
  });

  it("does not double-prefix when message already starts with 'Rule:'", () => {
    const r = extractCorrectionRule("Rule: always verify before committing");
    expect(r).toBe("Rule: always verify before committing");
    expect(r!.split("Rule:").length).toBe(2); // exactly one "Rule:" prefix
  });

  it("trims leading/trailing whitespace before processing", () => {
    const r = extractCorrectionRule("  no, that's incorrect — fix it  ");
    expect(r).not.toBeNull();
    // no leading/trailing whitespace in the output
    expect(r!.trimStart()).toBe(r!);
    expect(r!.trimEnd()).toBe(r!);
  });
});

describe("reflectAfterTurn", () => {
  const VANTA_HOME = join(tmpdir(), "vanta-reflect-correct-test");
  const env = { ...process.env, VANTA_HOME };

  beforeEach(async () => {
    await rm(VANTA_HOME, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(VANTA_HOME, { recursive: true, force: true });
  });

  it("does not throw for a non-correction message", async () => {
    await expect(reflectAfterTurn("thanks!", env)).resolves.toBeUndefined();
  });

  it("does not throw for a correction message", async () => {
    await expect(
      reflectAfterTurn("no, that's wrong — don't do that", env),
    ).resolves.toBeUndefined();
  });

  it("does not throw for an empty message", async () => {
    await expect(reflectAfterTurn("", env)).resolves.toBeUndefined();
  });

  it("does not throw when VANTA_HOME points to an unwritable path", async () => {
    const badEnv = { ...process.env, VANTA_HOME: "/nonexistent/path/that/cannot/be/created" };
    await expect(
      reflectAfterTurn("no, that's wrong — stop doing that", badEnv),
    ).resolves.toBeUndefined();
  });
});
