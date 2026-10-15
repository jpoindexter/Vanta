import { Copy,Maximize2,ThumbsDown,ThumbsUp,X } from "lucide-react";
import { useEffect,useRef,useState } from "react";
import { MessageMarkdown } from "./message-markdown.js";
import type { Message } from "./types.js";

export type MessageFeedback = "helpful" | "not_helpful";

export type MessageBubbleProps = { message: Message; feedback?: MessageFeedback; feedbackReason?: string; onFeedback?: (value: MessageFeedback) => void; onFeedbackReason?: (reason: string) => void; onExpand?: (opener: HTMLButtonElement) => void };

export function MessageBubble(props: MessageBubbleProps) {
  const { message } = props;
  const role = message.role === "user" ? "You" : message.role === "assistant" ? "Vanta" : message.name ?? message.role;
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const canCopy = !!message.content;
  const isAssistant = message.role === "assistant";

  async function copyMessage() {
    const text = message.content ?? "";
    setCopyState("copying");
    try {
      await copyText(text);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <article className={`message ${message.role}`} aria-label={`${role} message`}>
      <div className="message-content">
        <MessageMarkdown content={message.content ?? ""} />
        {canCopy ? (
          <MessageFooter {...props} copyState={copyState} onCopy={() => void copyMessage()} />
        ) : null}
        {copyState === "copied" ? <small className="message-action-feedback" role="status">{isAssistant ? "Copied response" : "Copied message"}</small> : null}
        {copyState === "failed" ? <small className="message-action-feedback bad" role="status">Copy failed</small> : null}
        {props.feedback === "not_helpful" ? <FeedbackReasonPicker selected={props.feedbackReason} onSelect={(reason) => props.onFeedbackReason?.(reason)} /> : null}
      </div>
    </article>
  );
}

function FeedbackReasonPicker(props: { selected?: string; onSelect: (reason: string) => void }) {
  const reasons = ["Wrong", "Incomplete", "Unsafe"];
  return (
    <div className="feedback-reasons" aria-label="Not helpful reason">
      {reasons.map((reason) => <button key={reason} type="button" aria-pressed={props.selected === reason} onClick={() => props.onSelect(reason)}>{reason}</button>)}
    </div>
  );
}

export function ExpandedResponseDialog(props: { content: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props]);
  return (
    <div className="dialog-backdrop response-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section className="response-dialog" role="dialog" aria-modal="true" aria-labelledby="response-dialog-title">
        <header><div><span>Full response</span><h2 id="response-dialog-title">Vanta transcript</h2></div><button ref={closeRef} type="button" aria-label="Close expanded response" onClick={props.onClose}><X size={16} /></button></header>
        <pre>{props.content}</pre>
      </section>
    </div>
  );
}

async function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === "undefined") return;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function messageFeedbackKey(message: Message, index: number): string {
  return `vanta.desktop.message-feedback.${index}.${messageFingerprint(message.content ?? "")}`;
}

function messageFingerprint(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  return Math.abs(hash).toString(36);
}


function MessageFooter(props: MessageBubbleProps & { copyState: string; onCopy: () => void }) {
  const { message, copyState } = props;
  const isAssistant = message.role === "assistant";
  return (
          <footer className="message-footer">
            {message.role === "user" ? <time dateTime={new Date(0).toISOString()}>now</time> : null}
            <span className="message-actions" role="toolbar" aria-label={isAssistant ? "Response actions" : "Message actions"}>
              <button type="button" aria-label={isAssistant ? "Copy response" : "Copy message"} title={isAssistant ? "Copy response" : "Copy message"} disabled={copyState === "copying"} data-state={copyState} onClick={props.onCopy}><Copy size={14} /></button>
              {isAssistant ? <>
                <button type="button" aria-label="Mark helpful" title="Helpful" aria-pressed={props.feedback === "helpful"} data-state={props.feedback === "helpful" ? "selected" : "idle"} onClick={() => props.onFeedback?.("helpful")}><ThumbsUp size={14} /></button>
                <button type="button" aria-label="Mark not helpful" title="Not helpful" aria-pressed={props.feedback === "not_helpful"} data-state={props.feedback === "not_helpful" ? "selected" : "idle"} onClick={() => props.onFeedback?.("not_helpful")}><ThumbsDown size={14} /></button>
                <button type="button" aria-label="Expand response" title="Expand response" onClick={(event) => props.onExpand?.(event.currentTarget)}><Maximize2 size={14} /></button>
              </> : null}
            </span>
          </footer>
  );
}
