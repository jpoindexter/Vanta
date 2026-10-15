import { useRef,useState } from "react";
import { useContinuity } from "./continuity-state.js";
import { useDesktopTheme } from "./desktop-theme.js";
import { mentionedProjectFiles } from "./file-context.js";
import { fullAccessScope,useFullAccessWarning } from "./full-access-warning.js";
import { useDesktopMcp } from "./mcp-state.js";
import type { PendingDesktopProjectTask } from "./project-folder-picker.js";
import { useQueuedTurns } from "./queued-turns.js";
import { useRunLibrary } from "./run-library-state.js";
import { useApproval,useCompletionSound,useConversation,useDesktopData } from "./state.js";
import type { DesktopView } from "./types.js";
import { useComposerAttachments } from "./use-composer-attachments.js";

export type ConnectTarget = { key: number; section: "overview" | "capabilities" | "mcp" | "messaging" | "google"; messagingId?: string };

const SIDEBAR_STORAGE_KEY = "vanta.desktop.sidebar-width";
export const MIN_SIDEBAR_WIDTH = 216;
export const MAX_SIDEBAR_WIDTH = 420;
export const MIN_WORK_WIDTH = 380;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function storedPaneWidth(key: string, fallback: number): number {
  const stored = window.localStorage.getItem(key);
  if (stored === null || stored.trim() === "") return fallback;
  const value = Number(stored);
  return Number.isFinite(value) ? value : fallback;
}


export function useClassicState() {
  const data = useDesktopData();
  const sound = useCompletionSound();
  const convo = useConversation(data.refresh, { prime: sound.prime, complete: sound.play }, data.status?.root ?? "");
  const [queueOpen, setQueueOpen] = useState(false);
  const queued = useQueuedTurns(convo.sessionId || data.status?.sessionId, convo.busy || queueOpen);
  const approval = useApproval();
  const mcp = useDesktopMcp();
  const continuity = useContinuity();
  const accessWarning = useFullAccessWarning(data.status?.accessMode ?? "approve", fullAccessScope(data.status?.root));
  const [mobilePanel, setMobilePanel] = useState<"sessions" | "work" | "inspect">("work");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<DesktopView>("work");
  const [connectTarget, setConnectTarget] = useState<ConnectTarget | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [theme, setTheme] = useDesktopTheme();
  const attachments = useComposerAttachments();
  const runLibrary = useRunLibrary();
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [projectTaskRecovery, setProjectTaskRecovery] = useState<(PendingDesktopProjectTask & { error?: string }) | null>(null);
  const [conversationReady, setConversationReady] = useState(false);
  const panes = useClassicPanes();
  const { sidebarWidth, preferredSidebarWidth } = panes;
  const bootSession = useRef("");
  const pendingProjectTaskAttempted = useRef(false);
  return { data, sound, convo, queueOpen, setQueueOpen, queued, approval, mcp, continuity, accessWarning, mobilePanel, setMobilePanel, sidebarCollapsed, setSidebarCollapsed, view, setView, connectTarget, setConnectTarget, inspectorOpen, setInspectorOpen, theme, setTheme, attachments, runLibrary, newTaskOpen, setNewTaskOpen, projectTaskRecovery, setProjectTaskRecovery, conversationReady, setConversationReady, bootSession, pendingProjectTaskAttempted, ...panes };
}

function useClassicPanes() {
  const [sidebarWidth, setSidebarWidth] = useState(() => storedPaneWidth(SIDEBAR_STORAGE_KEY, 268));
  const preferredSidebarWidth = useRef(sidebarWidth);
  function changeSidebarWidth(next: number) {
    preferredSidebarWidth.current = next;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    setSidebarWidth(next);
  }
  return { sidebarWidth, setSidebarWidth, preferredSidebarWidth, changeSidebarWidth };
}

export type ClassicState = ReturnType<typeof useClassicState>;

export function classicShellPresentation(state: ClassicState) {
  const { inspectorOpen, view, data, convo } = state;
  const inspectorVisible = inspectorOpen && view === "work";
  const sidebarMaximum = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth - MIN_WORK_WIDTH));
  const mentionedFiles = mentionedProjectFiles(data.files, [...convo.messages.map((message) => message.content ?? ""), convo.draft]);
  const reviewCount = new Set([
    ...mentionedFiles,
    ...data.artifacts.filter((artifact) => !artifact.sessionId || artifact.sessionId === (convo.sessionId || data.status?.sessionId)).map((artifact) => artifact.value),
  ]).size + convo.events.filter((event) => event.ok === false).length;
  return { inspectorVisible, sidebarMaximum, mentionedFiles, reviewCount };
}
