import { ApprovalCheckpoint,EmptyState,EventTimeline,RunRecovery,RunTimeline,checkpointPrompt } from "./chat-run-feedback.js";
import { LatestButton,PromptMarkers } from "./long-session-navigation.js";
import { ExpandedResponseDialog,MessageBubble,messageFeedbackKey } from "./message-bubble.js";
import { MessageMarkdown } from "./message-markdown.js";
import { TaskDossier } from "./task-dossier.js";
import type { Approval,ApprovalDecision,DesktopRunReceipt,Message } from "./types.js";
import { useChatTranscript,useMessageFeedback } from "./use-chat-transcript.js";

export type ChatThreadProps = { title: string; sessionId?: string; messages: Message[]; busy: boolean; streamText: string; events: { label: string; ok?: boolean }[]; recovery: DesktopRunReceipt | null; approval: Approval | null; queueCount: number; onApproval: (decision: ApprovalDecision) => void | Promise<void>; onRetry: () => void; onReconnect?: () => void; onPrompt: (text: string) => void };

export function ChatThread(props: ChatThreadProps) {
  const view = useChatTranscript(props);
  const { rows, navigation, jumpToPrompt } = view;
  const feedbackState = useMessageFeedback(rows);
  const { expanded, closeExpanded } = feedbackState;
  return (
    <div className="chat-thread-frame">
    <TaskDossier title={props.title} hasMessages={rows.length > 0} busy={props.busy} streaming={Boolean(props.streamText)} approval={props.approval} recovery={props.recovery} queueCount={props.queueCount} />
    <PromptMarkers messages={rows} onJump={jumpToPrompt} />
    <section ref={navigation.scrollerRef} className="chat-thread" aria-label="Conversation history" aria-live="polite" tabIndex={0}>
      {rows.length === 0 ? <EmptyState onPrompt={props.onPrompt} /> : null}
      <TranscriptRows view={view} feedbackState={feedbackState} />
      {props.approval ? <ApprovalCheckpoint approval={props.approval} onAnswer={props.onApproval} /> : null}
      {props.streamText ? <article className="message assistant streaming" aria-label="Vanta response streaming"><div className="message-content"><MessageMarkdown content={props.streamText} /></div></article> : null}
      <ActiveRunStatus {...props} />
      {expanded ? <ExpandedResponseDialog content={expanded.content} onClose={closeExpanded} /> : null}
      <div ref={navigation.bottomRef} aria-hidden="true" />
    </section>
    <LatestButton visible={navigation.detached && rows.length > 0} streaming={props.busy || !!props.streamText} onClick={navigation.goLatest} />
    </div>
  );
}


function TranscriptRows({ view, feedbackState }: { view: ReturnType<typeof useChatTranscript>; feedbackState: ReturnType<typeof useMessageFeedback> }) {
  const { turns, rows, transcript } = view;
  const { feedback, feedbackReasons, setMessageFeedback, setMessageFeedbackReason, setExpanded } = feedbackState;
  const virtualTurns = typeof window === "undefined"
    ? turns.map((_, index) => ({ index, key: index, start: 0 }))
    : transcript.getVirtualItems();

  return <>
      {turns.length ? <div className="transcript-window" style={typeof window === "undefined" ? undefined : { height: `${transcript.getTotalSize()}px` }}>
      {virtualTurns.map((virtualTurn) => {
        const turn = turns[virtualTurn.index]!;
        const { message, rowIndex } = turn;
        const key = messageFeedbackKey(message, rowIndex);
        return (
          <div
            ref={typeof window === "undefined" ? undefined : transcript.measureElement}
            className="transcript-turn"
            data-index={virtualTurn.index}
            data-turn-index={rowIndex}
            key={virtualTurn.key}
            style={typeof window === "undefined" ? undefined : { position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualTurn.start}px)` }}
          >
            {message.content?.trim() || !message.toolCalls?.length ? <MessageBubble
              message={message}
              feedback={feedback[key]}
              feedbackReason={feedbackReasons[key]}
              onFeedback={(value) => setMessageFeedback(key, value)}
              onFeedbackReason={(value) => setMessageFeedbackReason(key, value)}
              onExpand={(opener) => setExpanded({ content: message.content ?? "", opener })}
            /> : null}
            {message.toolCalls?.length ? <RunTimeline calls={message.toolCalls} messages={rows} /> : null}
          </div>
        );
      })}
      </div> : null}
  </>;
}

function ActiveRunStatus(props: ChatThreadProps) {
  const recovery = props.recovery;
  return <>
      {props.busy ? <div className="thinking"><i />Working...</div> : null}
      {props.events.length && props.events[0]?.label !== "No tool activity yet." ? <EventTimeline events={props.events} /> : null}
      {recovery ? <RunRecovery receipt={recovery} onRetry={props.onRetry} onReconnect={() => props.onReconnect?.()} onEdit={() => props.onPrompt(recovery.checkpoint?.instruction ?? "")} onCheckpoint={() => props.onPrompt(checkpointPrompt(recovery))} /> : null}
  </>;
}
