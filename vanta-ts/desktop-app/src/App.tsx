import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Activity, Bell, Command, Cpu, FolderKanban, MessageSquare, MessageSquarePlus, Network, PackageOpen, PanelLeft, PanelRight, Pause, RefreshCw, RotateCcw, Search, Settings2, ShieldCheck, Square } from "lucide-react";
import { ChatThread, Composer, SessionSidebar } from "./chat.js";
import { CommandPalette, KeyboardShortcuts, ModelPicker, NewTaskDialog, SettingsDialog, SetupWizard, type NewTaskDraft } from "./overlays.js";
import { ArtifactsView, ConnectView, OperateView } from "./operator-views.js";
import { RightRail } from "./rail.js";
import { CompletionSoundSettings } from "./sound-settings.js";
import { useApproval, useCompletionSound, useConversation, useDesktopData } from "./state.js";
import type { DesktopTheme, DesktopView, RailTab } from "./types.js";

type DesktopData = ReturnType<typeof useDesktopData>;
type CompletionSound = ReturnType<typeof useCompletionSound>;

const SIDEBAR_STORAGE_KEY = "vanta.desktop.sidebar-width";
const RAIL_STORAGE_KEY = "vanta.desktop.rail-width";
const MIN_SIDEBAR_WIDTH = 216;
const MAX_SIDEBAR_WIDTH = 420;
const MIN_RAIL_WIDTH = 300;
const CANVAS_MIN_RAIL_WIDTH = 460;
const MAX_RAIL_WIDTH = 560;
const MIN_WORK_WIDTH = 380;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function storedPaneWidth(key: string, fallback: number): number {
  const stored = window.localStorage.getItem(key);
  if (stored === null || stored.trim() === "") return fallback;
  const value = Number(stored);
  return Number.isFinite(value) ? value : fallback;
}

