import type http from "node:http";
import { executeChat } from "./handler-chat-execution.js";
import { clearChatExecution,respondAuthRequired,respondChatFailure,type ChatExecution,type ChatInput } from "./handler-chat-lifecycle.js";
import { readJson,sendJson } from "./handler-http.js";
import { queueSessionId } from "./handler-queue.js";
import type { DesktopState } from "./handler-state.js";
import { parseDesktopImageInput } from "./image-input.js";
import { loadProviderAuthRequired } from "./provider-auth-store.js";
import { pushSseEvent } from "./session-state.js";

export async function handleStopChat(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const controller = state._chatAbort;
  if (!state._chatActive || !controller) return sendJson(res, 409, { error: "no turn is running" });
  controller.abort();
  const event = { label: "Stop requested by operator.", ok: false };
  state.currentEvents?.push(event);
  if (state._sseClients && state._sseSessionId) pushSseEvent(state._sseClients, state._sseSessionId, event);
  sendJson(res, 202, { stopping: true });
}

function validChatFiles(files: unknown): boolean {
  return files === undefined || (Array.isArray(files) && files.length <= 50 && files.every(file => typeof file === "string"));
}

function validChatRequestId(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && /^[a-z0-9-]{1,80}$/i.test(value));
}

function parseChatInput(body: { message?: unknown; images?: unknown; files?: unknown; requestId?: unknown }): ChatInput | { error: string } {
  if (!validChatRequestId(body.requestId)) return { error: "invalid chat request identity" };
  const parsedImages = parseDesktopImageInput(body.images);
  if (!parsedImages.ok) return { error: parsedImages.error };
  if (!validChatFiles(body.files)) {
    return { error: "files must be a list of at most 50 project-relative paths" };
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const instructionText = message || (parsedImages.images.length ? "Describe the attached image." : "");
  if (!instructionText) return { error: "message or image is required" };
  return { instructionText, images: parsedImages.images, files: (body.files as string[] | undefined) ?? [], ...(typeof body.requestId === "string" ? { requestId: body.requestId } : {}) };
}

function startChatExecution(state: DesktopState, input: ChatInput): ChatExecution {
  const controller = new AbortController();
  state._chatActive = true;
  state._chatAbort = controller;
  state._chatDeltas = [];
  state._streamTextDeltas = true;
  state.currentEvents = [];
  if (input.requestId && state._sseClients && state._sseSessionId) pushSseEvent(state._sseClients, state._sseSessionId, {
    label: "Response started.", turnStarted: { sessionId: queueSessionId(state), requestId: input.requestId },
  });
  return { ...input, state, controller, events: state.currentEvents, activeQueueSessionId: queueSessionId(state) };
}

export async function handleChat(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (state._chatActive) return sendJson(res, 409, { error: "a turn is already running" });
  const body = await readJson(req) as { message?: unknown; images?: unknown; files?: unknown; sessionId?: unknown; requestId?: unknown };
  if (body.sessionId !== undefined && body.sessionId !== state.sessionId) {
    return sendJson(res, 409, { error: "The active chat changed. Reopen the intended chat before sending." });
  }
  const input = parseChatInput(body);
  if ("error" in input) return sendJson(res, 400, input);
  state._providerAuthRequired ??= await loadProviderAuthRequired(state.root);
  if (state._providerAuthRequired) return respondAuthRequired(state, input, res);
  const context = startChatExecution(state, input);
  try {
    await executeChat(context, res);
  } catch (error) {
    await respondChatFailure(context, error, res);
  } finally {
    clearChatExecution(state, context.controller);
  }
}
