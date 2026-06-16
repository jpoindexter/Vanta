import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { aggregate, runEval, formatReport, type TaskRunner } from "./run.js";
import type { EvalResult, EvalTask } from "./types.js";

describe("aggregate", () => {
  it("computes pass@1 as the mean per-task pass fraction and sums tokens", () => {
    const results: EvalResult[] = [
      { id: "a", pass: true, passes: 2, runs: 2, detail: "", outputTokens: 100 },  // 1.0
      { id: "b", pass: false, passes: 0, runs: 2, detail: "", outputTokens: 50 },  // 0.0
      { id: "c", pass: false, passes: 1, runs: 2, detail: "", outputTokens: 25 },  // 0.5
    ];
    const r = aggregate(results);
    expect(r.total).toBe(3);
    expect(r.passed).toBe(1);          // only "a" solidly passed all rollouts
    expect(r.passAt1).toBe(50);        // mean(1.0, 0.0, 0.5) = 0.5
    expect(r.outputTokens).toBe(175);
  });

  it("is 0 (not NaN) for an empty corpus", () => {
    expect(aggregate([]).passAt1).toBe(0);
  });
});

describe("formatReport", () => {
  it("renders the one-line score summary", () => {
    const s = formatReport(aggregate([
      { id: "a", pass: true, passes: 1, runs: 1, detail: "", outputTokens: 1000 },
      { id: "b", pass: false, passes: 0, runs: 1, detail: "", outputTokens: 200 },
    ]));
    expect(s).toContain("pass@1: 50%");
    expect(s).toContain("(1/2)");
    expect(s).toContain("1,200");
  });
});

describe("runEval", () => {
  let baseDir: string;
  beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), "vanta-evalrun-")); });
  afterEach(() => { rmSync(baseDir, { recursive: true, force: true }); });

  it("scores a task by what the runner actually produced in the sandbox", async () => {
    const tasks: EvalTask[] = [
      { id: "writes", instruction: "make out.txt", check: { kind: "file_contains", path: "out.txt", text: "DONE" } },
      { id: "noop", instruction: "do nothing", check: { kind: "file_exists", path: "out.txt" } },
    ];
    // Runner that only satisfies the first task (writes the file in its sandbox).
    const run: TaskRunner = async (instruction, root) => {
      if (instruction.includes("make out.txt")) writeFileSync(join(root, "out.txt"), "DONE", "utf8");
      return { outputTokens: 10 };
    };
    const report = await runEval({ tasks, baseDir, run });
    expect(report.passAt1).toBe(50);
    expect(report.results.find((r) => r.id === "writes")?.pass).toBe(true);
    expect(report.results.find((r) => r.id === "noop")?.pass).toBe(false);
  });

  it("marks a task failed (not crash) when the runner throws", async () => {
    const tasks: EvalTask[] = [{ id: "boom", instruction: "x", check: { kind: "file_exists", path: "a" } }];
    const run: TaskRunner = async () => { throw new Error("provider exploded"); };
    const report = await runEval({ tasks, baseDir, run });
    expect(report.passed).toBe(0);
    expect(report.results[0]?.detail).toContain("run error");
  });
});
