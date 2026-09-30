import type http from "node:http";
import { redactForLog } from "../store/redact-structural.js";
import type { DesktopRunFailureKind,ImageAttachment } from "../types.js";
import { buildRunReceipt,classifyDesktopFailure,interrupted,queuedTurnExceptionReason } from "./handler-chat-receipts.js";
import { ensureDesktopConversation,persistActiveSession,providerRouteStatus } from "./handler-conversation.js";
import { sendJson } from "./handler-http.js";
import { turnQueue } from "./handler-queue.js";
import { beginRunCapture,finishRunCapture } from "./handler-run-capture.js";
import type { DesktopEvent,DesktopState } from "./handler-state.js";
import { saveProviderAuthRequired } from "./provider-auth-store.js";

export type ChatInput = { instructionText: string; images: ImageAttachment[]; files: string[] };
export type ChatExecution = ChatInput & {
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
  sendJson(res, 200, { finalText, events: receipt.events, sessionId: state.sessionId, receipt });
}

async function retainAuthFailure(context: ChatExecution): Promise<void> {
  const { state, live } = context;
  if (!live) return;
  const { provider, model, baseRoute, billingMode, authMethod } = providerRouteStatus(state, live.setup.provider);
  state._providerAuthRequired = { provider, model, baseRoute, billingMode, authMethod };
  await saveProviderAuthRequired(state.root, state._providerAuthRequired);
}

function failureText(state: DesktopState, failure: { partial?: string; wasInterrupted: boolean; kind: DesktopRunFailureKind; error: unknown }): string {
  const { partial, wasInterrupted, kind, error } = failure;
  const safeError = redactForLog(error instanceof Error ? error.message : String(error));
  if (partial) return `${partial}\n\n${wasInterrupted ? "Stopped by operator." : "The run stopped before completing."}`;
  if (wasInterrupted) return "Stopped by operator.";
  if (kind === "provider_auth" && state._providerAuthRequired) return authRequiredText(state);
  return safeError;
}

export async function respondChatFailure(context: ChatExecution, error: unknown, res: http.ServerResponse): Promise<void> {
  const { state, controller, events, live, instructionText } = context;
  const wasInterrupted = interrupted(error, controller);
  const partial = state._chatDeltas?.join("").trim();
  const failureKind = classifyDesktopFailure(error, wasInterrupted, events);
  if (context.claimedTurnId) {
    await turnQueue(state).release(context.claimedTurnId, queuedTurnExceptionReason(failureKind, wasInterrupted)).catch(() => undefined);
    context.claimedTurnId = undefined;
  }
  if (failureKind === "provider_auth") await retainAuthFailure(context);
  const finalText = failureText(state, { partial, wasInterrupted, kind: failureKind, error });
  events.push({ label: wasInterrupted ? "Stopped by operator." : failureKind === "provider_auth" ? "Provider authentication required." : "Run failed before completion.", ok: false });
  const receipt = buildRunReceipt({ status: wasInterrupted ? "interrupted" : "failed", events, instruction: instructionText, partialText: partial || undefined, failureKind });
  if (failureKind === "provider_auth") receipt.actions = ["edit_request", "start_from_checkpoint"];
  if (live) {
    live.convo.messages.push({ role: "assistant", content: finalText, desktopRun: receipt });
    await finishRunCapture(state, wasInterrupted ? "interrupted" : "failed", finalText);
    await persistActiveSession(state);
  }
  sendJson(res, 200, { finalText, events, interrupted: wasInterrupted, sessionId: state.sessionId, receipt });
}

export function clearChatExecution(state: DesktopState, controller: AbortController): void {
  state.currentEvents = undefined;
  state.currentRunEvents = undefined;
  state.activeRunCapture = undefined;
  state.forceFreshApprovals = false;
  state._chatDeltas = undefined;
  state._streamTextDeltas = false;
  state._chatActive = false;
  if (state._chatAbort === controller) state._chatAbort = undefined;
}
