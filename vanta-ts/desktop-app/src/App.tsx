import { ChatThread, Composer, SessionSidebar } from "./chat.js";
import { ApprovalOverlay, CommandPalette, ModelPicker } from "./overlays.js";
import { RightRail } from "./rail.js";
import { useApproval, useConversation, useDesktopData } from "./state.js";

export function AppShell() {
  const data = useDesktopData();
  const convo = useConversation(data.refresh);
  const approval = useApproval();

  return (
    <div className="app-shell">
      <SessionSidebar sessions={data.sessions} activeId={data.status?.sessionId} onNew={convo.newSession} onOpen={convo.openSession} />
      <main className="workbench">
        <header className="topbar">
          <div>
            <p className="eyebrow">Vanta Desktop</p>
            <h1>{convo.activeTitle}</h1>
          </div>
          <div className="status-strip">
            <span>{data.status?.kernel ?? "starting"}</span>
            <button type="button" onClick={data.openModelPicker}>{data.status?.model ?? "model"}</button>
            <span>{data.status?.tools ?? 0} tools</span>
            <button type="button" onClick={data.openPalette}>Command Center</button>
          </div>
        </header>
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
      <CommandPalette
        open={data.paletteOpen}
        onClose={data.closePalette}
        onNew={convo.newSession}
        onModel={data.openModelPicker}
        onTab={data.setTab}
      />
      <ModelPicker open={data.modelOpen} models={data.models} onClose={data.closeModelPicker} onSelect={data.setModel} />
      <ApprovalOverlay approval={approval.approval} onAnswer={approval.answerApproval} />
    </div>
  );
}
