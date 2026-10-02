import http from "node:http";
import { readJson,sendJson } from "./handler-http.js";
import { type DesktopState } from "./handler-state.js";
import { loadDesktopSessionDraft,saveDesktopSessionDraft } from "./session-draft-store.js";
import { pushSseEvent } from "./session-state.js";
import { DesktopTurnQueue,QueueConflictError,desktopTurnQueuePath,fileTurnQueueDeps,type QueuedTurnTarget } from "./turn-queue.js";

export const desktopTurnQueues = new Map<string, DesktopTurnQueue>();

export function turnQueue(state: DesktopState): DesktopTurnQueue {
  if (state._turnQueue) return state._turnQueue;
  const path = desktopTurnQueuePath(state.root);
  let queue = desktopTurnQueues.get(path);
  if (!queue) {
    queue = new DesktopTurnQueue(fileTurnQueueDeps(path));
    desktopTurnQueues.set(path, queue);
  }
  state._turnQueue = queue;
  return state._turnQueue;
}

export function queueSessionId(state: DesktopState): string {
  return state.sessionId ?? state._sseSessionId ?? "default";
}

export function queuedTurnTarget(state: DesktopState): QueuedTurnTarget {
  const sessionId = queueSessionId(state);
  return {
    sessionId,
    root: state.root,
    controllerId: state.runtimeHostBySession?.[sessionId] ?? "local",
    model: state.modelId ?? state.setup?.provider.modelId() ?? "default",
    accessMode: state.accessMode ?? "approve",
  };
}

export async function handleQueueList(state: DesktopState, res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await turnQueue(state).list(queueSessionId(state)));
}

export async function handleSessionDraft(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { action?: unknown; id?: unknown; value?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return sendJson(res, 400, { error: "session id is required" });
  if (body.action === "load") return sendJson(res, 200, await loadDesktopSessionDraft(state.root, id));
  if (body.action === "save" && typeof body.value === "string") {
    await saveDesktopSessionDraft(state.root, id, body.value);
    return sendJson(res, 200, { saved: true });
  }
  sendJson(res, 400, { error: "unsupported draft action" });
}

type QueueBody = { action?: unknown; id?: unknown; revision?: unknown; message?: unknown; direction?: unknown };

async function enqueueInstruction(state: DesktopState, body: QueueBody, res: http.ServerResponse): Promise<void> {
  const queue = turnQueue(state);
  if (!state._chatActive) return sendJson(res, 409, { error: "no turn is running" });
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return sendJson(res, 400, { error: "message is required" });
  const item = await queue.enqueue({ instruction: message, target: queuedTurnTarget(state) });
  const event = { label: "Next instruction queued.", ok: true };
  state.currentEvents?.push(event);
  if (state._sseClients && state._sseSessionId) pushSseEvent(state._sseClients, state._sseSessionId, event);
  sendJson(res, 202, { queued: true, item, snapshot: await queue.list(queueSessionId(state)) });
}

async function mutateQueuedInstruction(queue: DesktopTurnQueue, action: string, body: QueueBody): Promise<boolean> {
  const id = body.id as string;
  const revision = body.revision as number;
  if (action === "edit") await queue.edit(id, revision, typeof body.message === "string" ? body.message : "");
  else if (action === "move" && (body.direction === "up" || body.direction === "down")) await queue.move(id, revision, body.direction);
  else if (action === "cancel") await queue.cancel(id, revision);
  else if (action === "steer") await queue.steer(id, revision);
  else if (action === "retry") await queue.retry(id, revision);
  else return false;
  return true;
}

function queueMutationIdentity(body: QueueBody): { id: string; revision: number } {
  return { id: typeof body.id === "string" ? body.id : "", revision: typeof body.revision === "number" ? body.revision : -1 };
}

export async function handleQueueChat(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as QueueBody;
  const action = typeof body.action === "string" ? body.action : "enqueue";
  const queue = turnQueue(state);
  try {
    if (action === "enqueue") {
      return await enqueueInstruction(state, body, res);
    }
    const { id, revision } = queueMutationIdentity(body);
    if (!id || revision < 0) return sendJson(res, 400, { error: "id and revision are required" });
    if (!await mutateQueuedInstruction(queue, action, body)) return sendJson(res, 400, { error: "unsupported queue action" });
    sendJson(res, 200, await queue.list(queueSessionId(state)));
  } catch (error) {
    if (error instanceof QueueConflictError) return sendJson(res, 409, { error: error.message, code: error.code, snapshot: await queue.list(queueSessionId(state)) });
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}
