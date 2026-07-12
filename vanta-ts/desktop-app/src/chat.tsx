import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Plus, Search, X } from "lucide-react";
import type { Message, Session } from "./types.js";

export function SessionSidebar(props: { sessions: Session[]; activeId?: string; onNew: () => void; onOpen: (id: string) => void; onDismiss?: () => void }) {
  const [query, setQuery] = useState("");
  const sessions = useMemo(() => props.sessions.filter((session) => session.title.toLowerCase().includes(query.toLowerCase())), [props.sessions, query]);
  return (
    <aside className="session-sidebar">
      <div className="brand-lockup"><span className="brand-mark">V</span><div><strong>Vanta</strong><small>Local operator</small></div><button className="panel-dismiss" type="button" aria-label="Close sessions" onClick={props.onDismiss}><X size={16} /></button></div>
      <button className="new-button" type="button" onClick={props.onNew}><Plus size={16} />New session</button>
      <section>
        <div className="section-heading"><h2>Sessions</h2><span>{props.sessions.length}</span></div>
        <label className="session-search"><Search size={14} /><span className="sr-only">Search sessions</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions" /></label>
        <div className="session-list">
          {sessions.map((s) => <SessionButton key={s.id} session={s} active={s.id === props.activeId} onOpen={props.onOpen} />)}
          {sessions.length === 0 ? <p className="muted">{query ? "No matching sessions." : "No saved sessions yet."}</p> : null}
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

export function ChatThread(props: { messages: Message[]; busy: boolean; onPrompt: (text: string) => void }) {
  const rows = props.messages.filter((m) => m.role !== "system");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [rows.length, props.busy]);
  return (
    <section className="chat-thread" aria-live="polite">
      {rows.length === 0 ? <EmptyState onPrompt={props.onPrompt} /> : rows.map((m, i) => <MessageBubble key={i} message={m} />)}
      {props.busy ? <div className="thinking"><i />Working through context and tools...</div> : null}
      <div ref={endRef} />
    </section>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const role = message.role === "user" ? "You" : message.role === "assistant" ? "Vanta" : message.name ?? message.role;
  return (
    <article className={`message ${message.role}`}>
      <span>{role}</span>
      <p>{message.content ?? ""}</p>
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
      <label className="sr-only" htmlFor="vanta-composer">Message Vanta</label>
      <textarea id="vanta-composer" value={props.value} onChange={(e) => props.onChange(e.target.value)} onKeyDown={keyDown} placeholder="Ask Vanta to do something..." disabled={props.disabled} />
      <div>
        <span><kbd>Enter</kbd> send <kbd>Shift Enter</kbd> newline · <strong>@</strong> files · <strong>/</strong> commands</span>
        <button className="send-button" type="submit" disabled={props.disabled || !props.value.trim()}><ArrowUp size={16} /><span>Send</span></button>
      </div>
    </form>
  );
}

function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

function EmptyState(props: { onPrompt: (text: string) => void }) {
  const prompts = ["Show me what changed in this project", "Find the highest-impact task", "Review the current roadmap"];
  return (
    <div className="empty-state">
      <span className="empty-mark">V</span>
      <p className="eyebrow">Ready in this project</p>
      <h2>What should Vanta handle?</h2>
      <p>Give it an outcome. Context, tools, approvals, and receipts stay visible.</p>
      <div className="prompt-grid">{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => props.onPrompt(prompt)}>{prompt}</button>)}</div>
    </div>
  );
}
