import { describe, it, expect, afterEach } from "vitest";
import { busyLabel, contextPct, contextBar, kfmt, formatElapsed } from "./busy.js";
import { DEFAULT_SPINNER_VERBS } from "../term/spinner-verbs.js";

// Default threshold is 20_000ms and the tick→ms factor is 150, so tick ≥ 134 is
// stalled; a small tick stays under it.
const STALLED_TICK = 200;
const NORMAL_TICK = 5;

describe("busyLabel", () => {
  afterEach(() => { delete process.env.VANTA_SPINNER_VERBS; });

  it("cycles the asterisk frame every tick", () => {
    expect(busyLabel(0).frame).not.toBe(busyLabel(1).frame);
  });
  it("holds a verb across several frames, then rotates", () => {
    expect(busyLabel(0).verb).toBe(busyLabel(7).verb); // same verb within the window
    expect(busyLabel(0).verb).not.toBe(busyLabel(8).verb); // rotates after VERB_EVERY
  });
  it("resolves the verb from the built-in list by default", () => {
    expect(DEFAULT_SPINNER_VERBS).toContain(busyLabel(0).verb);
  });
  it("uses user-configured verbs from VANTA_SPINNER_VERBS", () => {
    process.env.VANTA_SPINNER_VERBS = "Cooking,Brewing";
    expect(busyLabel(0).verb).toBe("Cooking");   // first verb at tick 0
    expect(busyLabel(8).verb).toBe("Brewing");   // rotates after VERB_EVERY
    expect(busyLabel(16).verb).toBe("Cooking");  // wraps
  });
  it("has no suffix under the stall threshold", () => {
    expect(busyLabel(NORMAL_TICK).suffix).toBe("");
  });
  it("switches to a stalled glyph + still-working suffix past the threshold", () => {
    const stalled = busyLabel(STALLED_TICK);
    const normal = busyLabel(NORMAL_TICK);
    expect(stalled.frame).not.toBe(normal.frame); // distinct stalled glyph set
    expect(stalled.suffix).toContain("still working");
  });
});

describe("contextPct", () => {
  it("computes a clamped integer fill", () => {
    expect(contextPct(1000, 4000)).toBe(25);
    expect(contextPct(8000, 4000)).toBe(100); // clamped
    expect(contextPct(500, 0)).toBe(0); // unknown window
  });
});

describe("contextBar + kfmt", () => {
  it("renders a filled/empty block bar of fixed width", () => {
    expect(contextBar(0, 8)).toBe("░░░░░░░░");
    expect(contextBar(50, 8)).toBe("████░░░░");
    expect(contextBar(100, 8)).toBe("████████");
  });
  it("formats compact token counts", () => {
    expect(kfmt(450)).toBe("450");
    expect(kfmt(24000)).toBe("24k");
    expect(kfmt(1_200_000)).toBe("1.2M");
  });
});

describe("formatElapsed", () => {
  it("shows seconds under a minute, m + zero-padded seconds above", () => {
    expect(formatElapsed(9_000)).toBe("9s");
    expect(formatElapsed(69_000)).toBe("1m09s");
    expect(formatElapsed(605_000)).toBe("10m05s");
    expect(formatElapsed(-50)).toBe("0s"); // clamps negatives
  });
});
