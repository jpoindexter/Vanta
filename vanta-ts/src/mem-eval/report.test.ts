import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatMemReport, recordMemReport } from "./report.js";
import type { MemEvalReport } from "./types.js";

const REPORT: MemEvalReport = {
  k: 5,
  questions: 9,
  corpusSizes: { s5: 19, full: 38 },
  cells: [
    { mode: "lexical", noise: "s5", available: true, recallAtK: 0.8, byCategory: { temporal: 0.5 } },
    { mode: "lexical", noise: "full", available: true, recallAtK: 0.6, byCategory: { temporal: 0.33 } },
    { mode: "semantic", noise: "s5", available: false, recallAtK: 0, byCategory: {} },
    { mode: "semantic", noise: "full", available: false, recallAtK: 0, byCategory: {} },
  ],
};

describe("formatMemReport", () => {
  it("renders modes, noise columns, and percentages", () => {
    const out = formatMemReport(REPORT);
    expect(out).toContain("recall@5");
    expect(out).toContain("lexical");
    expect(out).toContain("80.0%");
    expect(out).toContain("s5");
  });

  it("shows an em dash for unavailable modes", () => {
    expect(formatMemReport(REPORT)).toContain("—");
  });
});

describe("recordMemReport", () => {
  it("writes the baseline JSON under .vanta", () => {
    const dir = mkdtempSync(join(tmpdir(), "memeval-"));
    try {
      const rel = recordMemReport(dir, REPORT);
      const parsed = JSON.parse(readFileSync(join(dir, rel), "utf8"));
      expect(parsed.k).toBe(5);
      expect(parsed.cells).toHaveLength(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
