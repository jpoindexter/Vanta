import { createHash } from "node:crypto";
import { ApprovalSchema, ReceiptSchema, RunSchema, WorkItemSchema, settleWorkItem, type WorkItemState } from "../work-items/contract.js";
import type { ToolCall, EffectDisposition } from "../types.js";
import type { ApprovalTransition, EffectTransition } from "./effect-persistence.js";
import type { Projection } from "./effect-journal.js";

type ApprovalInput = { sessionId?: string; call: ToolCall; action: string; transition: ApprovalTransition; at: string };
type ToolInput = { sessionId?: string; call: ToolCall; transition: EffectTransition; disposition?: EffectDisposition; settledState?: WorkItemState; at: string };

export function approvalProjections(input: ApprovalInput): Projection[] {
  const { sessionId, call, action, transition, at } = input;
  const stableSession = sessionId ?? "one-shot";
  const workItemId = `${stableSession}:${call.id}`;
  const state: WorkItemState = transition === "requested"
    ? "needs human"
    : transition === "approved"
      ? "queued"
      : "stopped";
  const approval = ApprovalSchema.parse({
    version: 1,
    id: `${workItemId}:approval`,
    workItemId,
    runId: workItemId,
    actionSha256: createHash("sha256").update(action, "utf8").digest("hex"),
    state: transition,
    at,
  });
  const item = WorkItemSchema.parse({
    version: 1,
    id: workItemId,
    outcome: `Execute ${call.name}`,
    source: "tool-call",
    state,
    runId: workItemId,
    ...(transition === "requested"
      ? {
          waitCondition: "Operator approval required",
          nextAction: `Approve or deny ${call.name}`,
          resumeContext: `Resume tool call ${call.id} after the decision`,
        }
      : {}),
    updatedAt: at,
  });
  const run = RunSchema.parse({
    version: 1,
    id: workItemId,
    workItemId,
    state,
    actor: call.name,
    ...(state === "stopped" ? { settledAt: at } : {}),
  });
  return [
    { file: "approvals.jsonl", line: JSON.stringify(approval) },
    { file: "work-items.jsonl", line: JSON.stringify(item) },
    { file: "runs.jsonl", line: JSON.stringify(run) },
  ];
}

export function toolProjections(input: ToolInput): Projection[] {
  const { sessionId, call, transition, disposition, settledState, at } = input;
  const stableSession = sessionId ?? "one-shot";
  const workItemId = `${stableSession}:${call.id}`;
  const state = stateFor(transition, disposition, settledState);
  const record = { at, sessionId: stableSession, toolCallId: call.id, tool: call.name, transition, ...(disposition ? { disposition } : {}) };
  const item = WorkItemSchema.parse({
    version: 1,
    id: workItemId,
    outcome: `Execute ${call.name}`,
    source: "tool-call",
    state,
    runId: workItemId,
    updatedAt: at,
  });
  const run = RunSchema.parse({
    version: 1,
    id: workItemId,
    workItemId,
    state,
    actor: call.name,
    ...(transition !== "pending" ? { startedAt: at } : {}),
    ...(transition === "settled" ? { settledAt: at } : {}),
  });
  const projections: Projection[] = [
    { file: "tool-effects.jsonl", line: JSON.stringify(record) },
    { file: "work-items.jsonl", line: JSON.stringify(item) },
    { file: "runs.jsonl", line: JSON.stringify(run) },
  ];
  if (transition === "settled" && disposition) {
    const receipt = ReceiptSchema.parse({
      version: 1,
      id: `${workItemId}:${at}`,
      workItemId,
      runId: workItemId,
      action: call.name,
      disposition,
      ...(state === "verified" || state === "unverified" ? { verification: state } : {}),
      at,
    });
    projections.push({ file: "action-receipts.jsonl", line: JSON.stringify(receipt) });
  }
  return projections;
}

function stateFor(
  transition: EffectTransition,
  disposition?: EffectDisposition,
  settledState?: WorkItemState,
): WorkItemState {
  if (transition === "pending") return "queued";
  if (transition === "started") return "running";
  if (settledState) return settledState;
  return settleWorkItem({ ok: false, disposition: disposition ?? "none" });
}
