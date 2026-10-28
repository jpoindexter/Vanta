import { createHash, randomUUID } from "node:crypto";
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
  reviewCallIds?: string[];
};

/** Persist each terminal receipt; exact unknown operations share one attention WorkItem. */
export async function recordTurnReceipt(input: TurnReceiptInput): Promise<void> {
  const state = input.completionState ?? "unverified";
  const goal = input.goalId ? `goal:${input.goalId}:` : "";
  const review = input.sessionId && state === "needs human" && input.disposition === "unknown" && input.reviewCallIds?.length
    ? createHash("sha256").update(JSON.stringify([input.host, [...new Set(input.reviewCallIds)].sort()])).digest("hex")
    : undefined;
  const call: ToolCall = {
    id: `${goal}turn:${review ? `review:${review}` : randomUUID()}`,
    name: `${input.host}.turn`,
    arguments: {},
  };
  // Re-observing a consumed effect must not temporarily hide its existing blocker.
  if (!review) {
    await persistEffectTransition(input.root, input.sessionId, call, "pending");
    await persistEffectTransition(input.root, input.sessionId, call, "started");
  }
  await persistEffectTransition(input.root, input.sessionId, call, "settled", input.disposition ?? "none", state);
}
