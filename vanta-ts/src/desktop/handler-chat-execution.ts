import type http from "node:http";
import { writeRunMemory } from "../session.js";
import { checkpointSessionMessages } from "../sessions/store.js";
import type { ImageAttachment } from "../types.js";
import type { ChatExecution, ChatInput } from "./handler-chat-lifecycle.js";
import { attachDesktopRunReceipt,buildRunReceipt,queuedTurnFailureReason,receiptStatusForStoppedReason } from "./handler-chat-receipts.js";
import { ensureDesktopConversation,persistActiveSession } from "./handler-conversation.js";
import { sendJson } from "./handler-http.js";
import { queueSessionId, turnQueue } from "./handler-queue.js";
import { beginRunCapture,finishRunCapture } from "./handler-run-capture.js";
import type { DesktopState } from "./handler-state.js";
import { deleteQueuedImages,loadQueuedImages } from "./turn-queue-images.js";
import { pushSseEvent } from "./session-state.js";
import { pushTurnComplete, pushUsage } from "./typed-emit.js";
import { estimateContextTokens } from "./usage-meter.js";

type LiveExecution = ChatExecution & { live: Awaited<ReturnType<typeof ensureDesktopConversation>> };
type Outcome = Awaited<ReturnType<LiveExecution["live"]["convo"]["send"]>>;

async function executeInstruction(context: LiveExecution, instruction: string, attachments: { images?: ImageAttachment[]; files: string[] }): Promise<Outcome> {
  const { state, live, controller } = context;
  await beginRunCapture(state, instruction, attachments.files, live.convo.messages.filter((entry) => entry.role === "user").length);
  if (live.sessionId) await checkpointSessionMessages(live.sessionId, [...live.convo.messages, { role: "user", content: instruction, ...(attachments.images ? { images: attachments.images } : {}) }], process.env);
  return live.convo.send(instruction, attachments.images, controller.signal);
}

/** Meter numbers are best-effort: a provider that cannot report its window never fails a settled turn. */
function emitUsage(state: LiveExecution["state"], live: LiveExecution["live"], usage: Outcome["usage"]): void {
  try {
    pushUsage(state, { usage, contextTokens: estimateContextTokens(live.convo.messages), contextWindow: live.setup.provider.contextWindow() });
  } catch { /* the HTTP response and turn.complete stay authoritative */ }
}

async function settleInstruction(context: LiveExecution, instruction: string, outcome: Outcome): Promise<void> {
  const { state, live, events } = context;
  await writeRunMemory({ provider: live.setup.provider, goals: live.setup.goals, instruction, finalText: outcome.finalText, completionState: outcome.completionState });
  events.push({ label: `${outcome.stoppedReason} · ${outcome.iterations} iteration(s)`, ok: outcome.stoppedReason === "done", kind: "summary" });
  const receipt = buildRunReceipt({ ...receiptStatusForStoppedReason(outcome.stoppedReason), events, instruction, partialText: outcome.finalText, messages: live.convo.messages });
  attachDesktopRunReceipt(live.convo, receipt, outcome.finalText);
  await finishRunCapture(state, receipt.status, outcome.finalText, outcome.usage);
  emitUsage(state, live, outcome.usage);
  if (context.claimedTurnId) {
    if (outcome.stoppedReason === "done") {
      await turnQueue(state).complete(context.claimedTurnId);
      await deleteQueuedImages(state.root, context.claimedTurnId);
    } else await turnQueue(state).release(context.claimedTurnId, queuedTurnFailureReason(outcome.stoppedReason));
    context.claimedTurnId = undefined;
  }
}

type NextInstruction = { instruction: string; images: ImageAttachment[] };

async function claimNextInstruction(context: LiveExecution, outcome: Outcome): Promise<NextInstruction | undefined> {
  if (outcome.stoppedReason !== "done" || context.controller.signal.aborted) return undefined;
  const { state, events } = context;
  const queued = await turnQueue(state).claimNext(context.activeQueueSessionId);
  if (!queued) return undefined;
  context.claimedTurnId = queued.id;
  const event = { label: queued.intent === "steer" ? "Applying queued steer instruction." : "Running queued instruction.", ok: true };
  events.push(event);
  if (state._sseClients && state._sseSessionId) pushSseEvent(state._sseClients, state._sseSessionId, event);
  const images = queued.imageCount ? await loadQueuedImages(state.root, queued.id) : [];
  return { instruction: queued.instruction, images };
}

/**
 * Start a turn from the durable queue instead of a typed message. The queue normally drains only after a running turn
 * finishes; after an app restart nothing is running, so the user asks for the queue to run. The head is claimed
 * (status "starting", owned by this process) and settles exactly like a drained item: removed when done, kept as
 * failed with its reason otherwise.
 */
export async function claimQueuedChatInput(state: DesktopState, requestId?: string): Promise<{ input: ChatInput; claimedTurnId: string } | undefined> {
  const queued = await turnQueue(state).claimNext(queueSessionId(state));
  if (!queued) return undefined;
  const images = queued.imageCount ? await loadQueuedImages(state.root, queued.id) : [];
  return { claimedTurnId: queued.id, input: { instructionText: queued.instruction, images, files: [], ...(requestId ? { requestId } : {}) } };
}

export async function executeChat(context: ChatExecution, res: http.ServerResponse): Promise<void> {
  context.live = await ensureDesktopConversation(context.state);
  const liveContext = context as LiveExecution;
  let instruction = context.instructionText;
  let attachments = { images: context.images.length ? context.images : undefined, files: context.files };
  let outcome: Outcome;
  while (true) {
    outcome = await executeInstruction(liveContext, instruction, attachments);
    attachments = { images: undefined, files: [] };
    await settleInstruction(liveContext, instruction, outcome);
    const next = await claimNextInstruction(liveContext, outcome);
    if (next === undefined) break;
    instruction = next.instruction;
    attachments = { images: next.images.length ? next.images : undefined, files: [] };
  }
  await persistActiveSession(context.state);
  pushTurnComplete(context.state, { finalText: outcome.finalText, usage: outcome.usage, stoppedReason: outcome.stoppedReason });
  const receipt = buildRunReceipt({ ...receiptStatusForStoppedReason(outcome.stoppedReason), events: context.events, instruction, partialText: outcome.finalText, messages: liveContext.live.convo.messages });
  sendJson(res, 200, { finalText: outcome.finalText, events: context.events, usage: outcome.usage, sessionId: context.state.sessionId, stoppedReason: outcome.stoppedReason, receipt });
}
