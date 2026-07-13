import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, ArrowUp, Check, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { Message, Session } from "./types.js";

type SessionSidebarProps = {
  sessions: Session[];
  activeId?: string;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void | Promise<void>;
  onArchive: (id: string, archived: boolean) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onDismiss?: () => void;
};

export function SessionSidebar(props: SessionSidebarProps) {
  const [query, setQuery] = useState("");
  const sessions = useMemo(() => props.sessions.filter((session) => session.title.toLowerCase().includes(query.toLowerCase())), [props.sessions, query]);
  const active = sessions.filter((session) => !session.archived);
  const archived = sessions.filter((session) => session.archived);
  return (
    <aside className="session-sidebar">
      <div className="brand-lockup"><span className="brand-mark">V</span><div><strong>Vanta</strong><small>Local operator</small></div><button className="panel-dismiss" type="button" aria-label="Close sessions" onClick={props.onDismiss}><X size={16} /></button></div>
      <button className="new-button" type="button" onClick={props.onNew}><Plus size={16} />New session</button>
      <section>
        <div className="section-heading"><h2>Sessions</h2><span>{active.length}</span></div>
        <label className="session-search"><Search size={14} /><span className="sr-only">Search sessions</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions" /></label>
        <div className="session-list">
          {active.map((s) => <SessionButton key={s.id} session={s} active={s.id === props.activeId} onOpen={props.onOpen} onRename={props.onRename} onArchive={props.onArchive} onDelete={props.onDelete} />)}
          {archived.length > 0 ? (
            <details className="archived-sessions">
              <summary>Archived <span>{archived.length}</span></summary>
              <div>{archived.map((s) => <SessionButton key={s.id} session={s} active={s.id === props.activeId} onOpen={props.onOpen} onRename={props.onRename} onArchive={props.onArchive} onDelete={props.onDelete} />)}</div>
            </details>
          ) : null}
          {sessions.length === 0 ? <p className="muted">{query ? "No matching sessions." : "No saved sessions yet."}</p> : null}
        </div>
      </section>
    </aside>
  );
}

function SessionButton(props: {
  session: Session;
  active: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void | Promise<void>;
  onArchive: (id: string, archived: boolean) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(props.session.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const className = props.active ? "session-row active" : "session-row";

  useEffect(() => { setTitle(props.session.title); }, [props.session.title]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function startRename() {
    setMenuOpen(false);
    setTitle(props.session.title);
    setEditing(true);
  }
  async function saveRename() {
    const next = title.trim().replace(/\s+/g, " ");
    if (!next || next === props.session.title) { setEditing(false); return; }
    await props.onRename(props.session.id, next);
    setEditing(false);
  }
  function confirmDelete() {
    setMenuOpen(false);
    if (window.confirm(`Delete \"${props.session.title}\" permanently? This cannot be undone.`)) void props.onDelete(props.session.id);
  }

  return (
    <div className={className}>
      {editing ? (
        <form className="session-rename" onSubmit={(event) => { event.preventDefault(); void saveRename(); }}>
          <label className="sr-only" htmlFor={`session-title-${props.session.id}`}>Session title</label>
          <input id={`session-title-${props.session.id}`} ref={inputRef} value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setEditing(false); } }} />
          <button type="submit" aria-label="Save session name" title="Save session name"><Check size={14} /></button>
          <button type="button" aria-label="Cancel rename" title="Cancel rename" onClick={() => setEditing(false)}><X size={14} /></button>
        </form>
      ) : (
        <>
          <button className="session" type="button" onClick={() => props.onOpen(props.session.id)}>
            <strong>{props.session.title}</strong>
            <span>{props.session.turns} turns</span>
          </button>
          <button className="session-menu-button" type="button" aria-label={`Manage ${props.session.title}`} aria-expanded={menuOpen} title="Manage session" onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={16} /></button>
          {menuOpen ? (
            <div className="session-actions" onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}>
              <button type="button" onClick={startRename}><Pencil size={14} />Rename</button>
              <button type="button" onClick={() => { setMenuOpen(false); void props.onArchive(props.session.id, !props.session.archived); }}>
                {props.session.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}{props.session.archived ? "Restore" : "Archive"}
              </button>
              <button className="danger" type="button" onClick={confirmDelete}><Trash2 size={14} />Delete</button>
            </div>
          ) : null}
        </>
      )}
    </div>
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
