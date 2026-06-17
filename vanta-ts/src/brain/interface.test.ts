import { describe, it, expect } from "vitest";
import { resolveBrain } from "./interface.js";

// The Brain port resolver: live by default, swappable by env, never throws.

describe("resolveBrain", () => {
  it("returns the live adapter by default", () => {
    expect(resolveBrain({}).id).toBe("live");
  });

  it("honors VANTA_BRAIN and falls back to live for unknown values", () => {
    expect(resolveBrain({ VANTA_BRAIN: "live" }).id).toBe("live");
    expect(resolveBrain({ VANTA_BRAIN: "does-not-exist" }).id).toBe("live");
  });

  it("exposes the full port surface", () => {
    const b = resolveBrain({});
    for (const m of ["read", "write", "remember", "recall", "digest", "health"] as const) {
      expect(typeof b[m]).toBe("function");
    }
  });
});
