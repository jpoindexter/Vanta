import { useCallback, useEffect, useRef, useState } from "react";
import { api, desktopEventSourceUrl } from "./api.js";
import {
  createCompletionSoundPlayer,
  loadCompletionSoundSettings,
  saveCompletionSoundSettings,
  type CompletionSoundPlayer,
  type CompletionSoundSettings,
} from "./completion-sound.js";
import type { AccessMode, Approval, ApprovalDecision, Artifact, CanvasArtifact, Capability, ConnectTestResult, DesktopRunReceipt, DesktopRuntime, EventRow, GatewayStartResult, GoogleConnectStatus, Message, MessagingPlatform, Provider, RailTab, ReleaseProofReport, RuntimeAction, Session, Status, TelegramSetupStatus, Tool } from "./types.js";
import type { SessionDeleteAction } from "./session-safe-ops.js";
import { sessionPinningHandlers } from "./session-pinning-api.js";
import { createSessionDraftController, hasPersistableSessionDraftContext } from "./session-drafts.js";
import type { ImageAttachment } from "../../src/types.js";

export function useDesktopData() {
  const refreshVersion = useRef(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [models, setModels] = useState<Provider[]>([]);
  const [canvas, setCanvas] = useState<CanvasArtifact | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [messaging, setMessaging] = useState<MessagingPlatform[]>([]);
  const [google, setGoogle] = useState<GoogleConnectStatus>({ status: "needs_setup", clientConfigured: false, authorized: false, message: "Checking Google Workspace..." });
  const [releaseProofs, setReleaseProofs] = useState<ReleaseProofReport | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [runtime, setRuntime] = useState<DesktopRuntime>({ selectedHostId: "local", hosts: [] });
  const [tab, setTab] = useState<RailTab>("activity");
  const overlays = useDesktopOverlays();
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    const critical = Promise.allSettled([
      api<Status>("/api/status"), api<Session[]>("/api/sessions"), api<Tool[]>("/api/tools"),
      api<string[]>("/api/files"), api<Provider[]>("/api/models"),
    ]);
    const optional = Promise.allSettled([
      api<CanvasArtifact | null>("/api/canvas").catch(() => null),
      api<Capability[]>("/api/capabilities").catch(() => []), api<MessagingPlatform[]>("/api/messaging").catch(() => []), api<Artifact[]>("/api/artifacts").catch(() => []),
      api<DesktopRuntime>("/api/runtime").catch(() => ({ selectedHostId: "local", hosts: [] })),
      api<GoogleConnectStatus>("/api/connect/google").catch(() => ({ status: "needs_setup", clientConfigured: false, authorized: false, message: "Google Workspace status is unavailable." } as GoogleConnectStatus)),
      api<ReleaseProofReport>("/api/release-proofs").catch(() => null),
    ]);
    const [statusResult, sessionsResult, toolsResult, filesResult, modelsResult] = await critical;
    // A mutation can invalidate an older aggregate refresh while its requests
    // are still in flight. Never let stale status overwrite the saved mode.
    if (version !== refreshVersion.current) return;
    if (statusResult.status === "fulfilled") setStatus(statusResult.value);
    if (sessionsResult.status === "fulfilled") setSessions(sessionsResult.value);
    if (toolsResult.status === "fulfilled") setTools(toolsResult.value);
    if (filesResult.status === "fulfilled") setFiles(filesResult.value);
    if (modelsResult.status === "fulfilled") setModels(modelsResult.value);

    const failure = [statusResult, sessionsResult, toolsResult, filesResult, modelsResult]
      .find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) {
      setError(failure.reason instanceof Error ? failure.reason.message : String(failure.reason));
      setPhase("error");
      void api<Provider[]>("/api/setup").then(setModels).catch(() => undefined);
      return;
    }
    setError(""); setPhase("ready");

    const [canvasResult, capabilitiesResult, messagingResult, artifactsResult, runtimeResult, googleResult, releaseProofsResult] = await optional;
    if (version !== refreshVersion.current) return;
    setCanvas(canvasResult.status === "fulfilled" ? canvasResult.value : null);
    setCapabilities(capabilitiesResult.status === "fulfilled" ? capabilitiesResult.value : []);
    setMessaging(messagingResult.status === "fulfilled" ? messagingResult.value : []);
    setArtifacts(artifactsResult.status === "fulfilled" ? artifactsResult.value : []);
    setRuntime(runtimeResult.status === "fulfilled" ? runtimeResult.value : { selectedHostId: "local", hosts: [] });
    setGoogle(googleResult.status === "fulfilled" ? googleResult.value : { status: "needs_setup", clientConfigured: false, authorized: false, message: "Google Workspace status is unavailable." });
    setReleaseProofs(releaseProofsResult.status === "fulfilled" ? releaseProofsResult.value : null);
  }, []);

  async function setModel(provider: string, model: string, scope: "session" | "global" = "session") {
    await api("/api/model", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ provider, model, scope }) });
    overlays.closeModelPicker();
    await refresh();
  }
  async function refreshProviderModels(providerId: string) {
    const refreshed = await api<Provider[]>(`/api/models/${encodeURIComponent(providerId)}`);
    setModels(refreshed);
  }
  async function setAccessMode(mode: AccessMode) {
    const saved = await api<{ mode: AccessMode; scope: "project" }>("/api/access-mode", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ mode }),
    });
    refreshVersion.current += 1;
    setStatus((current) => current ? { ...current, accessMode: saved.mode, accessScope: saved.scope } : current);
  }

  async function updateRuntime(hostId: string, action?: RuntimeAction) {
    const saved = await api<DesktopRuntime>("/api/runtime", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ hostId, ...(action ? { action } : {}) }),
    });
    setRuntime(saved);
  }

  useEffect(() => { void refresh(); }, [refresh]);
  return {
    status, sessions, tools, files, models, canvas, capabilities, messaging, google, releaseProofs, artifacts, runtime, tab, setTab, phase, error, refresh, refreshProviderModels, setModel, setAccessMode,
    setRuntimeHost: (hostId: string) => updateRuntime(hostId),
    runRuntimeAction: (hostId: string, action: RuntimeAction) => updateRuntime(hostId, action),
    ...overlays,
    saveMessaging: async (id: string, values: Record<string, string>) => {
      await api<MessagingPlatform>("/api/messaging", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ id, values }) });
      await refresh();
    },
    testConnection: (kind: "provider" | "messaging", id?: string) => api<ConnectTestResult>("/api/connect/test", {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ kind, ...(id ? { id } : {}) }),
    }),
    startGateway: () => api<GatewayStartResult>("/api/gateway/start", { method: "POST" }),
    googleConnect: async (action: "ingest_client" | "start" | "complete", clientPath?: string) => {
      const result = await api<GoogleConnectStatus>("/api/connect/google", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ action, ...(clientPath ? { clientPath } : {}) }),
      });
      setGoogle(result);
      return result;
    },
    telegramSetupStatus: () => api<TelegramSetupStatus>("/api/setup/messaging/telegram"),
    saveSetup: async (provider: string, model: string, apiKey: string) => {
      await api("/api/setup", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ provider, model, apiKey }) });
      overlays.closeSetup(); setPhase("loading"); await refresh();
    },
  };
}

