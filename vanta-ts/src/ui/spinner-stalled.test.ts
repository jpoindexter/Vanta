import { describe, it, expect, afterEach } from "vitest";
import {
  isStalled,
  compactDuration,
  stalledLabel,
  spinnerFrame,
  spinnerPresentation,
} from "./spinner-stalled.js";
import { ASTERISK_FRAMES, STALLED_FRAMES } from "../term/figures.js";

const ENV_VAR = "VANTA_STALL_SPINNER_MS";

afterEach(() => {
  delete process.env[ENV_VAR];
});

describe("isStalled", () => {
  it("is false under the default ~20s threshold (normal spinner)", () => {
    expect(isStalled(0)).toBe(false);
    expect(isStalled(19_999)).toBe(false);
  });
  it("is true at or past the default threshold", () => {
    expect(isStalled(20_000)).toBe(true);
    expect(isStalled(45_000)).toBe(true);
  });
  it("never stalls on negative/zero elapsed (a fresh turn)", () => {
    expect(isStalled(-1)).toBe(false);
    expect(isStalled(0)).toBe(false);
  });
  it("honors an explicit threshold override arg", () => {
    expect(isStalled(5_000, 4_000)).toBe(true);
    expect(isStalled(5_000, 10_000)).toBe(false);
  });
  it("honors the VANTA_STALL_SPINNER_MS env override", () => {
    process.env[ENV_VAR] = "3000";
    expect(isStalled(3_500)).toBe(true);
    expect(isStalled(2_500)).toBe(false);
  });
  it("ignores a non-numeric or non-positive env value (falls back to default)", () => {
    process.env[ENV_VAR] = "nope";
    expect(isStalled(19_999)).toBe(false);
    process.env[ENV_VAR] = "0";
    expect(isStalled(19_999)).toBe(false);
  });
});

describe("compactDuration", () => {
  it("renders seconds under a minute", () => {
    expect(compactDuration(24_000)).toBe("24s");
    expect(compactDuration(0)).toBe("0s");
  });
  it("renders compact minutes at and past 60s", () => {
    expect(compactDuration(60_000)).toBe("1m");
    expect(compactDuration(90_000)).toBe("1m");
    expect(compactDuration(125_000)).toBe("2m");
  });
  it("clamps negatives to 0s", () => {
    expect(compactDuration(-500)).toBe("0s");
  });
});

describe("stalledLabel", () => {
  it("formats the still-working suffix with a compact duration", () => {
    expect(stalledLabel(24_000)).toBe("(still working… 24s)");
    expect(stalledLabel(120_000)).toBe("(still working… 2m)");
  });
});

describe("spinnerFrame", () => {
  it("uses the normal asterisk frames under the threshold", () => {
    expect(spinnerFrame(5_000, 0)).toBe(ASTERISK_FRAMES[0]);
    expect(spinnerFrame(5_000, 1)).toBe(ASTERISK_FRAMES[1]);
  });
  it("uses the distinct stalled frame set past the threshold", () => {
    expect(spinnerFrame(30_000, 0)).toBe(STALLED_FRAMES[0]);
    expect(spinnerFrame(30_000, 1)).toBe(STALLED_FRAMES[1]);
  });
  it("rotates the frame by tick (wraps around each set)", () => {
    expect(spinnerFrame(5_000, 0)).not.toBe(spinnerFrame(5_000, 1));
    expect(spinnerFrame(5_000, ASTERISK_FRAMES.length)).toBe(spinnerFrame(5_000, 0));
    expect(spinnerFrame(30_000, STALLED_FRAMES.length)).toBe(spinnerFrame(30_000, 0));
  });
  it("normal and stalled frame sets are visually distinct", () => {
    expect(spinnerFrame(5_000, 0)).not.toBe(spinnerFrame(30_000, 0));
  });
  it("honors the threshold override option", () => {
    expect(spinnerFrame(5_000, 0, { thresholdMs: 4_000 })).toBe(STALLED_FRAMES[0]);
  });
  it("treats negative ticks as 0", () => {
    expect(spinnerFrame(5_000, -3)).toBe(ASTERISK_FRAMES[0]);
  });
});

describe("spinnerPresentation", () => {
  it("under the threshold → normal glyph + no suffix (current behavior)", () => {
    const p = spinnerPresentation(5_000, 2);
    expect(p.glyph).toBe(ASTERISK_FRAMES[2]);
    expect(p.suffix).toBe("");
  });
  it("past the threshold → stalled glyph + still-working suffix", () => {
    const p = spinnerPresentation(24_000, 1);
    expect(p.glyph).toBe(STALLED_FRAMES[1]);
    expect(p.suffix).toBe("(still working… 24s)");
  });
  it("the suffix duration tracks elapsed time", () => {
    expect(spinnerPresentation(65_000, 0).suffix).toBe("(still working… 1m)");
  });
});