export function AppShell() {
  const data = useDesktopData();
  const sound = useCompletionSound();
  const convo = useConversation(data.refresh, { prime: sound.prime, complete: sound.play });
  const approval = useApproval();
  const [mobilePanel, setMobilePanel] = useState<"sessions" | "work" | "inspect">("work");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<DesktopView>("work");
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth > 1080);
  const [theme, setTheme] = useState<DesktopTheme>(() => window.localStorage.getItem("vanta.desktop.theme") === "light" ? "light" : "dark");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => storedPaneWidth(SIDEBAR_STORAGE_KEY, 268));
  const [railWidth, setRailWidth] = useState(() => storedPaneWidth(RAIL_STORAGE_KEY, 352));
  const preferredSidebarWidth = useRef(sidebarWidth);
  const preferredRailWidth = useRef(railWidth);
  const bootSession = useRef("");
  function changeTheme(next: DesktopTheme) { setTheme(next); window.localStorage.setItem("vanta.desktop.theme", next); }
  function changeSidebarWidth(next: number) {
    preferredSidebarWidth.current = next;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    setSidebarWidth(next);
  }
  function changeRailWidth(next: number) {
    preferredRailWidth.current = next;
    window.localStorage.setItem(RAIL_STORAGE_KEY, String(next));
    setRailWidth(next);
  }
  const inspectorVisible = inspectorOpen && view === "work";
  const railMinimum = data.tab === "canvas" ? CANVAS_MIN_RAIL_WIDTH : MIN_RAIL_WIDTH;
  const sidebarMaximum = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth - MIN_WORK_WIDTH - (inspectorVisible ? railWidth : 0)));
  const railMaximum = Math.max(railMinimum, Math.min(MAX_RAIL_WIDTH, window.innerWidth - MIN_WORK_WIDTH - sidebarWidth));

  useEffect(() => {
    function constrainPanes() {
      let nextSidebar = preferredSidebarWidth.current;
      let nextRail = preferredRailWidth.current;
      if (inspectorVisible) {
        nextRail = clamp(nextRail, railMinimum, Math.min(MAX_RAIL_WIDTH, window.innerWidth - MIN_WORK_WIDTH - nextSidebar));
      }
      nextSidebar = clamp(nextSidebar, MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth - MIN_WORK_WIDTH - (inspectorVisible ? nextRail : 0)));
      if (inspectorVisible) {
        nextRail = clamp(nextRail, railMinimum, Math.min(MAX_RAIL_WIDTH, window.innerWidth - MIN_WORK_WIDTH - nextSidebar));
      }
      setSidebarWidth((current) => current === nextSidebar ? current : nextSidebar);
      setRailWidth((current) => current === nextRail ? current : nextRail);
    }
    constrainPanes();
    window.addEventListener("resize", constrainPanes);
    return () => window.removeEventListener("resize", constrainPanes);
  }, [inspectorVisible, railMinimum]);

  useEffect(() => {
    if (data.phase !== "ready" || bootSession.current || !data.sessions.length) return;
    const id = data.sessions.find((session) => session.id === data.status?.sessionId)?.id ?? data.sessions.find((session) => !session.archived)?.id;
    if (!id) return;
    bootSession.current = id;
    void convo.openSession(id).catch(() => { bootSession.current = ""; });
  }, [convo.openSession, data.phase, data.sessions, data.status?.sessionId]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); data.openPalette(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") { event.preventDefault(); setNewTaskOpen(true); }
      if (event.key === "?") { const target = event.target as HTMLElement | null; if (target?.tagName !== "INPUT" && target?.tagName !== "TEXTAREA") data.openShortcuts(); }
      if (event.key === "Escape") { data.closePalette(); data.closeModelPicker(); data.closeSoundSettings(); data.closeSettings(); data.closeShortcuts(); }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [convo.newSession, data]);

  return (
    <div
      className={`app-shell theme-${theme} panel-${mobilePanel} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${inspectorVisible ? "inspector-open" : ""} ${data.tab === "canvas" && inspectorVisible ? "canvas-open" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px`, "--rail-width": `${railWidth}px` } as CSSProperties}
    >
      <DesktopHeader
        title={view === "work" ? convo.activeTitle : viewLabel(view)}
        data={data}
        approvalPending={!!approval.approval}
        inspectorOpen={inspectorOpen}
        sidebarCollapsed={sidebarCollapsed}
        onNew={() => setNewTaskOpen(true)}
        onSidebar={() => {
          if (window.innerWidth <= 760) setMobilePanel((panel) => panel === "sessions" ? "work" : "sessions");
          else setSidebarCollapsed((collapsed) => !collapsed);
        }}
        onInspector={() => { setInspectorOpen((open) => !open); setMobilePanel(inspectorOpen ? "work" : "inspect"); }}
      />
      <SessionSidebar
        sessions={data.sessions}
        root={data.status?.root}
        activeId={data.status?.sessionId}
        onNew={() => setNewTaskOpen(true)}
        onOpen={convo.openSession}
        onRename={(id, title) => convo.renameSession(id, title, id === data.status?.sessionId)}
        onArchive={(id, archived) => convo.archiveSession(id, archived, id === data.status?.sessionId)}
        onDelete={(id) => convo.deleteSession(id, id === data.status?.sessionId)}
        view={view}
        onView={setView}
        onSettings={data.openSettings}
        onShortcuts={data.openShortcuts}
        onDismiss={() => setMobilePanel("work")}
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
          <WorkToolbar busy={convo.busy} onBackground={() => setView("operate")} onStop={() => { void convo.stop(); }} onReset={() => setNewTaskOpen(true)} />
          <div className={`conversation-stage ${data.phase === "error" ? "has-error" : ""}`}>
            {data.phase === "error" ? <ConnectionError message={data.error} onRetry={() => { void data.refresh(); }} onSetup={data.openSetup} /> : null}
            {data.phase === "loading" ? <LoadingState /> : <ChatThread messages={convo.messages} busy={convo.busy} streamText={convo.streamText} events={convo.events} recovery={convo.recovery} approval={approval.approval} onApproval={approval.answerApproval} onRetry={convo.retry} onPrompt={convo.setDraft} />}
          </div>
          <Composer value={convo.draft} busy={convo.busy} model={data.status?.model} root={data.status?.root} attachments={attachments} onChange={convo.setDraft} onSubmit={(text) => { void convo.submit(withAttachments(text, attachments)); setAttachments([]); }} onQueue={convo.queue} onRemoveAttachment={(file) => setAttachments((current) => current.filter((entry) => entry !== file))} onStop={convo.stop} onAttach={() => { data.setTab("files"); setInspectorOpen(true); setMobilePanel("inspect"); }} onModel={data.openModelPicker} onCommand={data.openPalette} />
        </> : <OperatorWorkspace view={view} data={data} events={convo.events} onOpenSession={(id) => { setView("work"); void convo.openSession(id); }} />}
      </main>
      {inspectorVisible ? <RightRail
        status={data.status}
        tools={data.tools}
        files={data.files}
        artifacts={data.artifacts}
        events={convo.events}
        canvas={data.canvas}
        onRefresh={() => { void data.refresh(); }}
        tab={data.tab}
        onTab={data.setTab}
        onInsertFile={(file) => setAttachments((current) => current.includes(file) ? current : [...current, file])}
        onOpenOutputs={() => { setInspectorOpen(false); setView("outputs"); }}
        onOpenSession={(id) => { setInspectorOpen(false); void convo.openSession(id); }}
        onDismiss={() => { setInspectorOpen(false); setMobilePanel("work"); }}
      /> : null}
      {inspectorVisible ? <PaneResizeHandle
        className="rail-resize-handle"
        label="Resize outputs"
        value={railWidth}
        minimum={railMinimum}
        maximum={railMaximum}
        direction="left"
        onChange={changeRailWidth}
      /> : null}
      <MobileNavigation view={view} onView={(next) => { setView(next); setMobilePanel("work"); }} onInspect={() => { setInspectorOpen(true); setMobilePanel("inspect"); }} />
      <DesktopStatusbar data={data} />
      <NewTaskDialog open={newTaskOpen} root={data.status?.root} model={data.status?.model} onClose={() => setNewTaskOpen(false)} onCreate={(draft) => { void createTask(draft, convo, () => { setNewTaskOpen(false); setView("work"); }); }} />
      <DesktopOverlays data={data} sound={sound} convo={convo} theme={theme} onTheme={changeTheme} onNew={() => setNewTaskOpen(true)} onInspector={(tab) => { data.setTab(tab); setInspectorOpen(true); setMobilePanel("inspect"); }} />
    </div>
  );
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

