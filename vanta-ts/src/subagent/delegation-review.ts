import { interruptedDisposition, toolMayHaveSideEffects } from "../agent/effect-disposition.js";
import { messagesNeedEffectReview } from "../agent/effect-review.js";
import { unansweredCalls } from "../agent/tool-pairing.js";
import type { DelegationNode } from "./delegation-receipt.js";
import { inspectWorker, type WorkerInspectionRecord } from "./worker-inspection.js";

function hasUncertainEffects(record: WorkerInspectionRecord): boolean {
  const evidence = record.terminalEvidence;
  if (evidence?.needsEffectReview || evidence?.effectReviewCallIds?.length || evidence?.completionState === "needs human") return true;
  if (messagesNeedEffectReview(record.messages)) return true;
  const calls = record.messages.flatMap(message => message.role === "assistant" ? message.toolCalls ?? [] : []);
  const mutators = new Set(calls.filter(call => toolMayHaveSideEffects(call.name)).map(call => call.id));
  if (record.messages.some(message => message.role === "tool" && message.effectDisposition === undefined
    && (mutators.has(message.toolCallId) || toolMayHaveSideEffects(message.name)))) return true;
  return unansweredCalls(calls, record.messages).some(call => interruptedDisposition(call, call.effectState !== "pending") === "unknown");
}

/** Admission for a fresh derived task, never permission to continue the stored worker. */
export async function delegationReviewReason(root: string, node: DelegationNode): Promise<string | null> {
  try {
    const result = await inspectWorker(root, node.id);
    if (!result) return node.verification === "pass" && node.stoppedReason === "done" ? null : "legacy result has no checkpoint establishing effect safety";
    const { record } = result;
    if ((record.parentSessionId ?? "interactive") !== node.parentId) return "checkpoint parent conflicts with the delegation receipt";
    if (record.phase === "partial") return "worker is unfinished; inspect it before deriving more work";
    if (hasUncertainEffects(record)) return "prior effects are unresolved; inspect actual results before any retry";
    return null;
  } catch {
    return "checkpoint is invalid, unreadable, or outside this project";
  }
}
