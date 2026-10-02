import http from "node:http";
import { randomUUID } from "node:crypto";
import { prepareRun } from "../session.js";
import { providerIdFor,resolveSessionModel } from "../sessions/model-scope.js";
import { reorderPinnedSessions,setSessionPinned } from "../sessions/pinning.js";
import { deleteSession,listAllSessions,loadSession,newSessionId,renameSession,saveSession,setSessionArchived,setSessionTrashed } from "../sessions/store.js";
import { attachConversation } from "./handler-conversation.js";
import { readJson,sendJson } from "./handler-http.js";
import { type DesktopState } from "./handler-state.js";

export async function handleSessions(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await listAllSessions(process.env));
}

export async function handleNewSession(state: DesktopState, res: http.ServerResponse): Promise<void> {
  state.pendingRunLineage = undefined;
  state.pendingRunPreparedAt = undefined;
  state.forceFreshApprovals = false;
  const setup = state.setup ?? await prepareRun(state.root, "desktop interface session");
  state.setup = setup;
  state.sessionId = `${newSessionId()}-${randomUUID()}`;
  state.sessionStarted = new Date().toISOString();
  state.providerId = providerIdFor(setup.provider, process.env);
  state.modelId = setup.provider.modelId();
  attachConversation(state, setup);
  await saveSession(state.sessionId, [], { started: state.sessionStarted,
    providerId: state.providerId, modelId: state.modelId, title: "New chat" });
  sendJson(res, 200, { id: state.sessionId });
}

export async function handleOpenSession(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const session = id ? await loadSession(id, process.env) : null;
  if (!session) return sendJson(res, 404, { error: "session not found" });
  const openingPreparedRun = state.sessionId === session.id && state.pendingRunLineage !== undefined;
  if (!openingPreparedRun) {
    state.pendingRunLineage = undefined;
    state.pendingRunPreparedAt = undefined;
    state.forceFreshApprovals = false;
  }
  const setup = state.setup ?? await prepareRun(state.root, "desktop interface session");
  const sessionProvider = resolveSessionModel(session, process.env);
  if (sessionProvider) setup.provider = sessionProvider;
  state.setup = setup; state.sessionId = session.id; state.sessionStarted = session.started;
  state.providerId = session.providerId ?? providerIdFor(setup.provider, process.env);
  state.modelId = session.modelId ?? setup.provider.modelId();
  attachConversation(state, setup, { history: session.messages });
  sendJson(res, 200, { id: session.id, title: session.title, messages: session.messages.filter((m) => m.role !== "system") });
}

export function sessionIdFromBody(body: { id?: unknown }): string {
  return typeof body.id === "string" ? body.id.trim() : "";
}

export type DeleteSessionRequest = { id: string; trashed: boolean; permanent: boolean };

export type BulkSessionAction = "archive" | "unarchive" | "trash" | "restore" | "delete";

export function parseDeleteSessionRequest(body: { id?: unknown; trashed?: unknown; permanent?: unknown }): DeleteSessionRequest | { error: string } {
  const id = sessionIdFromBody(body);
  if (!id) return { error: "session id is required" };
  if (body.trashed !== undefined && typeof body.trashed !== "boolean") return { error: "trashed must be boolean" };
  if (body.permanent !== undefined && typeof body.permanent !== "boolean") return { error: "permanent must be boolean" };
  return { id, trashed: body.trashed ?? true, permanent: body.permanent === true };
}

export function clearActiveSession(state: DesktopState, id: string, shouldClear: boolean): void {
  if (state.sessionId !== id || !shouldClear) return;
  state.convo = undefined; state.sessionId = undefined; state.sessionStarted = undefined;
  state.providerId = undefined; state.modelId = undefined; state.currentEvents = undefined;
  state.pendingRunLineage = undefined; state.pendingRunPreparedAt = undefined; state.forceFreshApprovals = false;
}

export function parseBulkSessionRequest(body: { ids?: unknown; action?: unknown }): { ids: string[]; action: BulkSessionAction } | { error: string } {
  if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 500) {
    return { error: "ids must contain between 1 and 500 session ids" };
  }
  if (body.ids.some((id) => typeof id !== "string" || !id.trim())) return { error: "every session id must be a non-empty string" };
  const ids = [...new Set((body.ids as string[]).map((id) => id.trim()))];
  const action = body.action;
  if (action !== "archive" && action !== "unarchive" && action !== "trash" && action !== "restore" && action !== "delete") {
    return { error: "action must be archive, unarchive, trash, restore, or delete" };
  }
  return { ids, action };
}

