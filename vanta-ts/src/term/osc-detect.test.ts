import { describe, it, expect } from "vitest";
import { parseOscRgb, luminance } from "./osc-detect.js";

describe("parseOscRgb", () => {
  it("parses 16-bit OSC response", () => {
    // xterm sends 4-hex-digit components for 16-bit precision
    expect(parseOscRgb("\x1b]11;rgb:0000/0000/0000\x07")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseOscRgb("\x1b]11;rgb:ffff/ffff/ffff\x07")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseOscRgb("\x1b]11;rgb:1c1c/1c1c/1c1c\x07")).toMatchObject({ r: expect.any(Number) });
  });
  it("parses 8-bit OSC response", () => {
    expect(parseOscRgb("\x1b]11;rgb:00/00/00\x07")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseOscRgb("\x1b]11;rgb:ff/ff/ff\x07")).toEqual({ r: 255, g: 255, b: 255 });
  });
  it("returns null for non-matching input", () => {
    expect(parseOscRgb("")).toBeNull();
    expect(parseOscRgb("no color here")).toBeNull();
  });
});

describe("luminance", () => {
  it("returns 0 for black", () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0);
  });
  it("returns ~1 for white", () => {
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 2);
  });
  it("classifies dark terminal background as dark", () => {
    // #1c1c1c — typical dark terminal background
    const rgb = parseOscRgb("\x1b]11;rgb:1c1c/1c1c/1c1c\x07")!;
    expect(luminance(rgb)).toBeLessThan(0.5);
  });
  it("classifies light terminal background as light", () => {
    // #f5f5f5 — typical light terminal background
    expect(luminance({ r: 245, g: 245, b: 245 })).toBeGreaterThan(0.5);
  });
});
