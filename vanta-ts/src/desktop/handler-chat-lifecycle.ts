import type http from "node:http";
import type { AgentOutcome } from "../agent.js";
import { EFFECT_REVIEW_TEXT } from "../agent/effect-review.js";
import { redactForLog } from "../store/redact-structural.js";
import type { DesktopRunFailureKind,DesktopRunReceipt,ImageAttachment } from "../types.js";
import { buildRunReceipt,classifyDesktopFailure,interrupted,queuedTurnExceptionReason } from "./handler-chat-receipts.js";
import { ensureDesktopConversation,persistActiveSession,providerRouteStatus } from "./handler-conversation.js";
import { sendJson } from "./handler-http.js";
import { turnQueue } from "./handler-queue.js";
import { beginRunCapture,finishRunCapture } from "./handler-run-capture.js";
import type { DesktopEvent,DesktopState } from "./handler-state.js";
import { saveProviderAuthRequired } from "./provider-auth-store.js";
import { pushTurnComplete } from "./typed-emit.js";
import { retainChatResult } from "./live-session.js";

export type ChatInput = { instructionText: string; images: ImageAttachment[]; files: string[]; requestId?: string };
export type ChatExecution = ChatInput & {
  outcome?: AgentOutcome;
  state: DesktopState;
  controller: AbortController;
  events: DesktopEvent[];
  live?: Awaited<ReturnType<typeof ensureDesktopConversation>>;
  activeQueueSessionId: string;
  claimedTurnId?: string;
};

export function authRequiredText(state: DesktopState): string {
  const auth = state._providerAuthRequired!;
  return `Provider authentication required for ${auth.provider} · ${auth.model}. Reconnect this model in Connect before retrying.`;
}

export async function respondAuthRequired(state: DesktopState, input: ChatInput, res: http.ServerResponse): Promise<void> {
  const { instructionText, files, images } = input;
  const finalText = authRequiredText(state);
  const receipt = buildRunReceipt({ status: "failed", failureKind: "provider_auth", events: [{ label: "Provider authentication required.", ok: false }], instruction: instructionText });
  receipt.actions = ["edit_request", "start_from_checkpoint"];
  const live = await ensureDesktopConversation(state);
  await beginRunCapture(state, instructionText, files, live.convo.messages.filter((entry) => entry.role === "user").length);
  live.convo.messages.push({ role: "user", content: instructionText, ...(images.length ? { images } : {}) }, { role: "assistant", content: finalText, desktopRun: receipt });
  await finishRunCapture(state, "failed", finalText);
  await persistActiveSession(state);
  pushTurnComplete(state, { finalText, stoppedReason: "provider_auth" });
  sendJson(res, 200, { finalText, events: receipt.events, sessionId: state.sessionId, stoppedReason: "provider_auth", receipt });
}

async function retainAuthFailure(context: ChatExecution): Promise<void> {
  const { state, live } = context;
  if (!live) return;
  const { provider, model, baseRoute, billingMode, authMethod } = providerRouteStatus(state, live.setup.provider);
  state._providerAuthRequired = { provider, model, baseRoute, billingMode, authMethod };
  await saveProviderAuthRequired(state.root, state._providerAuthRequired);
}

function failureText(state: DesktopState, failure: { partial?: string; wasInterrupted: boolean; kind: DesktopRunFailureKind; error: unknown; needsEffectReview?: boolean }): string {
  const { partial, wasInterrupted, kind, error } = failure;
  if (failure.needsEffectReview) return [partial, EFFECT_REVIEW_TEXT].filter(Boolean).join("\n\n");
  const safeError = redactForLog(error instanceof Error ? error.message : String(error));
  if (partial) return `${partial}\n\n${wasInterrupted ? "Stopped by operator." : "The run stopped before completing."}`;
  if (wasInterrupted) return "Stopped by operator.";
  if (kind === "provider_auth" && state._providerAuthRequired) return authRequiredText(state);
  return safeError;
}

function failureStoppedReason(wasInterrupted: boolean, kind: DesktopRunFailureKind): string {
  if (wasInterrupted) return "interrupted";
  return kind === "provider_auth" ? "provider_auth" : "failed";
}

async function settleFailedClaim(context: ChatExecution, kind: DesktopRunFailureKind, wasInterrupted: boolean): Promise<void> {
  if (context.outcome?.needsEffectReview) {
    await turnQueue(context.state).pauseForEffectReview(context.activeQueueSessionId).catch(() => undefined);
    context.claimedTurnId = undefined;
    return;
  }
  if (!context.claimedTurnId) return;
  await turnQueue(context.state).release(context.claimedTurnId, queuedTurnExceptionReason(kind, wasInterrupted)).catch(() => undefined);
  context.claimedTurnId = undefined;
}

function failedReceipt(context: ChatExecution, failure: { wasInterrupted: boolean; partial?: string; kind: DesktopRunFailureKind }): DesktopRunReceipt {
  return buildRunReceipt({ status: failure.wasInterrupted ? "interrupted" : "failed", events: context.events,
    instruction: context.instructionText, partialText: failure.partial || undefined, failureKind: failure.kind,
    ...(context.outcome?.needsEffectReview ? { status: "failed", failureKind: "tool", needsEffectReview: true, stoppedReason: "blocked" } : {}) });
}

export async function respondChatFailure(context: ChatExecution, error: unknown, res: http.ServerResponse): Promise<void> {
  const { state, controller, events, live, instructionText } = context;
  const wasInterrupted = interrupted(error, controller);
  const review = context.outcome?.needsEffectReview === true;
  const partial = state._chatDeltas?.join("").trim() || context.outcome?.finalText;
  const failureKind = classifyDesktopFailure(error, wasInterrupted, events);
  await settleFailedClaim(context, failureKind, wasInterrupted);
  if (failureKind === "provider_auth") await retainAuthFailure(context);
  const finalText = failureText(state, { partial, wasInterrupted, kind: failureKind, error, needsEffectReview: review });
  events.push({ label: wasInterrupted ? "Stopped by operator." : failureKind === "provider_auth" ? "Provider authentication required." : "Run failed before completion.", ok: false });
  const receipt = failedReceipt(context, { wasInterrupted, partial, kind: failureKind });
  if (failureKind === "provider_auth" && !review) receipt.actions = ["edit_request", "start_from_checkpoint"];
  if (live) {
    live.convo.messages.push({ role: "assistant", content: finalText, desktopRun: receipt });
    await finishRunCapture(state, receipt, finalText, context.outcome?.usage);
    await persistActiveSession(state);
  }
  const stoppedReason = review ? "blocked" : failureStoppedReason(wasInterrupted, failureKind);
  const result = { finalText, events, interrupted: wasInterrupted, sessionId: state.sessionId, stoppedReason, receipt, usage: context.outcome?.usage };
  retainChatResult(state, context.requestId, result);
  pushTurnComplete(state, { finalText, stoppedReason, usage: context.outcome?.usage });
  sendJson(res, 200, result);
}

export function clearChatExecution(state: DesktopState, controller: AbortController): void {
  state.currentEvents = undefined;
  state.currentRunEvents = undefined;
  state.activeRunCapture = undefined;
  state.forceFreshApprovals = false;
  state._chatDeltas = undefined;
  state._instructionDisplayedText = undefined;
  state._streamTextDeltas = false;
  state._chatActive = false;
  if (state._chatAbort === controller) state._chatAbort = undefined;
}
