import type { CompletionCheck, WorkflowCompletion } from "./completion-contract.js";
import type { GraphRunState, GraphTerminal } from "./run-state.js";

export type BudgetStop = { state: "exhausted" | "cancelled"; reason: string; recoveryAction: string };
export type ControlStatus = "done" | "paused" | "blocked" | "error" | "exhausted" | "cancelled";

export function completionTerminal(contract: WorkflowCompletion, run: GraphRunState, at: string): GraphTerminal {
  if (contract.failure.any.some((check) => checkSatisfied(check, run))) {
    return terminal("failed", "failure condition matched", contract.failure.recoveryAction, at);
  }
  if (contract.pause.any.some((check) => checkSatisfied(check, run))) {
    return terminal("paused", "pause condition matched", contract.pause.recoveryAction, at);
  }
  const unmet = contract.success.all.filter((check) => !checkSatisfied(check, run)).map(checkLabel);
  if (!unmet.length) return terminal("succeeded", "all success evidence satisfied", undefined, at);
  return { ...terminal("failed", "success evidence was not satisfied", contract.failure.recoveryAction, at), unmet };
}

export function budgetStop(contract: WorkflowCompletion | undefined, run: GraphRunState, at: Date, aborted: boolean, includeStep = true): BudgetStop | null {
  if (aborted) return { state: "cancelled", reason: "operator cancellation requested", recoveryAction: contract?.cancelled.recoveryAction ?? "Restart the run when ready." };
  if (!contract) return null;
  const budget = contract.budgets;
  if (includeStep && run.attempts.length >= budget.maxSteps) return exhausted(`step budget reached (${budget.maxSteps})`, contract);
  if (at.getTime() - Date.parse(run.createdAt) >= budget.maxWallClockMs) return exhausted(`wall-clock budget reached (${budget.maxWallClockMs}ms)`, contract);
  if (budget.maxTokens !== undefined && run.budget.usedTokens >= budget.maxTokens) return exhausted(`token budget reached (${budget.maxTokens})`, contract);
  if (budget.maxCostUsd !== undefined && run.budget.usedUsd >= budget.maxCostUsd) return exhausted(`cost budget reached ($${budget.maxCostUsd})`, contract);
  if (budget.maxNoProgressSteps !== undefined && run.budget.noProgressSteps >= budget.maxNoProgressSteps) return exhausted(`no-progress budget reached (${budget.maxNoProgressSteps})`, contract);
  return null;
}

export function terminalForControl(contract: WorkflowCompletion | undefined, run: GraphRunState, control: ControlStatus, stop: BudgetStop | undefined, at: string): GraphTerminal {
  if (stop) return terminal(stop.state, stop.reason, stop.recoveryAction, at);
  if (control === "done") return contract ? completionTerminal(contract, run, at) : terminal("succeeded", "workflow reached a terminal node", undefined, at);
  if (control === "paused") return terminal("paused", "approval was denied", contract?.pause.recoveryAction, at);
  return terminal("failed", control === "blocked" ? "safety assessment blocked execution" : "node execution failed", contract?.failure.recoveryAction, at);
}

export function persistedRunStatus(control: ControlStatus, terminalState: GraphTerminal["state"]): GraphRunState["status"] {
  if (terminalState === "succeeded") return "done";
  if (terminalState === "paused") return "paused";
  if (terminalState === "exhausted") return "exhausted";
  if (terminalState === "cancelled") return "cancelled";
  return control === "blocked" ? "blocked" : "error";
}

function checkSatisfied(check: CompletionCheck, run: GraphRunState): boolean {
  if (check.type === "run-status") return runStatusSatisfied(check.status, run);
  if (check.type === "node-status") return run.results[check.node]?.status === check.status;
  if (check.type === "approval") return run.approvals.some((item) => item.nodeId === check.node && item.approved === check.approved);
  if (check.type === "evidence") return run.evidence.some((item) => item.kind === check.kind && item.passed === check.passed && (!check.id || item.id === check.id));
  const present = Object.prototype.hasOwnProperty.call(run.values, check.field);
  if (check.exists !== undefined && present !== check.exists) return false;
  return check.equals === undefined || Object.is(run.values[check.field], check.equals);
}

function runStatusSatisfied(status: "terminal" | "failed" | "paused", run: GraphRunState): boolean {
  const statuses = Object.values(run.results).map((item) => item.status);
  if (status === "failed") return statuses.some((item) => item === "error" || item === "blocked");
  if (status === "paused") return statuses.some((item) => item === "denied");
  return statuses.length > 0 && statuses.every((item) => item === "ok");
}

function checkLabel(check: CompletionCheck): string {
  if (check.type === "run-status") return `run-status:${check.status}`;
  if (check.type === "evidence") return `evidence:${check.kind}:${check.id ?? "any"}`;
  if (check.type === "node-status") return `node:${check.node}:${check.status}`;
  if (check.type === "approval") return `approval:${check.node}:${check.approved}`;
  return `state:${check.field}`;
}

function exhausted(reason: string, contract: WorkflowCompletion): BudgetStop {
  return { state: "exhausted", reason, recoveryAction: contract.exhausted.recoveryAction };
}

function terminal(state: GraphTerminal["state"], reason: string, recoveryAction: string | undefined, at: string): GraphTerminal {
  return { state, reason, recoveryAction, at };
}
