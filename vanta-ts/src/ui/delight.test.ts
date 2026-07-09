import { describe, expect, it } from "vitest";
import {
  DELIGHT_ENV,
  REDUCED_MOTION_ENV,
  SIGNATURE_LINE,
  delightEnabled,
  delightMotionEnabled,
  prefersReducedMotion,
  signatureLine,
} from "./delight.js";

describe("delightEnabled", () => {
  it("is on for a normal TUI session", () => {
    expect(delightEnabled({}, true)).toBe(true);
  });

  it("stays out of non-TTY and bare/scripted contexts", () => {
    expect(delightEnabled({}, false)).toBe(false);
    expect(delightEnabled({ VANTA_BARE: "1" }, true)).toBe(false);
    expect(delightEnabled({ VANTA_SCRIPTING: "true" }, true)).toBe(false);
  });

  it("can be disabled explicitly", () => {
    expect(delightEnabled({ [DELIGHT_ENV]: "0" }, true)).toBe(false);
    expect(delightEnabled({ [DELIGHT_ENV]: "off" }, true)).toBe(false);
  });

  it("avoids CI and dumb terminal output", () => {
    expect(delightEnabled({ CI: "1" }, true)).toBe(false);
    expect(delightEnabled({ TERM: "dumb" }, true)).toBe(false);
  });
});

describe("reduced motion", () => {
  it("honors reduced-motion env settings", () => {
    expect(prefersReducedMotion({ [REDUCED_MOTION_ENV]: "1" })).toBe(true);
    expect(prefersReducedMotion({ VANTA_REDUCED_UI: "true" })).toBe(true);
    expect(prefersReducedMotion({ NO_COLOR: "1" })).toBe(true);
  });

  it("keeps motion on only when delight is enabled and motion is not reduced", () => {
    expect(delightMotionEnabled({}, true)).toBe(true);
    expect(delightMotionEnabled({ [REDUCED_MOTION_ENV]: "1" }, true)).toBe(false);
    expect(delightMotionEnabled({ VANTA_BARE: "1" }, true)).toBe(false);
  });
});

describe("signatureLine", () => {
  it("returns the signature line for interactive TUI", () => {
    expect(signatureLine({}, true)).toBe(SIGNATURE_LINE);
  });

  it("returns empty when delight is suppressed", () => {
    expect(signatureLine({ VANTA_BARE: "1" }, true)).toBe("");
    expect(signatureLine({}, false)).toBe("");
  });
});
