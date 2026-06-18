import { describe, expect, it } from "vitest";
import { parseMetricOutput } from "./metric.js";

describe("parseMetricOutput", () => {
  it("uses the last numeric value printed by a metric command", () => {
    expect(parseMetricOutput("baseline 4\nscore: 7.5\n")).toBe(7.5);
  });

  it("throws when the metric command prints no number", () => {
    expect(() => parseMetricOutput("all good")).toThrow(/numeric score/);
  });
});
