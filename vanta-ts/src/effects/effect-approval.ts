import {
  persistApprovalTransition,
  persistEffectTransition,
  type ApprovalTransition,
} from "../agent/effect-persistence.js";
import type { ToolCall } from "../types.js";
import type { EffectGateContext, EffectIntent } from "./execute-effect.js";

export type EffectApprovalPersistence = {
  persist(
    context: EffectGateContext,
    intent: EffectIntent,
    transition: ApprovalTransition,
  ): Promise<void>;
  settleExpired(context: EffectGateContext, intent: EffectIntent): Promise<void>;
};

function approvalCall(intent: EffectIntent): ToolCall {
  return {
    id: `effect:${intent.id}`,
    name: intent.kind,
    arguments: {},
  };
}

export const effectApprovalPersistence: EffectApprovalPersistence = {
  persist: (context, intent, transition) => persistApprovalTransition(
    context.projectRoot,
    context.sessionId,
    approvalCall(intent),
    intent.action,
    transition,
  ),
  settleExpired: (context, intent) => persistEffectTransition(
    context.projectRoot,
    context.sessionId,
    approvalCall(intent),
    "settled",
    "expired",
    "stopped",
  ),
};
