import { describe, it, expect } from "vitest";
import { planColumns, clipTo } from "./width.js";

describe("planColumns", () => {
  it("sizes the name column to the longest label plus a gap", () => {
    const { nameCol } = planColumns(["a", "longer-label"], { width: 120, gap: 2 });
    expect(nameCol).toBe("longer-label".length + 2);
  });

  it("caps the name column so one long entry can't eat the row", () => {
    const { nameCol } = planColumns(["x".repeat(80)], { width: 120, nameCap: 32 });
    expect(nameCol).toBe(32);
  });

  it("gives the description the rest of the width (responsive, not a fixed clip)", () => {
    const wide = planColumns(["cmd"], { width: 200 }).descW;
    const narrow = planColumns(["cmd"], { width: 80 }).descW;
    expect(wide).toBeGreaterThan(narrow); // wider terminal → more room, not a hardcoded 48
  });

  it("floors the description width so it stays legible on a narrow terminal", () => {
    const { descW } = planColumns(["a-fairly-long-command"], { width: 30, minDesc: 24 });
    expect(descW).toBe(24);
  });

  it("handles an empty label set without throwing", () => {
    expect(() => planColumns([], { width: 100 })).not.toThrow();
  });
});

describe("clipTo", () => {
  it("leaves a string that fits untouched", () => {
    expect(clipTo("short", 20)).toBe("short");
  });
  it("ellipsis-clips an overflowing string to the width", () => {
    const out = clipTo("a".repeat(50), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith("…")).toBe(true);
  });
});
