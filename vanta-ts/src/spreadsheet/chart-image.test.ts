import { describe, expect, it } from "vitest";
import { renderChartPng } from "./chart-image.js";

describe("spreadsheet chart renderer", () => {
  it("renders bounded bar and line series as PNG images", () => {
    for (const type of ["bar", "line"] as const) {
      const image = renderChartPng(type, [[10, 20, 15], [8, 12, 18]]);
      expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(image.length).toBeGreaterThan(1_000);
    }
  });

  it("rejects negative, empty, and oversized chart inputs", () => {
    expect(() => renderChartPng("bar", [[1, -1]])).toThrow("negative");
    expect(() => renderChartPng("line", [[]])).toThrow("two");
    expect(() => renderChartPng("line", [[1], [2]])).toThrow("two points");
    expect(() => renderChartPng("bar", [Array.from({ length: 51 }, () => 1)])).toThrow("up to 50");
  });
});
