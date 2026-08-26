import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Bell, Command, FolderKanban, ListOrdered, MessageSquarePlus, PanelLeft, RefreshCw } from "lucide-react";
import { ChatThread, Composer, SessionSidebar } from "./chat.js";
import { CommandPalette, KeyboardShortcuts, ModelPicker, NewTaskDialog, SettingsDialog, SetupWizard, type NewTaskDraft } from "./overlays.js";
import { ArtifactsView, ConnectView, PluginsView, ScheduledView } from "./operator-views.js";
import { RightRail } from "./rail.js";
import { CompletionSoundSettings } from "./sound-settings.js";
import { FullAccessWarning, fullAccessScope, useFullAccessWarning } from "./full-access-warning.js";
import { mentionedProjectFiles } from "./file-context.js";
import { connectionRecovery } from "./connection-recovery.js";
import { useApproval, useCompletionSound, useConversation, useDesktopData } from "./state.js";
import { useDesktopMcp } from "./mcp-state.js";
import { QueuedTurnDrawer, useQueuedTurns } from "./queued-turns.js";
import type { AccessMode, DesktopTheme, DesktopView } from "./types.js";
import { isTelegramSetupQuestion, parseDesktopSetupCommand } from "../../src/setup/telegram-intent.js";
import { reconnectProviderAndResume } from "./provider-auth-recovery.js";
import { useComposerAttachments, withProjectAttachments } from "./use-composer-attachments.js";
import { useRunLibrary } from "./run-library-state.js";
import { acknowledgePendingDesktopProjectTask, readPendingDesktopProjectTask, switchDesktopProjectForNewTask, type PendingDesktopProjectTask } from "./project-folder-picker.js";
import { ContinuityView } from "./continuity-view.js";
import { useContinuity } from "./continuity-state.js";
import { RuntimeStrip } from "./runtime-strip.js";
import { LoadingIndicator } from "./form-controls.js";

type DesktopData = ReturnType<typeof useDesktopData>;
type CompletionSound = ReturnType<typeof useCompletionSound>;
type DesktopMcp = ReturnType<typeof useDesktopMcp>;
type Continuity = ReturnType<typeof useContinuity>;

const SIDEBAR_STORAGE_KEY = "vanta.desktop.sidebar-width";
const MIN_SIDEBAR_WIDTH = 216;
const MAX_SIDEBAR_WIDTH = 420;
const MIN_WORK_WIDTH = 380;
const ACCESS_MODE_CYCLE: AccessMode[] = ["auto", "full", "ask", "approve", "plan"];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function storedPaneWidth(key: string, fallback: number): number {
  const stored = window.localStorage.getItem(key);
  if (stored === null || stored.trim() === "") return fallback;
  const value = Number(stored);
  return Number.isFinite(value) ? value : fallback;
}

function comparableProjectPath(value: string | undefined): string {
  if (!value) return "";
  return value.length > 1 ? value.replace(/\/+$/, "") : value;
}