function useDesktopOverlays() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  return {
    paletteOpen, modelOpen, soundOpen, setupOpen, settingsOpen, shortcutsOpen,
    openPalette: () => setPaletteOpen(true), closePalette: () => setPaletteOpen(false),
    openModelPicker: () => setModelOpen(true), closeModelPicker: () => setModelOpen(false),
    openSoundSettings: () => setSoundOpen(true), closeSoundSettings: () => setSoundOpen(false),
    openSetup: () => setSetupOpen(true), closeSetup: () => setSetupOpen(false),
    openSettings: () => setSettingsOpen(true), closeSettings: () => setSettingsOpen(false),
    openShortcuts: () => setShortcutsOpen(true), closeShortcuts: () => setShortcutsOpen(false),
  };
}

export function useCompletionSound() {
  const [settings, setSettings] = useState<CompletionSoundSettings>(() => loadCompletionSoundSettings(window.localStorage));
  const player = useRef<CompletionSoundPlayer | null>(null);
  const getPlayer = useCallback(() => {
    const prefixed = (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const AudioContextImpl = window.AudioContext ?? prefixed;
    player.current ??= createCompletionSoundPlayer(AudioContextImpl ? () => new AudioContextImpl() : undefined);
    return player.current;
  }, []);
  const update = useCallback((next: CompletionSoundSettings) => {
    setSettings(next);
    saveCompletionSoundSettings(window.localStorage, next);
  }, []);
  const prime = useCallback(() => {
    if (settings.enabled) getPlayer().prime();
  }, [getPlayer, settings.enabled]);
  const play = useCallback(() => getPlayer().play(settings), [getPlayer, settings]);
  useEffect(() => () => { void player.current?.dispose(); }, []);
  return { settings, update, prime, play, preview: play };
}

type TurnCues = { prime?: () => void; complete?: () => unknown | Promise<unknown> };

export function useConversation(refresh: () => Promise<void>, cues: TurnCues = {}, projectRoot = "") {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [activeTitle, setActiveTitle] = useState("New session");
  const draftController = useRef(createSessionDraftController(window.localStorage, projectRoot, ""));
  const [draft, setDraftState] = useState(() => draftController.current.value());
  const draftSaveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const sessionOpenRequest = useRef(0);
  const [events, setEvents] = useState<EventRow[]>([{ label: "No tool activity yet." }]);
  const [streamText, setStreamText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<DesktopRunReceipt | null>(null);
  const lastFailedMessage = useRef("");
  useEffect(() => {
    const stream = new EventSource(desktopEventSourceUrl("/api/events"));
    stream.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as EventRow & { delta?: string };
        if (event.delta) setStreamText((current) => current + event.delta);
        else if (event.label) setEvents((current) => [...current.filter((row) => row.label !== "thinking..."), event].slice(-200));
      } catch {
        // The final response remains authoritative if a transient SSE frame is malformed.
      }
    };
    return () => stream.close();
  }, []);
  const persistDraft = useCallback((id: string, value: string) => {
    draftSaveQueue.current = draftSaveQueue.current
      .catch(() => undefined)
      .then(() => api("/api/sessions/draft", postJson({ action: "save", id, value })))
      .catch(() => undefined);
    return draftSaveQueue.current;
  }, []);
  const activateDraft = useCallback(async (nextSessionId: string, isCurrent: () => boolean = () => true) => {
    if (!isCurrent()) return;
    const local = draftController.current.activate(projectRoot, nextSessionId);
    setDraftState(local);
    if (!hasPersistableSessionDraftContext(nextSessionId)) return;
    await draftSaveQueue.current.catch(() => undefined);
    if (!isCurrent()) return;
    const stored = await api<{ exists: boolean; value: string }>("/api/sessions/draft", postJson({ action: "load", id: nextSessionId })).catch(() => null);
    const context = draftController.current.context();
    if (!stored || !isCurrent() || context.root !== projectRoot || context.sessionId !== nextSessionId) return;
    if (!stored.exists && local) {
      await persistDraft(nextSessionId, local);
      return;
    }
    draftController.current.update(stored.value);
    setDraftState(stored.value);
  }, [projectRoot]);
  const setDraft = useCallback((updater: string | ((value: string) => string)) => {
    const value = draftController.current.update(updater);
    setDraftState(value);
    const id = draftController.current.context().sessionId;
    if (id) void persistDraft(id, value);
  }, [persistDraft]);
  const clearDraftFor = useCallback(async (id: string) => {
    draftController.current.clear(projectRoot, id);
    await persistDraft(id, "");
  }, [persistDraft, projectRoot]);
  useEffect(() => {
    void activateDraft(sessionId);
  }, [projectRoot]);
  const handlers = conversationHandlers({ refresh, setMessages, setSessionId, setActiveTitle, setEvents, setStreamText, setBusy, setDraft, activateDraft, clearDraftFor, setRecovery, sessionOpenRequest }, cues, lastFailedMessage);
  return { sessionId, messages, activeTitle, draft, setDraft, events, streamText, busy, recovery, stop: () => stopMessage(setEvents), ...handlers };
}

