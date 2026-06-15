import { useEffect, useState } from "react";
import { api } from "./api.js";
import type { Approval, ApprovalDecision, EventRow, Message, Provider, RailTab, Session, Status, Tool } from "./types.js";

export function useDesktopData() {
  const [status, setStatus] = useState<Status | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [models, setModels] = useState<Provider[]>([]);
  const [tab, setTab] = useState<RailTab>("preview");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);

  async function refresh() {
    const [nextStatus, nextSessions, nextTools, nextFiles, nextModels] = await Promise.all([
      api<Status>("/api/status"),
      api<Session[]>("/api/sessions"),
      api<Tool[]>("/api/tools"),
      api<string[]>("/api/files"),
      api<Provider[]>("/api/models"),
    ]);
    setStatus(nextStatus);
    setSessions(nextSessions);
    setTools(nextTools);
    setFiles(nextFiles);
    setModels(nextModels);
  }

  async function setModel(provider: string, model: string) {
    await api("/api/model", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ provider, model }) });
    setModelOpen(false);
    await refresh();
  }

  useEffect(() => { void refresh(); }, []);
  return {
    status, sessions, tools, files, models, tab, setTab, paletteOpen, modelOpen, refresh, setModel,
    openPalette: () => setPaletteOpen(true),
    closePalette: () => setPaletteOpen(false),
    openModelPicker: () => setModelOpen(true),
    closeModelPicker: () => setModelOpen(false),
  };
}

export function useConversation(refresh: () => Promise<void>) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTitle, setActiveTitle] = useState("New session");
  const [draft, setDraft] = useState("");
  const [events, setEvents] = useState<EventRow[]>([{ label: "No tool activity yet." }]);
  const [busy, setBusy] = useState(false);
  const handlers = conversationHandlers({ refresh, setMessages, setActiveTitle, setEvents, setBusy, setDraft });
  return { messages, activeTitle, draft, setDraft, events, busy, ...handlers };
}

export function useApproval() {
  const [approval, setApproval] = useState<Approval | null>(null);
  async function pollApproval() {
    setApproval(await api<Approval | null>("/api/approval").catch(() => null));
  }
  async function answerApproval(decision: ApprovalDecision) {
    if (!approval) return;
    await api("/api/approval", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ id: approval.id, decision }) });
    setApproval(null);
  }
  useEffect(() => {
    const id = window.setInterval(() => void pollApproval(), 900);
    return () => window.clearInterval(id);
  }, []);
  return { approval, answerApproval };
}

type ConversationState = {
  refresh: () => Promise<void>;
  setMessages: (updater: (messages: Message[]) => Message[]) => void;
  setActiveTitle: (value: string) => void;
  setEvents: (events: EventRow[]) => void;
  setBusy: (value: boolean) => void;
  setDraft: (updater: (value: string) => string) => void;
};

function conversationHandlers(state: ConversationState) {
  async function openSession(id: string) {
    const opened = await api<{ title: string; messages: Message[] }>("/api/sessions/open", postJson({ id }));
    state.setActiveTitle(opened.title);
    state.setMessages(() => opened.messages);
    await state.refresh();
  }
  async function newSession() {
    await api<{ id: string }>("/api/sessions/new", { method: "POST" });
    state.setActiveTitle("New session");
    state.setMessages(() => []);
    state.setEvents([{ label: "New session ready.", ok: true }]);
    await state.refresh();
  }
  function insertFile(file: string) {
    state.setDraft((value) => `${value} @${file}`.trimStart());
  }
  return { openSession, newSession, submit: (text: string) => submitMessage(state, text), insertFile };
}

async function submitMessage(state: ConversationState, text: string) {
  state.setMessages((m) => [...m, { role: "user", content: text }]);
  state.setEvents([{ label: "thinking..." }]);
  state.setBusy(true);
  try {
    const result = await api<{ finalText: string; events?: EventRow[] }>("/api/chat", postJson({ message: text }));
    state.setMessages((m) => [...m, { role: "assistant", content: result.finalText || "(no text)" }]);
    state.setEvents(result.events?.length ? result.events : [{ label: "No tool events returned." }]);
    await state.refresh();
  } catch (err) {
    state.setMessages((m) => [...m, { role: "assistant", content: (err as Error).message }]);
    state.setEvents([{ label: (err as Error).message, ok: false }]);
  } finally {
    state.setBusy(false);
  }
}

function postJson(body: unknown): RequestInit {
  return { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) };
}

function jsonHeaders(): Record<string, string> {
  return { "content-type": "application/json" };
}
