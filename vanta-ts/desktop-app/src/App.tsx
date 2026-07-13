import { useEffect, useState } from "react";
import { Bell, Boxes, Command, FolderKanban, PanelLeft, PanelRight, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { ChatThread, Composer, SessionSidebar } from "./chat.js";
import { ApprovalOverlay, CommandPalette, ModelPicker, SetupWizard } from "./overlays.js";
import { RightRail } from "./rail.js";
import { CompletionSoundSettings } from "./sound-settings.js";
import { useApproval, useCompletionSound, useConversation, useDesktopData } from "./state.js";
import { COMPLETION_SOUND_LABELS } from "./completion-sound.js";

type DesktopData = ReturnType<typeof useDesktopData>;
type CompletionSound = ReturnType<typeof useCompletionSound>;

export function AppShell() {
  const data = useDesktopData();
  const sound = useCompletionSound();
  const convo = useConversation(data.refresh, { prime: sound.prime, complete: sound.play });
  const approval = useApproval();
  const [mobilePanel, setMobilePanel] = useState<"sessions" | "work" | "inspect">("work");

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); data.openPalette(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") { event.preventDefault(); void convo.newSession(); }
      if (event.key === "Escape") { data.closePalette(); data.closeModelPicker(); data.closeSoundSettings(); }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [convo.newSession, data]);

  return (
    <div className={`app-shell panel-${mobilePanel} ${data.tab === "canvas" ? "canvas-open" : ""}`}>
      <SessionSidebar
        sessions={data.sessions}
        activeId={data.status?.sessionId}
        onNew={convo.newSession}
        onOpen={convo.openSession}
        onRename={(id, title) => convo.renameSession(id, title, id === data.status?.sessionId)}
        onArchive={(id, archived) => convo.archiveSession(id, archived, id === data.status?.sessionId)}
        onDelete={(id) => convo.deleteSession(id, id === data.status?.sessionId)}
        onDismiss={() => setMobilePanel("work")}
      />
      <main className="workbench">
        <DesktopHeader title={convo.activeTitle} data={data} sound={sound} onPanel={setMobilePanel} />
        <div className={`conversation-stage ${data.phase === "error" ? "has-error" : ""}`}>
          {data.phase === "error" ? <ConnectionError message={data.error} onRetry={() => { void data.refresh(); }} onSetup={data.openSetup} /> : null}
          {data.phase === "loading" ? <LoadingState /> : <ChatThread messages={convo.messages} busy={convo.busy} onPrompt={convo.setDraft} />}
        </div>
        <Composer value={convo.draft} disabled={convo.busy} onChange={convo.setDraft} onSubmit={convo.submit} />
      </main>
      <RightRail
        status={data.status}
        tools={data.tools}
        files={data.files}
        events={convo.events}
        canvas={data.canvas}
        onRefresh={() => { void data.refresh(); }}
        tab={data.tab}
        onTab={data.setTab}
        onInsertFile={convo.insertFile}
        onDismiss={() => setMobilePanel("work")}
      />
      <DesktopOverlays data={data} sound={sound} approval={approval} convo={convo} />
    </div>
  );
}

function DesktopHeader(props: { title: string; data: DesktopData; sound: CompletionSound; onPanel: (panel: "sessions" | "work" | "inspect") => void }) {
  const { data, sound } = props;
  const root = data.status?.root?.split("/").filter(Boolean).at(-1) ?? "Project";
  return (
    <header className="topbar">
      <div className="mobile-panel-controls">
        <button type="button" title="Sessions" aria-label="Show sessions" onClick={() => props.onPanel("sessions")}><PanelLeft size={17} /></button>
        <button type="button" title="Conversation" aria-label="Show conversation" onClick={() => props.onPanel("work")}><Boxes size={17} /></button>
        <button type="button" title="Inspector" aria-label="Show inspector" onClick={() => props.onPanel("inspect")}><PanelRight size={17} /></button>
      </div>
      <div className="title-block"><p><FolderKanban size={13} />{root}</p><h1>{props.title}</h1></div>
      <div className="status-strip">
        <span className={`kernel-status ${data.phase}`}><i />{data.status?.kernel ?? data.phase}</span>
        <button type="button" title="Change model" onClick={data.openModelPicker}>{data.status?.model ?? "Choose model"}</button>
        <button className="icon-button" type="button" title="Completion sound" onClick={data.openSoundSettings} aria-label={`Completion sound: ${sound.settings.enabled ? COMPLETION_SOUND_LABELS[sound.settings.sound] : "muted"}`}>
          {sound.settings.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
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
        onTab={data.setTab}
      />
      <ModelPicker open={data.modelOpen} models={data.models} onClose={data.closeModelPicker} onSelect={data.setModel} />
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
