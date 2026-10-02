import { useEffect, useRef, useState } from "react";
import { useApproval, useCompletionSound, useConversation, useDesktopData } from "./state.js";
import { useQueuedTurns } from "./queued-turns.js";
import { useComposerAttachments } from "./use-composer-attachments.js";
import { useDesktopMcp } from "./mcp-state.js";
import { useContinuity } from "./continuity-state.js";
import { fullAccessScope, useFullAccessWarning } from "./full-access-warning.js";
import type { DesktopView } from "./types.js";
import type { PendingDesktopProjectTask } from "./project-folder-picker.js";
import { currentRecovery, rememberChatSelection, restoreChatSelection } from "./chat-first-navigation.js";
import { useChatLayout } from "./chat-first-layout.js";
import { useDocumentWorkbench } from "./chat-first-documents.js";
import { useDesktopTheme } from "./desktop-theme.js";

export function useChatFirstState() {
  const data = useDesktopData();
  const sound = useCompletionSound();
  const conversation = useConversation(data.refreshConversation, { prime: sound.prime, complete: sound.play }, data.status?.root ?? "");
  const convo = { ...conversation, recovery: currentRecovery(conversation.messages, conversation.recovery) };
  const queue = useQueuedTurns(convo.sessionId, true);
  const attachments = useComposerAttachments();
  const approval = useApproval();
  const mcp = useDesktopMcp();
  const continuity = useContinuity();
  const warning = useFullAccessWarning(data.status?.accessMode ?? "approve", fullAccessScope(data.status?.root));
  const layout = useChatLayout();
  const documents = useDocumentWorkbench(data.status?.root ?? "");
  const [view, setView] = useState<DesktopView | "history">("work");
  const [connectTarget, setConnectTarget] = useState<{ key: number; section: "overview" | "capabilities" | "mcp" | "messaging" | "google"; messagingId?: string }>({ key: 0, section: "overview" });
  const [contextTab, setContextTab] = useState<"files" | "review" | "sources" | "activity" | "canvas">("files");
  const [inspector, setInspector] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [taskOpen, setTaskOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [sendActive, setSendActive] = useState(false);
  const [projectTaskRecovery, setProjectTaskRecovery] = useState<(PendingDesktopProjectTask & { error: string }) | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [theme, setTheme] = useDesktopTheme();
  const ready = useChatBoot({ data, convo, setError, attempt: bootAttempt });
  useEffect(() => {
    if (ready) rememberChatSelection(localStorage, data.status?.root ?? "", convo.sessionId);
  }, [ready, data.status?.root, convo.sessionId]);
  return { data, sound, convo, queue, attachments, approval, mcp, continuity, warning, layout, documents, contextTab, setContextTab,
    view, setView, connectTarget, setConnectTarget, inspector, setInspector, sidebar, setSidebar, taskOpen, setTaskOpen,
    error, setError, pending: chatNavigationPending(pending, sendActive, convo.busy), setPending, setSendActive,
    settling: sendActive && !convo.busy, ready: ready && data.phase === "ready", theme, setTheme, setBootAttempt, projectTaskRecovery, setProjectTaskRecovery };
}

export function chatNavigationPending(pending: boolean, sending: boolean, busy: boolean) {
  return pending || (sending && !busy);
}

type Boot = { data: ReturnType<typeof useDesktopData>; convo: ReturnType<typeof useConversation>; setError: (value: string) => void; attempt: number };

function useChatBoot({ data, convo, setError, attempt }: Boot): boolean {
  const [ready, setReady] = useState(false);
  const started = useRef(-1);
  useEffect(() => {
    if (data.phase !== "ready" || ready || started.current === attempt) return;
    started.current = attempt;
    const active = data.sessions.find((session) => session.id === data.status?.sessionId && !session.trashed && !session.archived);
    const selected = active?.id ?? restoreChatSelection(localStorage, data.status?.root ?? "", data.sessions);
    const operation = selected ? convo.openSession(selected) : convo.newSession();
    void operation.then(() => setReady(true)).catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, [data.phase, data.sessions, data.status?.sessionId, convo, setError, attempt, ready]);
  return ready;
}

export type ChatFirstState = ReturnType<typeof useChatFirstState>;