export function AppShell() {
  useInputModality();
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
  const [theme, setTheme] = useState<DesktopTheme>(() => window.localStorage.getItem("vanta.desktop.theme") === "light" ? "light" : "dark");
  const attachments = useComposerAttachments();
  const runLibrary = useRunLibrary();
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [projectTaskRecovery, setProjectTaskRecovery] = useState<(PendingDesktopProjectTask & { error?: string }) | null>(null);
  const [conversationReady, setConversationReady] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => storedPaneWidth(SIDEBAR_STORAGE_KEY, 268));
  const preferredSidebarWidth = useRef(sidebarWidth);
  const bootSession = useRef("");
  const pendingProjectTaskAttempted = useRef(false);
  function changeTheme(next: DesktopTheme) { setTheme(next); window.localStorage.setItem("vanta.desktop.theme", next); }
  function changeSidebarWidth(next: number) {
    preferredSidebarWidth.current = next;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    setSidebarWidth(next);
  }
  const inspectorVisible = inspectorOpen && view === "work";
  const sidebarMaximum = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth - MIN_WORK_WIDTH));
  const mentionedFiles = mentionedProjectFiles(data.files, [...convo.messages.map((message) => message.content ?? ""), convo.draft]);
  const reviewCount = new Set([
    ...mentionedFiles,
    ...data.artifacts.filter((artifact) => !artifact.sessionId || artifact.sessionId === (convo.sessionId || data.status?.sessionId)).map((artifact) => artifact.value),
  ]).size + convo.events.filter((event) => event.ok === false).length;
  function cycleAccessMode() {
    const current = data.status?.accessMode ?? "approve";
    const index = ACCESS_MODE_CYCLE.indexOf(current);
    const next = ACCESS_MODE_CYCLE[(index + 1 + ACCESS_MODE_CYCLE.length) % ACCESS_MODE_CYCLE.length] ?? "auto";
    void data.setAccessMode(next);
  }
  function openTelegramSetup() {
    setConnectTarget({ key: Date.now(), section: "messaging", messagingId: "telegram" });
    setView("connect");
    setMobilePanel("work");
  }
  function openNewTask() {
    if (!conversationReady) return;
    setNewTaskOpen(true);
  }
  function openView(next: DesktopView) {
    setView(next);
    setInspectorOpen(false);
    setMobilePanel("work");
  }
  async function submitWork(text: string) {
    if (!conversationReady) return;
    const setupTarget = parseDesktopSetupCommand(text);
    if (setupTarget) {
      if (setupTarget.section === "model") data.openModelPicker();
      else if (setupTarget.section === "unknown") convo.localReply(text, `Unknown setup section: ${setupTarget.value}.\nUse /setup, /setup model, /setup messaging, /setup telegram, or /setup mcp.`);
      else {
        setConnectTarget({
          key: Date.now(),
          section: setupTarget.section,
          ...(setupTarget.section === "messaging" && setupTarget.platformId ? { messagingId: setupTarget.platformId } : {}),
        });
        setView("connect");
        setMobilePanel("work");
      }
      return;
    }
    if (!isTelegramSetupQuestion(text)) {
      const sent = await convo.submit(withProjectAttachments(text, attachments.files), attachments.images, attachments.files);
      if (sent) {
        attachments.clear();
        await runLibrary.refresh();
      }
      return;
    }
    try {
      const status = await data.telegramSetupStatus();
      convo.localReply(text, [status.title, status.detail, `${status.action.label}: ${status.action.command}`].join("\n"));
      openTelegramSetup();
    } catch (error) {
      convo.localReply(text, `Telegram setup status is unavailable.\nRetry: ${(error as Error).message}`);
    }
  }

  async function createNewTask(draft: NewTaskDraft) {
    if (!conversationReady) throw new Error("Wait for the current project to finish loading.");
    if (comparableProjectPath(draft.folder) !== comparableProjectPath(data.status?.root)) {
      await switchDesktopProjectForNewTask(draft);
      return;
    }
    await createTask(draft, convo, () => { setNewTaskOpen(false); setView("work"); });
    if (projectTaskRecovery) await acknowledgePendingDesktopProjectTask(projectTaskRecovery.id);
    setProjectTaskRecovery(null);
  }

  useEffect(() => {
    function constrainPanes() {
      if (window.innerWidth <= 760 && mobilePanel !== "inspect") setInspectorOpen(false);
      const nextSidebar = clamp(preferredSidebarWidth.current, MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth - MIN_WORK_WIDTH));
      setSidebarWidth((current) => current === nextSidebar ? current : nextSidebar);
    }
    constrainPanes();
    window.addEventListener("resize", constrainPanes);
    return () => window.removeEventListener("resize", constrainPanes);
  }, [mobilePanel]);

  useEffect(() => {
    if (data.phase !== "ready") {
      setConversationReady(false);
      return;
    }
    if (bootSession.current) return;
    const id = data.sessions.find((session) => session.id === data.status?.sessionId)?.id ?? data.sessions.find((session) => !session.archived)?.id;
    if (!id) {
      setConversationReady(true);
      return;
    }
    bootSession.current = id;
    void convo.openSession(id)
      .catch(() => { bootSession.current = ""; })
      .finally(() => setConversationReady(true));
  }, [convo.openSession, data.phase, data.sessions, data.status?.sessionId]);

  useEffect(() => {
    if (!conversationReady || pendingProjectTaskAttempted.current) return;
    pendingProjectTaskAttempted.current = true;
    void (async () => {
      const pending = await readPendingDesktopProjectTask();
      if (!pending) return;
      if (comparableProjectPath(pending.targetRoot) !== comparableProjectPath(data.status?.root)) {
        throw Object.assign(new Error("The retained task does not match the active project."), { pending });
      }
      try {
        await createTask(pending.draft, convo, () => { setNewTaskOpen(false); setView("work"); });
        await acknowledgePendingDesktopProjectTask(pending.id);
      } catch (error) {
        setProjectTaskRecovery({ ...pending, error: error instanceof Error ? error.message : "Vanta could not restore the task after switching projects." });
        setNewTaskOpen(true);
      }
    })().catch((error) => {
      const pending = (error as Error & { pending?: PendingDesktopProjectTask }).pending;
      if (pending) setProjectTaskRecovery({ ...pending, error: error instanceof Error ? error.message : "Vanta could not restore the task after switching projects." });
      setNewTaskOpen(Boolean(pending));
    });
  }, [conversationReady, convo, data.status?.root]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); data.openPalette(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") { event.preventDefault(); openNewTask(); }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "r") { event.preventDefault(); data.setTab("files"); setInspectorOpen(true); setMobilePanel("inspect"); }
      if (event.shiftKey && event.key === "Tab") { event.preventDefault(); cycleAccessMode(); }
      if (event.key === "?") { const target = event.target as HTMLElement | null; if (target?.tagName !== "INPUT" && target?.tagName !== "TEXTAREA") data.openShortcuts(); }
      if (event.key === "Escape") { data.closePalette(); data.closeModelPicker(); data.closeSoundSettings(); data.closeSettings(); data.closeShortcuts(); setInspectorOpen(false); setMobilePanel("work"); }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [convo.newSession, data]);

  return (
    <div
      className={`app-shell theme-${theme} panel-${mobilePanel} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${inspectorVisible ? "inspector-open" : ""} ${data.tab === "canvas" && inspectorVisible ? "canvas-open" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DesktopHeader
        title={view === "work" ? convo.activeTitle : viewLabel(view)}
        reviewCount={reviewCount}
        queueCount={queued.snapshot.items.length}
        inspectorOpen={inspectorOpen}
        sidebarCollapsed={sidebarCollapsed}
        onNew={openNewTask}
        onSidebar={() => {
          if (window.innerWidth <= 760) setMobilePanel((panel) => panel === "sessions" ? "work" : "sessions");
          else setSidebarCollapsed((collapsed) => !collapsed);
        }}
        onQueue={() => setQueueOpen(true)}
        onCommand={data.openPalette}
        onInspector={() => { if (!inspectorOpen) data.setTab("files"); setInspectorOpen((open) => !open); setMobilePanel(inspectorOpen ? "work" : "inspect"); }}
      />
      <SessionSidebar
        sessions={data.sessions}
        root={data.status?.root}
        activeId={data.status?.sessionId}
        onNew={openNewTask}
        onOpen={(id) => { openView("work"); void convo.openSession(id); }}
        onRename={(id, title) => convo.renameSession(id, title, id === data.status?.sessionId)}
        onArchive={(id, archived) => convo.archiveSession(id, archived, id === data.status?.sessionId)}
        onDelete={(id, action) => convo.deleteSession(id, id === data.status?.sessionId, action)}
        onBulkArchive={(ids, archived) => convo.archiveSessions(ids, archived, !!data.status?.sessionId && ids.includes(data.status.sessionId))}
        onBulkDelete={(ids, action) => convo.deleteSessions(ids, !!data.status?.sessionId && ids.includes(data.status.sessionId), action)}
        onPin={convo.pinSession}
        onReorderPins={convo.reorderPinnedSessions}
        view={view}
        onView={openView}
        onSettings={data.openSettings}
        onShortcuts={data.openShortcuts}
        onDismiss={() => setMobilePanel("work")}
        runLibrary={runLibrary}
        onRunPrepared={async (prepared) => {
          attachments.clear();
          for (const file of prepared.files) attachments.addFile(file);
          await convo.openSession(prepared.sessionId);
          convo.setDraft(prepared.draft);
          setView("work");
          setMobilePanel("work");
          if (prepared.lineage.mode === "replay") {
            const sent = await convo.submit(withProjectAttachments(prepared.prompt, prepared.files), undefined, prepared.files);
            if (sent) attachments.clear();
          }
          await runLibrary.refresh();
        }}
      />
      <PaneResizeHandle
        className="sidebar-resize-handle"
        label="Resize sessions"
        value={sidebarWidth}
        minimum={MIN_SIDEBAR_WIDTH}
        maximum={sidebarMaximum}
        direction="right"
        onChange={changeSidebarWidth}
      />
      <main className="workbench">
        {view === "work" ? <>
          <div className="work-controls">
            <RuntimeStrip
              runtime={data.runtime}
              agentModel={data.status?.model}
              agentProvider={data.status?.provider}
              agentRoute={data.status?.providerRoute}
              phase={data.phase}
              onSelect={data.setRuntimeHost}
              onAction={data.runRuntimeAction}
            />
          </div>
          <div className={`conversation-stage ${data.phase === "error" ? "has-error" : ""}`}>
            {data.phase === "error" ? <ConnectionError message={data.error} onRetry={() => { void data.refresh(); }} onSetup={data.openSetup} /> : null}
            {data.phase === "loading" ? <LoadingState /> : <ChatThread key={convo.sessionId || data.status?.sessionId} sessionId={convo.sessionId || data.status?.sessionId} messages={convo.messages} busy={convo.busy} streamText={convo.streamText} events={convo.events} recovery={convo.recovery} approval={approval.approval} onApproval={approval.answerApproval} onRetry={convo.retry} onReconnect={data.openSetup} onPrompt={convo.setDraft} />}
          </div>
          <div className="composer-stack">
            {queued.snapshot.items.length ? <button className="inline-queue-trigger" type="button" aria-label={`Open queue, ${queued.snapshot.items.length} next`} onClick={() => setQueueOpen(true)}><ListOrdered size={14} /><span>Queue</span><strong>{queued.snapshot.items.length} next</strong><small>Runs after the current task</small></button> : null}
            <FullAccessWarning visible={accessWarning.visible} onClose={accessWarning.close} onAcknowledge={accessWarning.acknowledge} />
            <Composer value={convo.draft} busy={convo.busy} ready={conversationReady} model={data.status?.model} root={data.status?.root} tools={data.status?.tools} mcp={mcp.summary} accessMode={data.status?.accessMode ?? "approve"} attachments={attachments.items} images={attachments.images} attachmentError={attachments.error} lookBusy={attachments.capturing} onChange={convo.setDraft} onSubmit={(text) => { void submitWork(text); }} onQueue={(text) => { void convo.queue(text).then(queued.refresh); }} onRemoveAttachment={attachments.removeItem} onRemoveImage={attachments.removeImage} onPasteImages={attachments.pasteImages} onDropFiles={attachments.dropFiles} onLookCapture={attachments.captureLook} onStop={convo.stop} onAttach={() => { void attachments.pickFiles(); }} onMcp={() => setView("connect")} onModel={data.openModelPicker} onAccessMode={data.setAccessMode} onCommand={data.openPalette} />
          </div>
        </> : <OperatorWorkspace
          view={view}
          data={data}
          mcp={mcp}
          events={convo.events}
          connectTarget={connectTarget}
          onOpenSession={(id) => { openView("work"); void convo.openSession(id); }}
          onCreateSchedule={() => { openView("work"); convo.setDraft("Schedule a recurring task: "); }}
          onConnect={() => openView("connect")}
          continuity={continuity}
        />}
      </main>
      <QueuedTurnDrawer open={queueOpen} items={queued.snapshot.items} error={queued.error} onClose={() => setQueueOpen(false)} onAction={queued.mutate} />
      {inspectorVisible ? <button className="review-scrim" type="button" aria-label="Close review" onClick={() => { setInspectorOpen(false); setMobilePanel("work"); }} /> : null}
      {inspectorVisible ? <RightRail
        status={data.status}
        tools={data.tools}
        files={data.files}
        mentionedFiles={mentionedFiles}
        selectedFiles={attachments.files}
        artifacts={data.artifacts}
        events={convo.events}
        canvas={data.canvas}
        onRefresh={() => { void data.refresh(); }}
        tab={data.tab}
        onTab={data.setTab}
        onInsertFile={attachments.addFile}
        onOpenOutputs={() => { setInspectorOpen(false); setView("outputs"); }}
        onOpenSession={(id) => { setInspectorOpen(false); void convo.openSession(id); }}
        onDismiss={() => { setInspectorOpen(false); setMobilePanel("work"); }}
      /> : null}
      <NewTaskDialog open={newTaskOpen} root={data.status?.root} model={data.status?.model} initialDraft={projectTaskRecovery?.draft} initialError={projectTaskRecovery?.error} onClose={() => setNewTaskOpen(false)} onCreate={createNewTask} />
      <DesktopOverlays
        data={data}
        sound={sound}
        convo={convo}
        theme={theme}
        accessWarning={accessWarning}
        onTheme={changeTheme}
        onNew={openNewTask}
        onTelegram={openTelegramSetup}
        onReview={() => { data.setTab("files"); setInspectorOpen(true); setMobilePanel("inspect"); }}
        onSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onCycleMode={cycleAccessMode}
        onView={openView}
      />
    </div>
  );
}

function useInputModality(): void {
  useEffect(() => {
    const root = document.documentElement;
    const setModality = (modality: "keyboard" | "pointer") => {
      root.dataset.inputModality = modality;
      root.classList.toggle("keyboard-modality", modality === "keyboard");
      root.classList.toggle("pointer-modality", modality === "pointer");
    };
    setModality("pointer");
    const keyboard = () => setModality("keyboard");
    const pointer = () => setModality("pointer");
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("mousedown", pointer, true);
    window.addEventListener("touchstart", pointer, true);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("mousedown", pointer, true);
      window.removeEventListener("touchstart", pointer, true);
    };
  }, []);
}

function PaneResizeHandle(props: {
  className: string;
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  direction: "left" | "right";
  onChange: (value: number) => void;
}) {
  const drag = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null);
  const update = (value: number) => props.onChange(clamp(Math.round(value), props.minimum, props.maximum));
  const deltaFor = (movement: number) => props.direction === "right" ? movement : -movement;

  return <div
    className={`pane-resize-handle ${props.className}`}
    role="separator"
    aria-orientation="vertical"
    aria-label={props.label}
    aria-valuemin={props.minimum}
    aria-valuemax={props.maximum}
    aria-valuenow={props.value}
    tabIndex={0}
    title={`${props.label}. Use the arrow keys for precise adjustment.`}
    onPointerDown={(event) => {
      if (window.matchMedia("(max-width: 1080px)").matches) return;
      drag.current = { pointerId: event.pointerId, startX: event.clientX, startValue: props.value };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    }}
    onPointerMove={(event) => {
      if (!drag.current || drag.current.pointerId !== event.pointerId) return;
      update(drag.current.startValue + deltaFor(event.clientX - drag.current.startX));
    }}
    onPointerUp={(event) => {
      if (drag.current?.pointerId === event.pointerId) drag.current = null;
    }}
    onPointerCancel={() => { drag.current = null; }}
    onKeyDown={(event) => {
      const step = event.shiftKey ? 32 : 16;
      if (event.key === "Home") { event.preventDefault(); update(props.minimum); return; }
      if (event.key === "End") { event.preventDefault(); update(props.maximum); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); update(props.value + deltaFor(step)); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); update(props.value + deltaFor(-step)); }
    }}
  ><span className="sr-only">{props.label}</span></div>;
}

function DesktopHeader(props: {
  title: string;
  reviewCount: number;
  queueCount: number;
  inspectorOpen: boolean;
  sidebarCollapsed: boolean;
  onNew: () => void;
  onSidebar: () => void;
  onInspector: () => void;
  onQueue: () => void;
  onCommand: () => void;
}) {
  return (
    <header className="app-titlebar" aria-label="Application chrome">
      <div className="titlebar-identity">
        <div className="titlebar-leading-actions"><button className={props.sidebarCollapsed ? "" : "active"} type="button" title="Toggle threads" aria-label="Toggle threads" aria-pressed={!props.sidebarCollapsed} onClick={props.onSidebar}><PanelLeft size={16} /></button><button type="button" title="New task" aria-label="New task" onClick={props.onNew}><MessageSquarePlus size={16} /></button></div>
      </div>
      <div className="titlebar-agent-context">
        <div className="titlebar-task"><FolderKanban size={14} /><div className="title-block"><h1>{props.title}</h1></div></div>
        <div className="titlebar-actions">
          {props.queueCount ? <button className="titlebar-queue" type="button" aria-label={`Open queue, ${props.queueCount} next`} onClick={props.onQueue}><ListOrdered size={14} /><span>{props.queueCount}</span></button> : null}
          <button className={`review-button ${props.inspectorOpen ? "active" : ""}`} type="button" aria-label="Review" aria-expanded={props.inspectorOpen} aria-controls="review-drawer" onClick={props.onInspector}><span>Review</span>{props.reviewCount ? <strong aria-label={`${props.reviewCount} review items`}>{props.reviewCount}</strong> : null}</button>
          <button className="icon-button" type="button" title="Commands (Command K)" onClick={props.onCommand} aria-label="Open commands"><Command size={16} /></button>
        </div>
      </div>
    </header>
  );
}

function LoadingState() {
  return <section className="loading-state"><LoadingIndicator label="Connecting to Vanta" /><h2>Connecting to Vanta</h2><p>Loading the kernel, project context, and sessions.</p></section>;
}

function ConnectionError(props: { message: string; onRetry: () => void; onSetup: () => void }) {
  const recovery = connectionRecovery(props.message);
  const guidance = recovery === "project" ? "Check the project path, file permissions, or local catalog, then retry." : recovery === "service" ? "Retry the local runtime without changing provider credentials." : "Connect or repair the model provider for this project.";
  return <section className="connection-error" role="alert"><Bell size={18} /><div><strong>{recovery === "provider" ? "Model setup needed" : recovery === "project" ? "Project context needs attention" : "Vanta needs attention"}</strong><p>{props.message}</p><p>{guidance}</p></div><div>{recovery === "provider" ? <button type="button" onClick={props.onSetup}>Configure model</button> : null}<button type="button" onClick={props.onRetry}><RefreshCw size={15} />Retry</button></div></section>;
}

function DesktopOverlays(props: {
  data: DesktopData;
  sound: CompletionSound;
  convo: ReturnType<typeof useConversation>;
  theme: DesktopTheme;
  accessWarning: ReturnType<typeof useFullAccessWarning>;
  onTheme: (theme: DesktopTheme) => void;
  onNew: () => void;
  onTelegram: () => void;
  onReview: () => void;
  onSidebar: () => void;
  onCycleMode: () => void;
  onView: (view: DesktopView) => void;
}) {
  const { data, sound, convo } = props;
  return (
    <>
      <CommandPalette
        open={data.paletteOpen}
        onClose={data.closePalette}
        onNew={props.onNew}
        onReview={props.onReview}
        onSidebar={props.onSidebar}
        onCycleMode={props.onCycleMode}
        onView={props.onView}
        onModel={data.openModelPicker}
        onTelegram={props.onTelegram}
        onSound={data.openSoundSettings}
        onSettings={data.openSettings}
      />
      <ModelPicker open={data.modelOpen} models={data.models} status={data.status} onClose={data.closeModelPicker} onRefresh={data.refreshProviderModels} onSelect={data.setModel} onSettings={data.setModelSettings} />
      <SettingsDialog open={data.settingsOpen} models={data.models} status={data.status} theme={props.theme} fullAccessWarningAcknowledged={props.accessWarning.acknowledged} onResetFullAccessWarning={props.accessWarning.reset} onTheme={props.onTheme} onClose={data.closeSettings} onModel={data.openModelPicker} onSetup={data.openSetup} />
      <KeyboardShortcuts open={data.shortcutsOpen} onClose={data.closeShortcuts} />
      <SetupWizard open={data.setupOpen} models={data.models} onClose={data.closeSetup} onSave={async (provider, model, apiKey) => {
        const resume = convo.recovery?.failureKind === "provider_auth";
        await reconnectProviderAndResume(data.saveSetup, async () => { await convo.retry(); }, { provider, model, apiKey, resume });
      }} />
      <CompletionSoundSettings
        open={data.soundOpen}
        settings={sound.settings}
        onChange={sound.update}
        onPreview={() => { void sound.preview(); }}
        onClose={data.closeSoundSettings}
      />
    </>
  );
}

type ConnectTarget = { key: number; section: "overview" | "capabilities" | "mcp" | "messaging" | "google"; messagingId?: string };

function OperatorWorkspace(props: {
  view: DesktopView;
  data: DesktopData;
  mcp: DesktopMcp;
  events: ReturnType<typeof useConversation>["events"];
  connectTarget: ConnectTarget | null;
  onOpenSession: (id: string) => void;
  onCreateSchedule: () => void;
  onConnect: () => void;
  continuity: Continuity;
}) {
  if (props.view === "operate") return <ContinuityView snapshot={props.continuity.snapshot} busy={props.continuity.busy} error={props.continuity.error} onCapture={props.continuity.capture} onAction={props.continuity.act} />;
  if (props.view === "outputs") return <ArtifactsView artifacts={props.data.artifacts} onOpenSession={props.onOpenSession} onRefresh={() => { void props.data.refresh(); }} />;
  if (props.view === "scheduled") return <ScheduledView items={props.data.schedules} onCreate={props.onCreateSchedule} />;
  if (props.view === "plugins") return <PluginsView items={props.data.capabilities} onConnect={props.onConnect} />;
  return <ConnectView key={props.connectTarget?.key ?? "connect"} capabilities={props.data.capabilities} platforms={props.data.messaging} models={props.data.models} status={props.data.status} google={props.data.google} releaseProofs={props.data.releaseProofs} mcp={props.mcp} initialSection={props.connectTarget?.section} messagingId={props.connectTarget?.messagingId} onSaveMessaging={props.data.saveMessaging} onTest={props.data.testConnection} onStartGateway={props.data.startGateway} onGoogleConnect={props.data.googleConnect} onOpenModel={props.data.openModelPicker} onOpenSetup={props.data.openSetup} />;
}

function viewLabel(view: Exclude<DesktopView, "work">): string {
  if (view === "operate") return "Today";
  if (view === "outputs") return "Outputs";
  if (view === "scheduled") return "Scheduled";
  if (view === "plugins") return "Plugins";
  return "Connect";
}

async function createTask(draft: NewTaskDraft, convo: ReturnType<typeof useConversation>, close: () => void) {
  await convo.newSession();
  const context = [`Agent: ${draft.agent}`, `Host: ${draft.host}`, `Project: ${draft.folder}`, `Branch: ${draft.branch}`, draft.worktree ? "Use an isolated worktree." : "Work in the current checkout.", draft.approvals ? "Ask before consequential actions." : "Use the configured approval policy."].join("\n");
  convo.setDraft(`${draft.prompt.trim()}${draft.prompt.trim() ? "\n\n" : ""}${context}`);
  close();
}
