import { describe, it, expect } from "vitest";
import { formatTally } from "./turn-metrics.js";

describe("formatTally", () => {
  it("returns null when the provider reported no usage", () => {
    expect(formatTally(undefined)).toBeNull();
  });
  it("formats input/output totals", () => {
    expect(formatTally({ inputTokens: 1200, outputTokens: 300 })).toBe("  1,500 tok · 1,200 in · 300 out");
  });
  it("appends saved tokens when present", () => {
    expect(formatTally({ inputTokens: 100, outputTokens: 50 }, 2000)).toContain("2,000 saved");
  });
  it("omits the saved suffix at zero", () => {
    expect(formatTally({ inputTokens: 100, outputTokens: 50 }, 0)).not.toContain("saved");
  });
});
