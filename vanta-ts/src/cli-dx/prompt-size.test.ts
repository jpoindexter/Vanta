import { describe, it, expect } from "vitest";
import { formatSizes } from "./prompt-size.js";

describe("formatSizes", () => {
  it("sorts parts largest-first, shows a total, and computes percentages", () => {
    const out = formatSizes([
      { label: "system prompt", bytes: 1000 },
      { label: "tool schemas", bytes: 3000 },
    ]);
    const lines = out.split("\n");
    // tool schemas (3000) sorts before system prompt (1000) — check the data rows
    // by byte value (the header line mentions both labels).
    const toolIdx = lines.findIndex((l) => l.includes("3,000 B"));
    const promptIdx = lines.findIndex((l) => l.includes("1,000 B"));
    expect(toolIdx).toBeGreaterThanOrEqual(0);
    expect(toolIdx).toBeLessThan(promptIdx);
    expect(out).toContain("TOTAL");
    expect(out).toContain("4,000 B");
    expect(out).toContain("1,000 tok"); // total 4000/4 (padded after the ~)
    expect(out).toContain("75%"); // 3000/4000
  });

  it("handles an empty part list without dividing by zero", () => {
    expect(() => formatSizes([])).not.toThrow();
  });
});
