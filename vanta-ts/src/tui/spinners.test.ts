import { describe, it, expect } from "vitest";
import { SPINNERS, spinnerFrames } from "./spinners.js";
import { ASTERISK_FRAMES } from "./figures.js";

describe("SPINNERS", () => {
  it("includes the asterisk growing-dot cycle from figures", () => {
    expect(SPINNERS.asterisk).toEqual([...ASTERISK_FRAMES]);
    expect(SPINNERS.asterisk).toContain("✻");
  });

  it("includes the classic braille spinners", () => {
    expect(SPINNERS.orbit.length).toBeGreaterThan(0);
    expect(SPINNERS.wave.length).toBeGreaterThan(0);
  });
});

describe("spinnerFrames", () => {
  it("defaults to orbit frames when VANTA_SPINNER is unset", () => {
    expect(spinnerFrames({})).toEqual(SPINNERS.orbit);
  });

  it("returns asterisk frames when VANTA_SPINNER=asterisk", () => {
    expect(spinnerFrames({ VANTA_SPINNER: "asterisk" })).toEqual(SPINNERS.asterisk);
  });

  it("falls back to orbit for unknown spinner names", () => {
    expect(spinnerFrames({ VANTA_SPINNER: "nope" })).toEqual(SPINNERS.orbit);
  });
});
