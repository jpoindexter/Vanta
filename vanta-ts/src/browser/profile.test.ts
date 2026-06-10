import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { browserProfileDir, usesPersistentProfile } from "./profile.js";

// NOTE: the live auth flow (`vanta browser auth`) and headless profile reuse
// need a real Chromium + a human login, so they are NOT unit-tested here. These
// tests cover only the pure profile-dir resolution and the mode decision.

describe("browserProfileDir", () => {
  it("defaults to <VANTA_HOME>/browser-profile", () => {
    const env = { VANTA_HOME: "/tmp/fake-home" } as NodeJS.ProcessEnv;
    expect(browserProfileDir(env)).toBe(join("/tmp/fake-home", "browser-profile"));
  });

  it("honors the VANTA_BROWSER_PROFILE override", () => {
    const env = {
      VANTA_HOME: "/tmp/fake-home",
      VANTA_BROWSER_PROFILE: "/custom/profile",
    } as NodeJS.ProcessEnv;
    expect(browserProfileDir(env)).toBe("/custom/profile");
  });

  it("ignores a blank override and falls back to the default", () => {
    const env = {
      VANTA_HOME: "/tmp/fake-home",
      VANTA_BROWSER_PROFILE: "   ",
    } as NodeJS.ProcessEnv;
    expect(browserProfileDir(env)).toBe(join("/tmp/fake-home", "browser-profile"));
  });
});

describe("usesPersistentProfile", () => {
  const env = { VANTA_HOME: "/tmp/fake-home" } as NodeJS.ProcessEnv;
  const neverExists = () => false;
  const alwaysExists = () => true;

  it("is true when VANTA_BROWSER_PROFILE_ENABLED=1 (even if the dir is absent)", () => {
    const flagged = { ...env, VANTA_BROWSER_PROFILE_ENABLED: "1" };
    expect(usesPersistentProfile(flagged, neverExists)).toBe(true);
  });

  it("is true when the profile dir already exists (post-auth reuse)", () => {
    expect(usesPersistentProfile(env, alwaysExists)).toBe(true);
  });

  it("is false when neither the flag is set nor the dir exists (default)", () => {
    expect(usesPersistentProfile(env, neverExists)).toBe(false);
  });

  it("only treats exactly '1' as enabling the flag", () => {
    const truthy = { ...env, VANTA_BROWSER_PROFILE_ENABLED: "true" };
    expect(usesPersistentProfile(truthy, neverExists)).toBe(false);
  });
});
