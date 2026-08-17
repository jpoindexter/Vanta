import { randomUUID } from "node:crypto";
import { persistEffectTransition } from "../agent/effect-persistence.js";
import type { EffectDisposition, ToolCall } from "../types.js";
import type { WorkItemState } from "./contract.js";

export type TurnReceiptInput = {
  root: string;
  sessionId?: string;
  host: string;
  goalId?: string;
  completionState?: WorkItemState;
  disposition?: EffectDisposition;
};

/** Persist one terminal, content-free WorkItem/Run/Receipt envelope per agent turn. */
export async function recordTurnReceipt(input: TurnReceiptInput): Promise<void> {
  const state = input.completionState ?? "unverified";
  const goal = input.goalId ? `goal:${input.goalId}:` : "";
  const call: ToolCall = {
    id: `${goal}turn:${randomUUID()}`,
    name: `${input.host}.turn`,
    arguments: {},
  };
  await persistEffectTransition(input.root, input.sessionId, call, "pending");
  await persistEffectTransition(input.root, input.sessionId, call, "started");
  await persistEffectTransition(input.root, input.sessionId, call, "settled", input.disposition ?? "none", state);
}
