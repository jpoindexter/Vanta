import { describe, it, expect } from "vitest";
import { busyLabel, contextPct, contextBar, kfmt } from "./busy.js";

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
