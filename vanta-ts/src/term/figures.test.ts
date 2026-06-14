import { describe, it, expect } from "vitest";
import { GLYPHS, ASTERISK_FRAMES, SPINNER_VERBS } from "./figures.js";

describe("figures", () => {
  it("GLYPHS contains the required design-language glyphs", () => {
    expect(GLYPHS.dot).toBe("⏺");
    expect(GLYPHS.pointer).toBe("❯");
    expect(GLYPHS.asterisk).toBe("✻");
    expect(GLYPHS.check).toBe("✔");
    expect(GLYPHS.cross).toBe("✘");
    expect(GLYPHS.play).toBe("▶");
  });

  it("ASTERISK_FRAMES is a non-empty cycle", () => {
    expect(ASTERISK_FRAMES.length).toBeGreaterThan(0);
    expect(ASTERISK_FRAMES).toContain("✻");
  });

  it("SPINNER_VERBS contains at least one verb", () => {
    expect(SPINNER_VERBS.length).toBeGreaterThan(0);
    for (const v of SPINNER_VERBS) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
