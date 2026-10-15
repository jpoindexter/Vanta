import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { withProjectAttachments } from "./use-composer-attachments.js";
import type { ChatFirstState } from "./chat-first-state.js";
import type { NewTaskDraft } from "./overlays.js";
import { acknowledgePendingDesktopProjectTask, switchDesktopProjectForNewTask } from "./project-folder-picker.js";
import { taskPrompt } from "./chat-first-project-task.js";
import { isTelegramSetupQuestion, parseDesktopSetupCommand } from "../../src/setup/telegram-intent.js";
import type { AccessMode } from "./types.js";

export function useChatFirstActions(state: ChatFirstState) {
  const transition = useRef(false);
  const sending = useRef(false);
  const requestFocus = useComposerFocus(state);
  async function submit(text: string) {
    if (sending.current || state.convo.busy || !state.ready) return;
    sending.current = true; state.setSendActive(true); state.setError("");
    try { await sendChat(state, text); }
    catch (reason) { state.setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { sending.current = false; state.setSendActive(false); }
  }
  async function run(operation: () => Promise<unknown>) {
    if (transition.current) return false;
    transition.current = true;
    state.setPending(true); state.setError("");
    try { await operation(); return true; }
    catch (reason) { state.setError(reason instanceof Error ? reason.message : String(reason)); return false; }
    finally { transition.current = false; state.setPending(false); }
  }
  async function navigate(id?: string) {
    if (id && id === state.convo.sessionId) { state.setView("work"); return true; }
    if (sending.current) return false;
    if (!canNavigate(state)) return false;
    return run(async () => {
      await state.convo.flushDraft();
      if (id) await state.convo.openSession(id);
      else await state.convo.newSession();
      state.setView("work");
      if (window.innerWidth < 900) state.setSidebar(false);
      requestFocus();
    });
  }
  return {
    run, navigate,
    submit,
    enqueue: (text: string) => run(async () => {
      await api("/api/chat/queue", post({ message: text }));
      state.convo.setDraft((current) => current === text ? "" : current); await state.queue.refresh();
    }),
    createTask: (draft: NewTaskDraft) => createTask(state, draft),
    rename: (id: string, title: string) => run(() => state.convo.renameSession(id, title, id === state.convo.sessionId)),
    archive: (id: string, archived: boolean) => {
      if (id === state.convo.sessionId && !canNavigate(state)) return Promise.resolve(false);
      return run(() => state.convo.archiveSession(id, archived, id === state.convo.sessionId));
    },
    pin: (id: string, pinned: boolean) => run(() => state.convo.pinSession(id, pinned)),
    cycleAccess: () => run(() => cycleChatAccess(state)),
  };
}

function useComposerFocus(state: ChatFirstState) {
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    if (!requested || state.pending || !state.ready || state.convo.busy || state.view !== "work") return;
    document.getElementById("vanta-composer")?.focus();
    setRequested(false);
  }, [requested, state.pending, state.ready, state.convo.busy, state.view]);
  return () => setRequested(true);
}

function cycleChatAccess(state: ChatFirstState) {
  const modes: AccessMode[] = ["auto", "full", "ask", "approve", "plan"];
  return state.data.setAccessMode(modes[(modes.indexOf(state.data.status?.accessMode ?? "approve") + 1) % modes.length] ?? "ask");
}

function canNavigate(state: ChatFirstState): boolean {
  if (state.convo.busy) { state.setError("Stop the current response before switching chats."); return false; }
  if (state.attachments.items.length || state.attachments.images.length) {
    state.setError("Send or remove the attached context before switching chats. Your text draft is saved."); return false;
  }
  return state.ready && !state.pending;
}

async function sendChat(state: ChatFirstState, text: string) {
  const setup = parseDesktopSetupCommand(text);
  if (setup) {
    if (setup.section === "model") state.data.openModelPicker();
    else if (setup.section === "unknown") state.setError(`Unknown setup section: ${setup.value}.`);
    else {
      state.setConnectTarget({ key: Date.now(), section: setup.section, ...(setup.section === "messaging" && setup.platformId ? { messagingId: setup.platformId } : {}) });
      state.setView("connect");
    }
    return;
  }
  if (isTelegramSetupQuestion(text)) {
    const status = await state.data.telegramSetupStatus();
    state.convo.localReply(text, `${status.title}\n${status.detail}\n${status.action.label}: ${status.action.command}`);
    state.setConnectTarget({ key: Date.now(), section: "messaging", messagingId: "telegram" });
    state.setView("connect"); return;
  }
  const sent = await state.convo.submit(withProjectAttachments(text, state.attachments.files), state.attachments.images, state.attachments.files);
  if (sent) state.attachments.clear();
  // A single desktop request can drain several queued turns. Reload its canonical
  // history rather than displaying only the last response returned by that request.
  if (state.convo.sessionId) await state.convo.openSession(state.convo.sessionId);
}

async function createTask(state: ChatFirstState, draft: NewTaskDraft) {
  if (!canNavigate(state)) throw new Error("Finish the current chat action first.");
  await state.convo.flushDraft();
  if (draft.folder.replace(/\/+$/, "") !== state.data.status?.root?.replace(/\/+$/, "")) {
    await switchDesktopProjectForNewTask(draft); return;
  }
  await state.convo.newSession();
  state.convo.setDraft(taskPrompt(draft));
  if (state.projectTaskRecovery) {
    await acknowledgePendingDesktopProjectTask(state.projectTaskRecovery.id);
    state.setProjectTaskRecovery(null);
  }
  state.setTaskOpen(false); state.setView("work");
}

export function post(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export type ChatFirstActions = ReturnType<typeof useChatFirstActions>;