function DesktopHeader(props: { title: string; data: DesktopData; approvalPending: boolean; inspectorOpen: boolean; sidebarCollapsed: boolean; onNew: () => void; onSidebar: () => void; onInspector: () => void }) {
  const { data } = props;
  const root = data.status?.root?.split("/").filter(Boolean).at(-1) ?? "Project";
  return (
    <header className="app-titlebar" aria-label="Application chrome">
      <div className="titlebar-identity">
        <div className="titlebar-leading-actions"><button className={props.sidebarCollapsed ? "" : "active"} type="button" title="Toggle threads" aria-label="Toggle threads" aria-pressed={!props.sidebarCollapsed} onClick={props.onSidebar}><PanelLeft size={16} /></button><button type="button" title="New task" aria-label="New task" onClick={props.onNew}><MessageSquarePlus size={16} /></button></div>
      </div>
      <div className="titlebar-agent-context"><div className="titlebar-task"><FolderKanban size={14} /><div className="title-block"><p>{root}</p><h1>{props.title}</h1></div></div><div className="titlebar-runtime"><span className={`kernel-status ${data.phase}`}><i />{data.phase === "ready" ? "online" : data.phase}</span><button type="button" title="Change model" onClick={data.openModelPicker}><Cpu size={14} /><span>{data.status?.model ?? "model"}</span></button></div></div>
      <div className="status-strip titlebar-actions">
        <span className={`approval-status ${props.approvalPending ? "pending" : ""}`}><i />{props.approvalPending ? "approve" : "ask"}</span>
        <button className="icon-button" type="button" title={props.inspectorOpen ? "Close inspector" : "Open contextual inspector"} onClick={props.onInspector} aria-label={props.inspectorOpen ? "Close inspector" : "Open contextual inspector"}><PanelRight size={16} /></button>
        <button className="icon-button" type="button" title="Settings" onClick={data.openSettings} aria-label="Settings"><Settings2 size={16} /></button>
        <button className="icon-button" type="button" title="Command palette (Command K)" onClick={data.openPalette} aria-label="Open command palette"><Command size={16} /></button>
      </div>
    </header>
  );
}

function WorkToolbar(props: { busy: boolean; onBackground: () => void; onStop: () => void; onReset: () => void }) {
  return <section className="work-toolbar" data-busy={props.busy ? "true" : "false"} role="toolbar" aria-label="Task controls"><strong className="work-toolbar-title"><i />{props.busy ? "Run active" : "Run controls"}</strong><div><button type="button" onClick={props.onBackground}><Pause size={14} />Background</button><button className="danger" type="button" onClick={props.onStop} disabled={!props.busy}><Square size={13} />Stop</button><button type="button" onClick={props.onReset}><RotateCcw size={14} />New task</button></div></section>;
}

function DesktopStatusbar(props: { data: DesktopData }) {
  const root = props.data.status?.root?.split("/").filter(Boolean).at(-1) ?? "Project";
  return <footer className="desktop-statusbar"><span><i />Gateway {props.data.phase === "ready" ? "ready" : props.data.phase}</span><span><ShieldCheck size={12} />Kernel {props.data.status?.kernel ?? "checking"}</span><span><Activity size={12} />{props.data.sessions.filter((session) => !session.archived).length} tasks</span><em>{root}</em></footer>;
}

