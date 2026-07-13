import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Bell, Boxes, Command, FolderKanban, PanelLeft, PanelRight, RefreshCw, Settings2 } from "lucide-react";
import { ChatThread, Composer, SessionSidebar } from "./chat.js";
import { ApprovalOverlay, CommandPalette, KeyboardShortcuts, ModelPicker, SettingsDialog, SetupWizard } from "./overlays.js";
import { ArtifactsView, ConnectView } from "./operator-views.js";
import { RightRail } from "./rail.js";
import { CompletionSoundSettings } from "./sound-settings.js";
import { useApproval, useCompletionSound, useConversation, useDesktopData } from "./state.js";
import type { DesktopView, RailTab } from "./types.js";

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
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) ? value : fallback;
}

export function AppShell() {
  const data = useDesktopData();
  const sound = useCompletionSound();
  const convo = useConversation(data.refresh, { prime: sound.prime, complete: sound.play });
  const approval = useApproval();
  const [mobilePanel, setMobilePanel] = useState<"sessions" | "work" | "inspect">("work");
  const [view, setView] = useState<DesktopView>("work");
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth >= 1180);
  const [theme, setTheme] = useState<"dark" | "light">(() => window.localStorage.getItem("vanta.desktop.theme") === "light" ? "light" : "dark");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(() => storedPaneWidth(SIDEBAR_STORAGE_KEY, 292));
  const [railWidth, setRailWidth] = useState(() => storedPaneWidth(RAIL_STORAGE_KEY, 336));
  function changeTheme(next: "dark" | "light") { setTheme(next); window.localStorage.setItem("vanta.desktop.theme", next); }
  const inspectorVisible = inspectorOpen && view === "work";
  const railMinimum = data.tab === "canvas" ? CANVAS_MIN_RAIL_WIDTH : MIN_RAIL_WIDTH;
  const sidebarMaximum = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth - MIN_WORK_WIDTH - (inspectorVisible ? railWidth : 0)));
  const railMaximum = Math.max(railMinimum, Math.min(MAX_RAIL_WIDTH, window.innerWidth - MIN_WORK_WIDTH - sidebarWidth));

  useEffect(() => {
    function constrainPanes() {
      let nextSidebar = sidebarWidth;
      let nextRail = railWidth;
      if (inspectorVisible) {
        nextRail = clamp(nextRail, railMinimum, Math.min(MAX_RAIL_WIDTH, window.innerWidth - MIN_WORK_WIDTH - nextSidebar));
      }
      nextSidebar = clamp(nextSidebar, MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth - MIN_WORK_WIDTH - (inspectorVisible ? nextRail : 0)));
      if (inspectorVisible) {
        nextRail = clamp(nextRail, railMinimum, Math.min(MAX_RAIL_WIDTH, window.innerWidth - MIN_WORK_WIDTH - nextSidebar));
      }
      if (nextSidebar !== sidebarWidth) setSidebarWidth(nextSidebar);
      if (nextRail !== railWidth) setRailWidth(nextRail);
    }
    constrainPanes();
    window.addEventListener("resize", constrainPanes);
    return () => window.removeEventListener("resize", constrainPanes);
  }, [inspectorVisible, railMinimum, railWidth, sidebarWidth]);

  useEffect(() => { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth)); }, [sidebarWidth]);
  useEffect(() => { window.localStorage.setItem(RAIL_STORAGE_KEY, String(railWidth)); }, [railWidth]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); data.openPalette(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") { event.preventDefault(); setView("work"); void convo.newSession(); }
      if (event.key === "?") { const target = event.target as HTMLElement | null; if (target?.tagName !== "INPUT" && target?.tagName !== "TEXTAREA") data.openShortcuts(); }
      if (event.key === "Escape") { data.closePalette(); data.closeModelPicker(); data.closeSoundSettings(); data.closeSettings(); data.closeShortcuts(); }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [convo.newSession, data]);

  return (
    <div
      className={`app-shell theme-${theme} panel-${mobilePanel} ${inspectorVisible ? "inspector-open" : ""} ${data.tab === "canvas" && inspectorVisible ? "canvas-open" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px`, "--rail-width": `${railWidth}px` } as CSSProperties}
    >
      <SessionSidebar
        sessions={data.sessions}
        activeId={data.status?.sessionId}
        onNew={convo.newSession}
        onOpen={convo.openSession}
        onRename={(id, title) => convo.renameSession(id, title, id === data.status?.sessionId)}
        onArchive={(id, archived) => convo.archiveSession(id, archived, id === data.status?.sessionId)}
        onDelete={(id) => convo.deleteSession(id, id === data.status?.sessionId)}
        view={view}
        onView={setView}
        onDismiss={() => setMobilePanel("work")}
      />
      <PaneResizeHandle
        className="sidebar-resize-handle"
        label="Resize sessions"
        value={sidebarWidth}
        minimum={MIN_SIDEBAR_WIDTH}
        maximum={sidebarMaximum}
        direction="right"
        onChange={setSidebarWidth}
      />
      <main className="workbench">
        <DesktopHeader title={view === "work" ? convo.activeTitle : viewLabel(view)} data={data} inspectorOpen={inspectorOpen} onPanel={setMobilePanel} onInspector={() => { setInspectorOpen((open) => !open); setMobilePanel(inspectorOpen ? "work" : "inspect"); }} />
        {view === "work" ? <>
          <div className={`conversation-stage ${data.phase === "error" ? "has-error" : ""}`}>
            {data.phase === "error" ? <ConnectionError message={data.error} onRetry={() => { void data.refresh(); }} onSetup={data.openSetup} /> : null}
            {data.phase === "loading" ? <LoadingState /> : <ChatThread messages={convo.messages} busy={convo.busy} streamText={convo.streamText} events={convo.events} recovery={convo.recovery} onRetry={convo.retry} onPrompt={convo.setDraft} />}
          </div>
          <Composer value={convo.draft} busy={convo.busy} attachments={attachments} onChange={convo.setDraft} onSubmit={(text) => { void convo.submit(withAttachments(text, attachments)); setAttachments([]); }} onQueue={convo.queue} onRemoveAttachment={(file) => setAttachments((current) => current.filter((entry) => entry !== file))} onStop={convo.stop} onAttach={() => { data.setTab("files"); setInspectorOpen(true); setMobilePanel("inspect"); }} onCommand={data.openPalette} />
        </> : <OperatorWorkspace view={view} data={data} onOpenSession={(id) => { setView("work"); void convo.openSession(id); }} />}
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
        onChange={setRailWidth}
      /> : null}
      <DesktopOverlays data={data} sound={sound} approval={approval} convo={convo} theme={theme} onTheme={changeTheme} onInspector={(tab) => { data.setTab(tab); setInspectorOpen(true); setMobilePanel("inspect"); }} />
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

