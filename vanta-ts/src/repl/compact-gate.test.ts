import { describe, it, expect } from "vitest";
import { compactionDisabled } from "./compact-gate.js";

const env = (o: Record<string, string>): NodeJS.ProcessEnv => o as NodeJS.ProcessEnv;

describe("compactionDisabled", () => {
  it("is false when neither flag is set", () => {
    expect(compactionDisabled(env({}))).toBe(false);
  });

  it("is true when VANTA_DISABLE_COMPACT is exactly '1'", () => {
    expect(compactionDisabled(env({ VANTA_DISABLE_COMPACT: "1" }))).toBe(true);
  });

  it("is true when the unprefixed DISABLE_COMPACT is exactly '1'", () => {
    expect(compactionDisabled(env({ DISABLE_COMPACT: "1" }))).toBe(true);
  });

  it("is false for any value other than '1' (strict, not truthy)", () => {
    expect(compactionDisabled(env({ VANTA_DISABLE_COMPACT: "0" }))).toBe(false);
    expect(compactionDisabled(env({ VANTA_DISABLE_COMPACT: "true" }))).toBe(false);
    expect(compactionDisabled(env({ DISABLE_COMPACT: "yes" }))).toBe(false);
  });
});
