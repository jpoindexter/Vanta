import { api } from "./api.js";
import { latestRecoverableRun } from "./conversation-submit.js";
import type { ConversationState } from "./conversation-types.js";
import { postJson } from "./request-json.js";
import { sessionPinningHandlers } from "./session-pinning-api.js";
import type { SessionDeleteAction } from "./session-safe-ops.js";
import type { Message } from "./types.js";

export function sessionHandlers(state: ConversationState, lastFailedMessage: { current: string }) {
  async function openSession(id: string) {
    const request = ++state.sessionOpenRequest.current;
    const isCurrent = () => state.sessionOpenRequest.current === request;
    const opened = await api<{ title: string; messages: Message[] }>("/api/sessions/open", postJson({ id }));
    if (!isCurrent()) return;
    // Keep the original owner and draft until the runtime accepts the selection.
    state.setSessionId(id);
    const recoverable = latestRecoverableRun(opened.messages);
    state.setActiveTitle(opened.title);
    state.setMessages(() => opened.messages);
    const latestReceipt = [...opened.messages].reverse().find((message) => message.desktopRun)?.desktopRun;
    state.setEvents(latestReceipt?.events ?? []);
    state.setRecovery(recoverable?.receipt ?? null);
    lastFailedMessage.current = recoverable?.instruction ?? "";
    state.setStreamText(() => "");
    await state.activateDraft(id, isCurrent);
    if (!isCurrent()) return;
    await state.refresh();
  }
  async function newSession() {
    const request = ++state.sessionOpenRequest.current;
    const isCurrent = () => state.sessionOpenRequest.current === request;
    const created = await api<{ id: string }>("/api/sessions/new", { method: "POST" });
    if (!isCurrent()) return;
    state.setSessionId(created.id);
    await state.activateDraft(created.id, isCurrent);
    if (!isCurrent()) return;
    state.setActiveTitle("New session");
    state.setMessages(() => []);
    state.setRecovery(null);
    lastFailedMessage.current = "";
    state.setEvents([{ label: "New session ready.", ok: true }]);
    state.setStreamText(() => "");
    await state.refresh();
  }
  return { openSession, newSession, ...sessionMutations(state, newSession), ...sessionPinningHandlers(state.refresh) };
}

function sessionMutations(state: ConversationState, newSession: () => Promise<void>) {
  async function renameSession(id: string, title: string, active: boolean) {
    const renamed = await api<{ title: string }>("/api/sessions/rename", postJson({ id, title }));
    if (active) state.setActiveTitle(renamed.title);
    await state.refresh();
  }
  async function archiveSession(id: string, archived: boolean, active: boolean) {
    await api("/api/sessions/archive", postJson({ id, archived }));
    if (active && archived) await newSession();
    else await state.refresh();
  }
  async function archiveSessions(ids: string[], archived: boolean, active: boolean) {
    await api("/api/sessions/bulk", postJson({ ids, action: archived ? "archive" : "unarchive" }));
    if (active && archived) await newSession();
    else await state.refresh();
  }
  async function deleteSession(id: string, active: boolean, action: SessionDeleteAction = "trash") {
    await api("/api/sessions/delete", postJson(action === "permanent" ? { id, permanent: true } : { id, trashed: action === "trash" }));
    if (action === "permanent") await state.clearDraftFor(id);
    if (active && action !== "restore") await newSession();
    else await state.refresh();
  }
  async function deleteSessions(ids: string[], active: boolean, action: SessionDeleteAction = "trash") {
    await api("/api/sessions/bulk", postJson({ ids, action: action === "permanent" ? "delete" : action }));
    if (action === "permanent") await Promise.all(ids.map((id) => state.clearDraftFor(id)));
    if (active && action !== "restore") await newSession();
    else await state.refresh();
  }
  return { renameSession, archiveSession, archiveSessions, deleteSession, deleteSessions };
}
