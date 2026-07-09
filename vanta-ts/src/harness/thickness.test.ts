import { describe, expect, it } from "vitest";
import {
  auditHarnessThickness,
  formatThicknessReport,
  parseThicknessRuns,
  removeCandidateLine,
  thicknessTrend,
} from "./thickness.js";

describe("harness thickness audit", () => {
  it("finds explicit scaffolding markers and long hard rules", () => {
    const run = auditHarnessThickness([
      {
        path: "PROGRAM.md",
        text: [
          "TODO remove this scaffold after the model internalizes the behavior.",
          "Never claim that a task is complete without verified tool output proving the exact user-facing behavior in the real path, with enough observed evidence to distinguish compiled plumbing from actual operator-visible behavior.",
        ].join("\n"),
      },
    ], new Date("2026-07-09T00:00:00.000Z"));

    expect(run.metrics.sourceCount).toBe(1);
    expect(run.metrics.hardRuleLines).toBe(1);
    expect(run.candidates.some((c) => c.kind === "explicit-marker")).toBe(true);
    expect(run.candidates.some((c) => c.kind === "hard-rule")).toBe(true);
  });

  it("flags duplicate hard rules across sources", () => {
    const text = "Never run destructive commands without approval.";
    const run = auditHarnessThickness([
      { path: "SOUL.md", text },
      { path: "AGENTS.md", text },
    ]);
    expect(run.candidates.filter((c) => c.kind === "duplicate-rule")).toHaveLength(2);
  });

  it("computes trend from previous total bytes", () => {
    const prev = auditHarnessThickness([{ path: "a", text: "x".repeat(100) }]);
    const curr = auditHarnessThickness([{ path: "a", text: "x".repeat(50) }]);
    expect(thicknessTrend(curr, prev)).toMatchObject({ direction: "down", deltaBytes: -50 });
  });

  it("parses JSONL history and skips malformed rows", () => {
    const runs = parseThicknessRuns('bad\n{"ts":"t","metrics":{"totalBytes":10},"candidates":[]}\n');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.metrics.totalBytes).toBe(10);
  });

  it("formats metrics and top candidates", () => {
    const run = auditHarnessThickness([{ path: "PROGRAM.md", text: "TODO prune this scaffold." }]);
    const out = formatThicknessReport(run, thicknessTrend(run), 1);
    expect(out).toContain("Harness Thickness Audit");
    expect(out).toContain("prune candidates: 1");
    expect(out).toContain("PROGRAM.md:1");
    expect(out).toContain("vanta harness-thickness remove PROGRAM.md:1");
  });

  it("removes only a matching candidate line", () => {
    const result = removeCandidateLine("keep\nTODO prune this scaffold.\nkeep2\n", 2, "TODO prune");
    expect(result).toMatchObject({ ok: true, removed: "TODO prune this scaffold." });
    if (result.ok) expect(result.text).toBe("keep\nkeep2\n");
  });

  it("refuses to remove when the expected text does not match", () => {
    const result = removeCandidateLine("keep\nNever delete me\n", 2, "TODO prune");
    expect(result).toMatchObject({ ok: false });
  });
});