function LoadingState() {
  return <section className="loading-state" role="status"><span className="loader" /><h2>Connecting to Vanta</h2><p>Loading the kernel, project context, and sessions.</p></section>;
}

function ConnectionError(props: { message: string; onRetry: () => void; onSetup: () => void }) {
  return <section className="connection-error" role="alert"><Bell size={18} /><div><strong>Vanta needs attention</strong><p>{props.message}</p></div><div><button type="button" onClick={props.onSetup}>Configure model</button><button type="button" onClick={props.onRetry}><RefreshCw size={15} />Retry</button></div></section>;
}

function DesktopOverlays(props: {
  data: DesktopData;
  sound: CompletionSound;
  convo: ReturnType<typeof useConversation>;
  theme: DesktopTheme;
  onTheme: (theme: DesktopTheme) => void;
  onNew: () => void;
  onInspector: (tab: RailTab) => void;
}) {
  const { data, sound, convo } = props;
  return (
    <>
      <CommandPalette
        open={data.paletteOpen}
        onClose={data.closePalette}
        onNew={props.onNew}
        onModel={data.openModelPicker}
        onSound={data.openSoundSettings}
        onSettings={data.openSettings}
        onTab={props.onInspector}
      />
      <ModelPicker open={data.modelOpen} models={data.models} status={data.status} onClose={data.closeModelPicker} onRefresh={data.refreshProviderModels} onSelect={data.setModel} />
      <SettingsDialog open={data.settingsOpen} models={data.models} status={data.status} theme={props.theme} onTheme={props.onTheme} onClose={data.closeSettings} onModel={data.openModelPicker} onSetup={data.openSetup} />
      <KeyboardShortcuts open={data.shortcutsOpen} onClose={data.closeShortcuts} />
      <SetupWizard open={data.setupOpen} models={data.models} onClose={data.closeSetup} onSave={data.saveSetup} />
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

function OperatorWorkspace(props: { view: DesktopView; data: DesktopData; events: ReturnType<typeof useConversation>["events"]; onOpenSession: (id: string) => void }) {
  if (props.view === "operate") return <OperateView sessions={props.data.sessions} events={props.events} status={props.data.status} onOpenSession={props.onOpenSession} />;
  if (props.view === "outputs") return <ArtifactsView artifacts={props.data.artifacts} onOpenSession={props.onOpenSession} onRefresh={() => { void props.data.refresh(); }} />;
  return <ConnectView capabilities={props.data.capabilities} platforms={props.data.messaging} models={props.data.models} status={props.data.status} onSaveMessaging={props.data.saveMessaging} onOpenModel={props.data.openModelPicker} onOpenSetup={props.data.openSetup} />;
}

function viewLabel(view: Exclude<DesktopView, "work">): string {
  return view === "operate" ? "Operate" : view === "outputs" ? "Outputs" : "Connect";
}

async function createTask(draft: NewTaskDraft, convo: ReturnType<typeof useConversation>, close: () => void) {
  await convo.newSession();
  const context = [`Agent: ${draft.agent}`, `Host: ${draft.host}`, `Project: ${draft.folder}`, `Branch: ${draft.branch}`, draft.worktree ? "Use an isolated worktree." : "Work in the current checkout.", draft.approvals ? "Ask before consequential actions." : "Use the configured approval policy."].join("\n");
  convo.setDraft(`${draft.prompt.trim()}${draft.prompt.trim() ? "\n\n" : ""}${context}`);
  close();
}

function MobileNavigation(props: { view: DesktopView; onView: (view: DesktopView) => void; onInspect: () => void }) {
  const destinations: Array<[DesktopView, typeof MessageSquare, string]> = [["work", MessageSquare, "Work"], ["operate", Activity, "Operate"], ["outputs", PackageOpen, "Outputs"], ["connect", Network, "Connect"]];
  return <nav className="mobile-nav" aria-label="Mobile workspace">{destinations.map(([view, Icon, label]) => <button key={view} className={props.view === view ? "active" : ""} type="button" onClick={() => props.onView(view)}><Icon size={17} /><span>{label}</span></button>)}<button type="button" onClick={props.onInspect}><PanelRight size={17} /><span>Inspect</span></button></nav>;
}

function withAttachments(text: string, attachments: string[]): string {
  return [text.trim(), ...attachments.map((file) => `@${file}`)].filter(Boolean).join("\n");
}
