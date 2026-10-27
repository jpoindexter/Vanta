import type { AgentOutcome } from "../agent.js";
import type { ToolResult } from "../tools/types.js";

export function workerResultComplete(outcome: AgentOutcome): boolean {
  const incomplete = outcome.completionState !== undefined && !["verified", "unverified"].includes(outcome.completionState);
  return !outcome.needsEffectReview && outcome.stoppedReason === "done" && !incomplete;
}

/** A summary cannot establish that an incomplete worker left no partial effects. */
export function workerToolResult(outcome: AgentOutcome, output: string): ToolResult {
  if (!workerResultComplete(outcome)) {
    return { ok: false, output, effectDisposition: "unknown", verification: { status: "unverified" } };
  }
  return { ok: true, output, verification: { status: "unverified" } };
}

/** A parallel sibling's ordinary success cannot clear another worker's uncertainty. */
export function aggregateWorkerResults(results: readonly ToolResult[]): ToolResult {
  const output = results.map(result => result.output).join("\n\n");
  if (results.some(result => !result.ok || result.effectDisposition === "unknown")) {
    return { ok: false, output, effectDisposition: "unknown", verification: { status: "unverified" } };
  }
  return { ok: true, output, verification: { status: "unverified" } };
}