async function stopMessage(setEvents: (events: EventRow[]) => void): Promise<void> {
  try {
    await api<{ stopping: boolean }>("/api/chat/stop", postJson({}));
    setEvents([{ label: "Stop requested by operator.", ok: false }]);
  } catch (error) {
    setEvents([{ label: error instanceof Error ? error.message : String(error), ok: false }]);
  }
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
  setSessionId: (value: string) => void;
  setActiveTitle: (value: string) => void;
  setEvents: (events: EventRow[]) => void;
  setStreamText: (updater: (value: string) => string) => void;
  setBusy: (value: boolean) => void;
  setDraft: (updater: string | ((value: string) => string)) => void;
  activateDraft: (sessionId: string, isCurrent?: () => boolean) => Promise<void>;
  clearDraftFor: (sessionId: string) => Promise<void>;
  setRecovery: (value: DesktopRunReceipt | null) => void;
  sessionOpenRequest: { current: number };
};

function conversationHandlers(state: ConversationState, cues: TurnCues, lastFailedMessage: { current: string }) {
  async function openSession(id: string) {
    const request = ++state.sessionOpenRequest.current;
    const isCurrent = () => state.sessionOpenRequest.current === request;
    // Change draft ownership at selection time; the network response must not keep a prior draft visible.
    state.setSessionId(id);
    await state.activateDraft(id, isCurrent);
    if (!isCurrent()) return;
    const opened = await api<{ title: string; messages: Message[] }>("/api/sessions/open", postJson({ id }));
    if (!isCurrent()) return;
    const recoverable = latestRecoverableRun(opened.messages);
    state.setActiveTitle(opened.title);
    state.setMessages(() => opened.messages);
    state.setRecovery(recoverable?.receipt ?? null);
    lastFailedMessage.current = recoverable?.instruction ?? "";
    state.setStreamText(() => "");
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
  async function deleteSession(id: string, active: boolean, action: SessionDeleteAction = "trash") {
    await api("/api/sessions/delete", postJson(action === "permanent" ? { id, permanent: true } : { id, trashed: action === "trash" }));
    if (action === "permanent") await state.clearDraftFor(id);
    if (active && action !== "restore") await newSession();
    else await state.refresh();
  }
  const pinning = sessionPinningHandlers(state.refresh);
  function insertFile(file: string) { state.setDraft((value) => `${value} @${file}`.trimStart()); }
  async function submit(text: string, images?: ImageAttachment[]): Promise<boolean> {
    return submitMessage(state, text, {
      cues,
      images,
      onRecovery: (failed) => { lastFailedMessage.current = failed ? text : ""; },
    });
  }
  function localReply(text: string, content: string) {
    state.setMessages((messages) => [...messages, { role: "user", content: text }, { role: "assistant", content }]);
    state.setEvents([{ label: "Telegram setup status checked.", ok: true }]);
    state.setStreamText(() => "");
    state.setRecovery(null);
    lastFailedMessage.current = "";
    state.setDraft(() => "");
  }
  async function queue(text: string) {
    const queued = text.trim();
    if (!queued) return;
    try {
      await api<{ queued: boolean }>("/api/chat/queue", postJson({ message: queued }));
      state.setMessages((messages) => [...messages, { role: "user", content: queued }]);
      state.setDraft(() => "");
      state.setEvents([{ label: "Next instruction queued.", ok: true }]);
    } catch (error) {
      state.setEvents([{ label: error instanceof Error ? error.message : String(error), ok: false }]);
    }
  }
  return { openSession, newSession, renameSession, archiveSession, deleteSession, ...pinning, submit, localReply, queue, retry: () => lastFailedMessage.current ? submit(lastFailedMessage.current) : Promise.resolve(), insertFile };
}

export function latestRecoverableRun(messages: Message[]): { receipt: DesktopRunReceipt; instruction: string } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const receipt = messages[index]?.desktopRun;
    if (!receipt || receipt.status === "done") continue;
    return { receipt, instruction: receipt.checkpoint?.instruction?.trim() ?? "" };
  }
  return null;
}