export async function handleRenameSession(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { id?: unknown; title?: unknown };
  const id = sessionIdFromBody(body);
  const title = typeof body.title === "string" ? body.title.trim().replace(/\s+/g, " ") : "";
  if (!id) return sendJson(res, 400, { error: "session id is required" });
  if (!title) return sendJson(res, 400, { error: "session title is required" });
  if (title.length > 120) return sendJson(res, 400, { error: "session title must be 120 characters or fewer" });
  const session = await renameSession(id, title, process.env);
  if (!session) return sendJson(res, 404, { error: "session not found" });
  sendJson(res, 200, { id: session.id, title: session.title });
}

export async function handleArchiveSession(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { id?: unknown; archived?: unknown };
  const id = sessionIdFromBody(body);
  if (!id) return sendJson(res, 400, { error: "session id is required" });
  if (body.archived !== undefined && typeof body.archived !== "boolean") return sendJson(res, 400, { error: "archived must be boolean" });
  const session = await setSessionArchived(id, body.archived ?? true, process.env);
  if (!session) return sendJson(res, 404, { error: "session not found" });
  sendJson(res, 200, { id: session.id, archived: Boolean(session.archived) });
}

export async function handlePinSession(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { id?: unknown; pinned?: unknown };
  const id = sessionIdFromBody(body);
  if (!id) return sendJson(res, 400, { error: "session id is required" });
  if (typeof body.pinned !== "boolean") return sendJson(res, 400, { error: "pinned must be boolean" });
  const session = await setSessionPinned(id, body.pinned, process.env);
  if (!session) return sendJson(res, 404, { error: "active session not found" });
  sendJson(res, 200, { id: session.id, pinned: Boolean(session.pinned), pinOrder: session.pinOrder });
}

export async function handleReorderPinnedSessions(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { orderedIds?: unknown };
  if (!Array.isArray(body.orderedIds) || body.orderedIds.some((id) => typeof id !== "string" || !id)) {
    return sendJson(res, 400, { error: "orderedIds must be a list of session ids" });
  }
  const sessions = await reorderPinnedSessions(body.orderedIds as string[], process.env);
  if (!sessions) return sendJson(res, 409, { error: "pinned session order is stale; refresh and retry" });
  sendJson(res, 200, { orderedIds: sessions.filter((session) => !session.archived && !session.trashed).map((session) => session.id) });
}

export async function handleDeleteSession(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { id?: unknown; trashed?: unknown; permanent?: unknown };
  const parsed = parseDeleteSessionRequest(body);
  if ("error" in parsed) return sendJson(res, 400, parsed);
  const { id, permanent, trashed } = parsed;
  const session = await loadSession(id, process.env);
  if (!session) return sendJson(res, 404, { error: "session not found" });
  if (permanent) {
    await deleteSession(id, process.env);
  }
  else await setSessionTrashed(id, trashed, process.env);
  clearActiveSession(state, id, permanent || trashed);
  sendJson(res, 200, { id, trashed: permanent ? undefined : trashed, permanent });
}

export async function handleBulkSessions(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { ids?: unknown; action?: unknown };
  const parsed = parseBulkSessionRequest(body);
  if ("error" in parsed) return sendJson(res, 400, parsed);
  const { ids, action } = parsed;
  const sessions = await Promise.all(ids.map((id) => loadSession(id, process.env)));
  const missing = ids.filter((_id, index) => !sessions[index]);
  if (missing.length) return sendJson(res, 404, { error: `${missing.length} selected session${missing.length === 1 ? " is" : "s are"} no longer available`, missing });

  await Promise.all(ids.map(async (id) => {
    if (action === "archive" || action === "unarchive") await setSessionArchived(id, action === "archive", process.env);
    else if (action === "delete") await deleteSession(id, process.env);
    else await setSessionTrashed(id, action === "trash", process.env);
    clearActiveSession(state, id, action === "trash" || action === "delete");
  }));
  sendJson(res, 200, { action, count: ids.length, ids });
}
