import { ChatThread } from "./chat.js";
import { Composer } from "./composer.js";
import { FullAccessWarning } from "./full-access-warning.js";
import { ChatFirstQueue } from "./chat-first-queue.js";
import { ChatWelcome } from "./chat-first-welcome.js";
import type { ChatFirstState } from "./chat-first-state.js";
import type { ChatFirstActions } from "./chat-first-actions.js";
import { LibreChatView } from "./librechat/chat-view.js";

type Props = { state: ChatFirstState; actions: ChatFirstActions };

export function ChatFirstConversation({ state, actions }: Props) {
  const { convo, data, queue } = state;
  const empty = !convo.messages.length && !convo.busy && !state.approval.approval;
  return <LibreChatView heading={convo.activeTitle || "New chat"} isLandingPage={empty}
    landing={<ChatWelcome draft={convo.draft} ready={state.ready && !state.pending} onDraft={convo.setDraft} />}
    messages={
      <ChatThread key={convo.sessionId} title={convo.activeTitle} sessionId={convo.sessionId} messages={convo.messages}
        busy={convo.busy} streamText={convo.streamText} events={convo.events} recovery={convo.recovery}
        approval={state.approval.approval} queueCount={queue.snapshot.items.length} onApproval={state.approval.answerApproval}
        onRetry={convo.retry} onReconnect={data.openSetup} onPrompt={convo.setDraft} />}
    composer={<ChatComposer state={state} actions={actions} />} />;
}

function ChatComposer({ state, actions }: Props) {
  const { convo, data, attachments, queue } = state;
  return (
    <div className="chat-composer-dock">
      <ChatFirstQueue items={queue.snapshot.items} error={queue.error} onRefresh={queue.refresh} />
      <FullAccessWarning visible={state.warning.visible} onClose={state.warning.close} onAcknowledge={state.warning.acknowledge} />
      {convo.draftError ? <div className="chat-draft-error" role="alert"><span>{convo.draftError}</span><button type="button" onClick={() => void convo.retryDraft()}>Retry draft save</button></div> : null}
      <Composer sessionId={convo.sessionId} value={convo.draft} busy={convo.busy} ready={state.ready && !state.pending} model={data.status?.model}
        root={data.status?.root} tools={data.status?.tools} mcp={state.mcp.summary} accessMode={data.status?.accessMode ?? "approve"}
        attachments={attachments.items} images={attachments.images} attachmentError={attachments.error} lookBusy={attachments.capturing}
        onChange={convo.setDraft} onSubmit={(text) => void actions.submit(text)} onQueue={(text) => void actions.enqueue(text)}
        onRemoveAttachment={attachments.removeItem} onRemoveImage={attachments.removeImage} onPasteImages={attachments.pasteImages}
        onDropFiles={attachments.dropFiles} onLookCapture={attachments.captureLook} onStop={convo.stop}
        onAttach={() => void attachments.pickFiles()} onMcp={() => state.setView("connect")} onModel={data.openModelPicker}
        onAccessMode={data.setAccessMode} onCommand={data.openPalette} />
      <ComposerHint state={state} />
    </div>
  );
}

function ComposerHint({ state: { convo, data, settling } }: { state: ChatFirstState }) {
  const settings = data.status?.modelSettings;
  return <div className="chat-composer-hint"><span>{settling ? "Updating conversation…" : convo.busy ? "Response running · messages queue next" : "Enter to send · Shift Enter for a new line"}{convo.draft && !convo.draftError ? ` · ${convo.draftStatus === "saving" ? "Saving draft…" : "Draft saved"}` : ""}</span>
    <span>{settings?.effortLevel ? `${settings.effortLevel} effort · ` : ""}{settings?.speed ?? "standard"} speed</span></div>;
}
