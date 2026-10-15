import { ListOrdered } from "lucide-react";
import { ChatThread,Composer } from "./chat.js";
import { OperatorWorkspace } from "./classic-operator-workspace.js";
import type { ClassicActions } from "./classic-shell-actions.js";
import { ConnectionError,LoadingState } from "./classic-shell-chrome.js";
import { classicShellPresentation,type ClassicState } from "./classic-shell-state.js";
import { FullAccessWarning } from "./full-access-warning.js";
import { RightRail } from "./rail.js";
import { RuntimeStrip } from "./runtime-strip.js";

type ViewProps = { state: ClassicState; actions: ClassicActions };

export function ClassicWorkbench({ state, actions }: ViewProps) {
  const { data, convo, setQueueOpen, queued, approval, mcp, continuity, accessWarning, view, setView, connectTarget, attachments, conversationReady } = state;
  const { openView, submitWork } = actions;
  const { inspectorVisible, sidebarMaximum, mentionedFiles, reviewCount } = classicShellPresentation(state);
  return (
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
            {data.phase === "loading" ? <LoadingState /> : <ChatThread key={convo.sessionId || data.status?.sessionId} title={convo.activeTitle} sessionId={convo.sessionId || data.status?.sessionId} messages={convo.messages} busy={convo.busy} streamText={convo.streamText} events={convo.events} recovery={convo.recovery} approval={approval.approval} queueCount={queued.snapshot.items.length} onApproval={approval.answerApproval} onRetry={convo.retry} onReconnect={data.openSetup} onPrompt={convo.setDraft} />}
          </div>
          <div className="composer-stack">
            {queued.snapshot.items.length ? <button className="inline-queue-trigger" type="button" aria-label={`Open queue, ${queued.snapshot.items.length} next`} onClick={() => setQueueOpen(true)}><ListOrdered size={14} /><span>Queue</span><strong>{queued.snapshot.items.length} next</strong><small>Runs after the current task</small></button> : null}
            <FullAccessWarning visible={accessWarning.visible} onClose={accessWarning.close} onAcknowledge={accessWarning.acknowledge} />
            <Composer sessionId={convo.sessionId} value={convo.draft} busy={convo.busy} runReady={convo.turnStarted} ready={conversationReady} model={data.status?.model} root={data.status?.root} tools={data.status?.tools} mcp={mcp.summary} accessMode={data.status?.accessMode ?? "approve"} attachments={attachments.items} images={attachments.images} attachmentError={attachments.error} lookBusy={attachments.capturing} onChange={convo.setDraft} onSubmit={(text) => { void submitWork(text); }} onQueue={(text) => { void convo.queue(text).then(queued.refresh); }} onRemoveAttachment={attachments.removeItem} onRemoveImage={attachments.removeImage} onPasteImages={attachments.pasteImages} onDropFiles={attachments.dropFiles} onLookCapture={attachments.captureLook} onStop={convo.stop} onAttach={() => { void attachments.pickFiles(); }} onMcp={() => setView("connect")} onModel={data.openModelPicker} onAccessMode={data.setAccessMode} onCommand={data.openPalette} />
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
  );
}

export function ClassicReview({ state, actions }: ViewProps) {
  const { data, convo, setMobilePanel, setView, setInspectorOpen, attachments } = state;
  const { openView, openNewTask, submitWork, createNewTask, openTelegramSetup, cycleAccessMode } = actions;
  const { inspectorVisible, mentionedFiles } = classicShellPresentation(state);
  return <>
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
  </>;
}
