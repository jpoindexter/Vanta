import { describe, expect, it } from "vitest";
import { containsPoint, hitTest, type Region } from "./hit-test.js";

const box = (id: string, x: number, y: number, w: number, h: number): Region => ({ id, x, y, w, h });

describe("containsPoint", () => {
  const region = box("a", 2, 3, 4, 2); // covers cols 2..5, rows 3..4

  it("is true on the inclusive top-left corner", () => {
    expect(containsPoint(region, 2, 3)).toBe(true);
  });

  it("is true on the inclusive bottom-right corner", () => {
    expect(containsPoint(region, 5, 4)).toBe(true);
  });

  it("is false just outside each edge", () => {
    expect(containsPoint(region, 1, 3)).toBe(false); // left of
    expect(containsPoint(region, 6, 3)).toBe(false); // right of
    expect(containsPoint(region, 2, 2)).toBe(false); // above
    expect(containsPoint(region, 2, 5)).toBe(false); // below
  });

  it("is false for a zero or negative sized box", () => {
    expect(containsPoint(box("z", 0, 0, 0, 5), 0, 0)).toBe(false);
    expect(containsPoint(box("z", 0, 0, 5, 0), 0, 0)).toBe(false);
  });
});

describe("hitTest", () => {
  it("returns the region containing the point", () => {
    const regions = [box("a", 0, 0, 3, 3), box("b", 10, 10, 3, 3)];
    expect(hitTest(regions, 1, 1)?.id).toBe("a");
    expect(hitTest(regions, 11, 11)?.id).toBe("b");
  });

  it("returns null when the point is outside every region", () => {
    const regions = [box("a", 0, 0, 3, 3)];
    expect(hitTest(regions, 50, 50)).toBeNull();
  });

  it("returns null for an empty registry", () => {
    expect(hitTest([], 0, 0)).toBeNull();
  });

  it("returns the last-registered region on overlap (topmost wins)", () => {
    const regions = [box("under", 0, 0, 5, 5), box("over", 0, 0, 5, 5)];
    expect(hitTest(regions, 2, 2)?.id).toBe("over");
  });

  it("falls through to the region below when the overlay does not cover the point", () => {
    const under = box("under", 0, 0, 10, 10);
    const over = box("over", 0, 0, 3, 3); // small overlay top-left only
    const regions = [under, over];
    expect(hitTest(regions, 1, 1)?.id).toBe("over"); // inside the overlay
    expect(hitTest(regions, 8, 8)?.id).toBe("under"); // outside it
  });
});
