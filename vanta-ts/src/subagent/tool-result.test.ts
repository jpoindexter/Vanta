import { describe, expect, it } from "vitest";
import type { AgentOutcome } from "../agent.js";
import { aggregateWorkerResults, workerToolResult } from "./tool-result.js";

const base: AgentOutcome = { finalText: "Worker summary", iterations: 1, toolIterations: 0, stoppedReason: "done", completionState: "unverified",
  usage: { inputTokens: 13, outputTokens: 3 } };

describe("worker result truth", () => {
  it("keeps ordinary completed summaries successful but not verified", () => {
    expect(workerToolResult(base, "summary")).toEqual({ ok: true, output: "summary", verification: { status: "unverified" } });
    expect(workerToolResult({ ...base, completionState: "verified" }, "summary").verification).toEqual({ status: "unverified" });
    expect(base.usage).toEqual({ inputTokens: 13, outputTokens: 3 });
  });

  it("uses the uncertainty marker even if the summary and stop reason claim success", () => {
    expect(workerToolResult({ ...base, needsEffectReview: true, finalText: "All complete" }, "All complete"))
      .toMatchObject({ ok: false, effectDisposition: "unknown", verification: { status: "unverified" } });
  });

  it.each(["blocked", "interrupted", "max_iterations", "tool_budget"] as const)("does not infer no effects from %s", stoppedReason => {
    expect(workerToolResult({ ...base, stoppedReason }, `[worker:${stoppedReason}] summary`))
      .toMatchObject({ ok: false, effectDisposition: "unknown", verification: { status: "unverified" } });
  });

  it.each(["failed", "needs human", "waiting"] as const)("does not call a done/%s outcome successful", completionState => {
    expect(workerToolResult({ ...base, completionState }, "summary")).toMatchObject({ ok: false, effectDisposition: "unknown" });
  });
});

describe("parallel worker aggregation", () => {
  it("keeps an uncertain sibling dominant regardless of result order", () => {
    const good = workerToolResult(base, "good summary");
    const uncertain = workerToolResult({ ...base, needsEffectReview: true }, "uncertain summary");
    for (const results of [[good, uncertain], [uncertain, good]]) {
      const result = aggregateWorkerResults(results);
      expect(result).toMatchObject({ ok: false, effectDisposition: "unknown", verification: { status: "unverified" } });
      expect(result.output).toContain("good summary"); expect(result.output).toContain("uncertain summary");
    }
  });
});
