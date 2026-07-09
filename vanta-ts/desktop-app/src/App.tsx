import { ChatThread, Composer, SessionSidebar } from "./chat.js";
import { ApprovalOverlay, CommandPalette, ModelPicker } from "./overlays.js";
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

  return (
    <div className="app-shell">
      <SessionSidebar sessions={data.sessions} activeId={data.status?.sessionId} onNew={convo.newSession} onOpen={convo.openSession} />
      <main className="workbench">
        <DesktopHeader title={convo.activeTitle} data={data} sound={sound} />
        <ChatThread messages={convo.messages} busy={convo.busy} />
        <Composer value={convo.draft} disabled={convo.busy} onChange={convo.setDraft} onSubmit={convo.submit} />
      </main>
      <RightRail
        status={data.status}
        tools={data.tools}
        files={data.files}
        events={convo.events}
        tab={data.tab}
        onTab={data.setTab}
        onInsertFile={convo.insertFile}
      />
      <DesktopOverlays data={data} sound={sound} approval={approval} convo={convo} />
    </div>
  );
}

function DesktopHeader(props: { title: string; data: DesktopData; sound: CompletionSound }) {
  const { data, sound } = props;
  return (
    <header className="topbar">
      <div><p className="eyebrow">Vanta Desktop</p><h1>{props.title}</h1></div>
      <div className="status-strip">
        <span>{data.status?.kernel ?? "starting"}</span>
        <button type="button" onClick={data.openModelPicker}>{data.status?.model ?? "model"}</button>
        <span>{data.status?.tools ?? 0} tools</span>
        <button type="button" onClick={data.openSoundSettings} aria-label="Completion sound settings">
          Sound: {sound.settings.enabled ? COMPLETION_SOUND_LABELS[sound.settings.sound] : "Muted"}
        </button>
        <button type="button" onClick={data.openPalette}>Command Center</button>
      </div>
    </header>
  );
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
