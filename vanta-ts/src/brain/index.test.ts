import { describe, it, expect } from "vitest";
import { resolveBrain } from "./index.js";
import { liveBrain } from "./live.js";

describe("resolveBrain", () => {
  it("defaults to the live brain when unset", () => {
    expect(resolveBrain({})).toBe(liveBrain);
    expect(resolveBrain({}).id).toBe("live");
  });

  it("returns the live brain for live and default modes", () => {
    expect(resolveBrain({ VANTA_BRAIN: "live" })).toBe(liveBrain);
    expect(resolveBrain({ VANTA_BRAIN: "Default" })).toBe(liveBrain);
  });

  it("throws a clear error on an unknown brain", () => {
    expect(() => resolveBrain({ VANTA_BRAIN: "bogus" })).toThrow(/Unknown VANTA_BRAIN/);
  });

  it("exposes the full Brain surface", () => {
    const b = resolveBrain({});
    for (const m of ["readRegion", "writeRegion", "ensureBrain", "remember", "recall", "digest", "sweep", "health"]) {
      expect(typeof (b as unknown as Record<string, unknown>)[m]).toBe("function");
    }
  });
});
