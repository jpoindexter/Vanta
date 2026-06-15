import { FormEvent, KeyboardEvent } from "react";
import type { Message, Session } from "./types.js";

export function SessionSidebar(props: { sessions: Session[]; activeId?: string; onNew: () => void; onOpen: (id: string) => void }) {
  return (
    <aside className="session-sidebar">
      <div className="window-dots"><i /><i /><i /></div>
      <button className="new-button" type="button" onClick={props.onNew}>New session</button>
      <section>
        <h2>Sessions</h2>
        <div className="session-list">
          {props.sessions.map((s) => <SessionButton key={s.id} session={s} active={s.id === props.activeId} onOpen={props.onOpen} />)}
          {props.sessions.length === 0 ? <p className="muted">No saved sessions yet.</p> : null}
        </div>
      </section>
    </aside>
  );
}

function SessionButton(props: { session: Session; active: boolean; onOpen: (id: string) => void }) {
  const className = props.active ? "session active" : "session";
  return (
    <button className={className} type="button" onClick={() => props.onOpen(props.session.id)}>
      <strong>{props.session.title}</strong>
      <span>{props.session.turns} turns</span>
    </button>
  );
}

export function ChatThread(props: { messages: Message[]; busy: boolean }) {
  const rows = props.messages.filter((m) => m.role !== "system");
  return (
    <section className="chat-thread" aria-live="polite">
      {rows.length === 0 ? <EmptyState /> : rows.map((m, i) => <MessageBubble key={i} message={m} />)}
      {props.busy ? <div className="thinking">Checking tools and context...</div> : null}
    </section>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const role = message.role === "user" ? "You" : message.role === "assistant" ? "Vanta" : message.name ?? message.role;
  return (
    <article className={`message ${message.role}`}>
      <span>{role}</span>
      <p>{message.content}</p>
    </article>
  );
}

export function Composer(props: { value: string; disabled: boolean; onChange: (value: string) => void; onSubmit: (text: string) => void }) {
  function send(event: FormEvent) {
    event.preventDefault();
    const value = props.value.trim();
    if (!value) return;
    props.onChange("");
    props.onSubmit(value);
  }
  return (
    <form className="composer" onSubmit={send}>
      <textarea value={props.value} onChange={(e) => props.onChange(e.target.value)} onKeyDown={keyDown} placeholder="Message Vanta. Use @ for files or / for commands." disabled={props.disabled} />
      <div>
        <span>Enter sends. Shift+Enter adds a line.</span>
        <button type="submit" disabled={props.disabled}>Send</button>
      </div>
    </form>
  );
}

function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

function EmptyState() {
  return (
    <div className="empty-state">
      <p className="eyebrow">Operator shell online</p>
      <h2>Start with the task, then inspect every action.</h2>
      <p>Sessions, tools, approvals, and context stay local behind the Vanta kernel.</p>
    </div>
  );
}
