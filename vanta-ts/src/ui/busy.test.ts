import { describe, it, expect } from "vitest";
import { busyLabel, contextPct } from "./busy.js";

describe("busyLabel", () => {
  it("cycles the asterisk frame every tick", () => {
    expect(busyLabel(0).frame).not.toBe(busyLabel(1).frame);
  });
  it("holds a verb across several frames, then rotates", () => {
    expect(busyLabel(0).verb).toBe(busyLabel(7).verb); // same verb within the window
    expect(busyLabel(0).verb).not.toBe(busyLabel(8).verb); // rotates after VERB_EVERY
  });
});

describe("contextPct", () => {
  it("computes a clamped integer fill", () => {
    expect(contextPct(1000, 4000)).toBe(25);
    expect(contextPct(8000, 4000)).toBe(100); // clamped
    expect(contextPct(500, 0)).toBe(0); // unknown window
  });
});