type SubmitMessageOptions = {
  cues?: TurnCues;
  images?: ImageAttachment[];
  onRecovery?: (failed: boolean) => void;
};

export async function submitMessage(state: ConversationState, text: string, options: SubmitMessageOptions = {}): Promise<boolean> {
  const cues = options.cues ?? {};
  const onRecovery = options.onRecovery ?? (() => {});
  cues.prime?.();
  state.setMessages((m) => [...m, { role: "user", content: text }]);
  state.setEvents([{ label: "thinking..." }]);
  state.setStreamText(() => "");
  state.setRecovery(null);
  state.setBusy(true);
  try {
    const result = await api<{ finalText: string; events?: EventRow[]; interrupted?: boolean; receipt?: DesktopRunReceipt }>("/api/chat", postJson(chatPayload(text, options.images)));
    const failed = result.receipt ? result.receipt.status !== "done" : !result.interrupted && Boolean(result.events?.some((event) => event.ok === false));
    state.setMessages((m) => [...m, { role: "assistant", content: result.finalText || "(no text)", ...(result.receipt ? { desktopRun: result.receipt } : {}) }]);
    state.setStreamText(() => "");
    state.setEvents(result.events?.length ? result.events : [{ label: "No tool events returned." }]);
    state.setRecovery(failed ? result.receipt ?? fallbackReceipt(text, result.finalText, result.events) : null);
    onRecovery(failed);
    if (!failed) state.setDraft(() => "");
    await Promise.resolve(cues.complete?.()).catch(() => undefined);
    await state.refresh();
    return !failed;
  } catch (err) {
    state.setMessages((m) => [...m, { role: "assistant", content: (err as Error).message }]);
    state.setStreamText(() => "");
    state.setEvents([{ label: (err as Error).message, ok: false }]);
    state.setRecovery(fallbackReceipt(text, (err as Error).message, [{ label: (err as Error).message, ok: false }]));
    onRecovery(true);
    return false;
  } finally {
    state.setBusy(false);
  }
}

function chatPayload(message: string, images?: ImageAttachment[]): { message: string; images?: ImageAttachment[] } {
  return images?.length ? { message, images } : { message };
}

function fallbackReceipt(instruction: string, partialText: string, events: EventRow[] = []): DesktopRunReceipt {
  return {
    status: "failed",
    failureKind: "unknown",
    events,
    actions: ["retry_failed_step", "edit_request", "start_from_checkpoint"],
    checkpoint: { instruction, ...(partialText ? { partialText } : {}) },
  };
}

function postJson(body: unknown): RequestInit {
  return { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) };
}

function jsonHeaders(): Record<string, string> { return { "content-type": "application/json" }; }
