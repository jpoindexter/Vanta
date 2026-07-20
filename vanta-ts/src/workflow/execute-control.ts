import type { GraphNodeResult } from "./run-state.js";
import type { MatchRule } from "./schema.js";

export type WorkflowControlStatus = "done" | "paused" | "blocked" | "error" | "exhausted" | "cancelled";

export function resumeDecision(result: GraphNodeResult | undefined, resumePaused: boolean, rerun: boolean): { control: WorkflowControlStatus | null; rerun: boolean } {
  if (result?.status === "denied" && resumePaused) return { control: null, rerun: true };
  if (rerun) return { control: null, rerun };
  if (result?.status === "ok") return { control: "done", rerun };
  if (result?.status === "blocked") return { control: "blocked", rerun };
  if (result?.status === "denied") return { control: "paused", rerun };
  return { control: null, rerun };
}

export function resultControl(result: GraphNodeResult): WorkflowControlStatus | null {
  if (result.status === "blocked") return "blocked";
  if (result.status === "denied") return "paused";
  return result.status === "error" ? "error" : null;
}

export function matchesResult(rule: MatchRule, result: GraphNodeResult | undefined): boolean {
  if (!result) return false;
  if (rule.status && result.status !== rule.status) return false;
  if (rule.review && (result.review?.accepted ? "accepted" : "rejected") !== rule.review) return false;
  return rule.contains ? result.output.includes(rule.contains) : true;
}
