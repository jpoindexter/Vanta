import type { WorkflowControlStatus } from "./execute-control.js";
import type { GraphRunState } from "./run-state.js";
import type { GraphTerminal } from "./run-state.js";
import { loadGraphRunState, updateGraphRun } from "./run-state-store.js";

export type GraphRunControlAction = "pause" | "cancel" | "retry";

export async function requestGraphRunControl(
  dataDir: string,
  runId: string,
  action: GraphRunControlAction,
  at = new Date().toISOString(),
): Promise<GraphRunState> {
  return updateGraphRun(dataDir, runId, (run) => applyControl(run, action, at));
}

export async function readGraphRunControl(dataDir: string, runId: string): Promise<WorkflowControlStatus | null> {
  const run = await loadGraphRunState(dataDir, runId);
  return run?.operatorControl?.action === "pause" ? "paused" : run?.operatorControl?.action === "cancel" ? "cancelled" : null;
}

export function operatorTerminal(run: GraphRunState, control: WorkflowControlStatus, at: string): GraphTerminal | null {
  if (control === "paused" && run.operatorControl?.action === "pause") {
    return { state: "paused", reason: "operator pause requested", recoveryAction: "Retry from this safe checkpoint when ready.", at };
  }
  if (control === "cancelled" && run.operatorControl?.action === "cancel") {
    return { state: "cancelled", reason: "operator cancellation requested", recoveryAction: "Retry from the last confirmed checkpoint when ready.", at };
  }
  return null;
}

function applyControl(run: GraphRunState, action: GraphRunControlAction, at: string): GraphRunState {
  const event = { action, at, checkpointRevision: run.revision };
  if (action !== "retry") {
    if (run.status !== "running") throw new Error(`cannot ${action} graph run in ${run.status} state`);
    return { ...run, operatorControl: { action, requestedAt: at }, operatorEvents: [...run.operatorEvents, event] };
  }
  if (!run.terminal || run.status === "done" || run.status === "running") {
    throw new Error(`cannot retry graph run in ${run.status} state`);
  }
  return {
    ...run,
    status: "running",
    terminal: undefined,
    operatorControl: undefined,
    operatorEvents: [...run.operatorEvents, event],
  };
}