function DesktopHeader(props: { title: string; data: DesktopData; inspectorOpen: boolean; onPanel: (panel: "sessions" | "work" | "inspect") => void; onInspector: () => void }) {
  const { data } = props;
  const root = data.status?.root?.split("/").filter(Boolean).at(-1) ?? "Project";
  return (
    <header className="topbar">
      <div className="mobile-panel-controls">
        <button type="button" title="Sessions" aria-label="Show sessions" onClick={() => props.onPanel("sessions")}><PanelLeft size={17} /></button>
        <button type="button" title="Conversation" aria-label="Show conversation" onClick={() => props.onPanel("work")}><Boxes size={17} /></button>
        <button type="button" title="Inspector" aria-label="Show inspector" onClick={props.onInspector}><PanelRight size={17} /></button>
      </div>
      <div className="title-block"><p><FolderKanban size={13} />{root}</p><h1>{props.title}</h1></div>
      <div className="status-strip">
        <span className={`kernel-status ${data.phase}`}><i />{data.status?.kernel ?? data.phase}</span>
        <button type="button" title="Change model" onClick={data.openModelPicker}>{data.status?.model ?? "Choose model"}</button>
        <button className="icon-button" type="button" title={props.inspectorOpen ? "Close inspector" : "Open contextual inspector"} onClick={props.onInspector} aria-label={props.inspectorOpen ? "Close inspector" : "Open contextual inspector"}><PanelRight size={16} /></button>
        <button className="icon-button" type="button" title="Settings" onClick={data.openSettings} aria-label="Settings"><Settings2 size={16} /></button>
        <button className="icon-button" type="button" title="Command palette (Command K)" onClick={data.openPalette} aria-label="Open command palette"><Command size={16} /></button>
      </div>
    </header>
  );
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
  approval: ReturnType<typeof useApproval>;
  convo: ReturnType<typeof useConversation>;
  theme: "dark" | "light";
  onTheme: (theme: "dark" | "light") => void;
  onInspector: (tab: RailTab) => void;
}) {
  const { data, sound, approval, convo } = props;
  return (
    <>
      <CommandPalette
        open={data.paletteOpen}
        onClose={data.closePalette}
        onNew={convo.newSession}
        onModel={data.openModelPicker}
        onSound={data.openSoundSettings}
        onSettings={data.openSettings}
        onTab={props.onInspector}
      />
      <ModelPicker open={data.modelOpen} models={data.models} onClose={data.closeModelPicker} onSelect={data.setModel} />
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
      <ApprovalOverlay approval={approval.approval} onAnswer={approval.answerApproval} />
    </>
  );
}

function OperatorWorkspace(props: { view: DesktopView; data: DesktopData; onOpenSession: (id: string) => void }) {
  if (props.view === "outputs") return <ArtifactsView artifacts={props.data.artifacts} onOpenSession={props.onOpenSession} onRefresh={() => { void props.data.refresh(); }} />;
  return <ConnectView capabilities={props.data.capabilities} platforms={props.data.messaging} models={props.data.models} status={props.data.status} onSaveMessaging={props.data.saveMessaging} onOpenModel={props.data.openModelPicker} onOpenSetup={props.data.openSetup} />;
}

function viewLabel(view: Exclude<DesktopView, "work">): string {
  return view === "outputs" ? "Outputs" : "Connect";
}

function withAttachments(text: string, attachments: string[]): string {
  return [text.trim(), ...attachments.map((file) => `@${file}`)].filter(Boolean).join("\n");
}
