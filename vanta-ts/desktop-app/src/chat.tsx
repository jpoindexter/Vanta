import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Activity, Archive, ArchiveRestore, ArrowUp, Bot, Check, CheckCircle2, ChevronRight, Copy, Cpu, FileText, FolderKanban, GitBranch, Keyboard, Laptop, ListPlus, Maximize2, MessageSquare, MoreHorizontal, Network, PackageOpen, Paperclip, Pencil, Plus, RotateCcw, Search, Settings2, ShieldCheck, Square, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import type { Approval, ApprovalDecision, DesktopRunReceipt, DesktopView, Message, Session } from "./types.js";

type SessionSidebarProps = {
  sessions: Session[];
  root?: string;
  activeId?: string;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void | Promise<void>;
  onArchive: (id: string, archived: boolean) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  view: DesktopView;
  onView: (view: DesktopView) => void;
  onSettings: () => void;
  onShortcuts: () => void;
  onDismiss?: () => void;
};

export function SessionSidebar(props: SessionSidebarProps) {
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const sessions = useMemo(() => props.sessions.filter((session) => session.title.toLowerCase().includes(query.toLowerCase())), [props.sessions, query]);
  const active = sessions.filter((session) => !session.archived);
  const archived = sessions.filter((session) => session.archived);
  const projectSessions = active.slice(0, 3);
  const recentSessions = active.slice(3);
  const visibleSessions = useMemo(() => [...projectSessions, ...recentSessions, ...(archivedOpen ? archived : [])], [projectSessions, recentSessions, archived, archivedOpen]);
  const projectName = props.root?.split("/").filter(Boolean).at(-1) ?? "Current project";
  const selectedSessions = useMemo(() => props.sessions.filter((session) => selected.has(session.id)), [props.sessions, selected]);

  useEffect(() => {
    setSelected((current) => {
      const ids = new Set(props.sessions.map((session) => session.id));
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [props.sessions]);
  useEffect(() => { if (!archived.length) setArchivedOpen(false); }, [archived.length]);

  function toggleSelected(id: string, range = false) {
    setBulkStatus("");
    setSelected((current) => {
      const next = new Set(current);
      if (range && lastSelectedId) {
        const anchor = visibleSessions.findIndex((session) => session.id === lastSelectedId);
        const target = visibleSessions.findIndex((session) => session.id === id);
        if (anchor >= 0 && target >= 0) {
          const start = Math.min(anchor, target);
          const end = Math.max(anchor, target);
          for (const session of visibleSessions.slice(start, end + 1)) next.add(session.id);
          return next;
        }
      }
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setLastSelectedId(id);
  }
  function startSelecting() {
    setSelecting(true);
    setBulkStatus("");
  }
  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
    setLastSelectedId(null);
  }
  function clearSelected() {
    setSelected(new Set());
    setLastSelectedId(null);
    setBulkStatus("");
  }
  function selectAllVisible() {
    const ids = visibleSessions.map((session) => session.id);
    setSelecting(true);
    setSelected(new Set(ids));
    setLastSelectedId(ids.at(-1) ?? null);
    setBulkStatus("");
  }
  async function archiveSelected(archivedState: boolean) {
    const targets = [...selectedSessions];
    if (!targets.length) return;
    for (const session of targets) await props.onArchive(session.id, archivedState);
    setBulkStatus(`${archivedState ? "Archived" : "Restored"} ${targets.length} session${targets.length === 1 ? "" : "s"}.`);
    setSelected(new Set());
    setLastSelectedId(null);
    setSelecting(false);
  }
  async function deleteSelected() {
    const targets = [...selectedSessions];
    if (!targets.length) return;
    if (!window.confirm(`Delete ${targets.length} selected session${targets.length === 1 ? "" : "s"} permanently? This cannot be undone.`)) return;
    for (const session of targets) await props.onDelete(session.id);
    setBulkStatus(`Deleted ${targets.length} session${targets.length === 1 ? "" : "s"}.`);
    setSelected(new Set());
    setLastSelectedId(null);
    setSelecting(false);
  }
  const renderSession = (session: Session) => (
    <SessionButton
      key={session.id}
      session={session}
      active={session.id === props.activeId}
      selecting={selecting}
      selected={selected.has(session.id)}
      onSelect={toggleSelected}
      onOpen={props.onOpen}
      onRename={props.onRename}
      onArchive={props.onArchive}
      onDelete={props.onDelete}
    />
  );

  return (
    <aside className="session-sidebar">
      <div className="drawer-toolbar"><span>Threads</span><button className="panel-dismiss" type="button" aria-label="Close sessions" onClick={props.onDismiss}><X size={16} /></button></div>
      <nav className="desktop-nav" aria-label="Vanta workspace">
        <button className={props.view === "work" ? "active" : ""} type="button" onClick={() => props.onView("work")}><MessageSquare size={16} />Work <span aria-hidden="true">{active.length}</span></button>
        <button className={props.view === "operate" ? "active" : ""} type="button" onClick={() => props.onView("operate")}><Activity size={16} />Operate</button>
        <button className={props.view === "outputs" ? "active" : ""} type="button" onClick={() => props.onView("outputs")}><PackageOpen size={16} />Outputs</button>
        <button className={props.view === "connect" ? "active" : ""} type="button" onClick={() => props.onView("connect")}><Network size={16} />Connect</button>
      </nav>
      <section className="project-rail">
        <div className="section-heading project-heading"><h2>Projects</h2><button type="button" title="New task" aria-label="New task" onClick={props.onNew}><Plus size={14} /></button></div>
        <div className="project-row active"><span><FolderKanban size={15} />{projectName}</span><b>{projectSessions.length}</b></div>
        <div className="session-list project-session-group">
          {projectSessions.map(renderSession)}
        </div>
        <div className="section-heading recent-heading">
          <h2>Recent sessions</h2>
          <div><span>{recentSessions.length}</span><button type="button" onClick={selecting ? stopSelecting : startSelecting}>{selecting ? "Cancel" : "Select chats"}</button></div>
        </div>
        <label className="session-search"><Search size={14} /><span className="sr-only">Search sessions</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions" /></label>
        {selecting ? <BulkSessionActions count={selected.size} visibleCount={visibleSessions.length} onSelectAll={selectAllVisible} onClear={clearSelected} onArchive={() => void archiveSelected(true)} onRestore={() => void archiveSelected(false)} onDelete={() => void deleteSelected()} onCancel={stopSelecting} /> : null}
        {bulkStatus ? <div className="session-bulk-status" role="status">{bulkStatus}</div> : null}
        <div className="session-list recent-session-group">
          {recentSessions.map(renderSession)}
          {archived.length > 0 ? (
            <details className="archived-sessions" open={archivedOpen} onToggle={(event) => setArchivedOpen(event.currentTarget.open)}>
              <summary>Archived <span>{archived.length}</span></summary>
              <div>{archived.map(renderSession)}</div>
            </details>
          ) : null}
          {recentSessions.length === 0 && projectSessions.length === 0 ? <p className="muted">{query ? "No matching sessions." : "No saved sessions yet."}</p> : null}
        </div>
      </section>
      <footer className="session-sidebar-footer"><button type="button" onClick={props.onShortcuts}><Keyboard size={14} />Keyboard shortcuts <kbd>?</kbd></button><button type="button" onClick={props.onSettings}><Settings2 size={14} />Settings</button></footer>
    </aside>
  );
}

function BulkSessionActions(props: { count: number; visibleCount: number; onSelectAll: () => void; onClear: () => void; onArchive: () => void; onRestore: () => void; onDelete: () => void; onCancel: () => void }) {
  const disabled = props.count === 0;
  return (
    <div className="session-bulk-actions" role="toolbar" aria-label="Selected session actions">
      <span>{props.count ? `${props.count} selected` : "Select chats"} <small>Shift-click for a range</small></span>
      <button type="button" disabled={props.visibleCount === 0} onClick={props.onSelectAll}><Check size={13} />All visible</button>
      <button type="button" disabled={disabled} onClick={props.onClear}><X size={13} />Clear</button>
      <button type="button" disabled={disabled} onClick={props.onArchive}><Archive size={13} />Archive</button>
      <button type="button" disabled={disabled} onClick={props.onRestore}><ArchiveRestore size={13} />Restore</button>
      <button className="danger" type="button" disabled={disabled} onClick={props.onDelete}><Trash2 size={13} />Delete</button>
      <button type="button" onClick={props.onCancel}><X size={13} />Done</button>
    </div>
  );
}

function SessionButton(props: {
  session: Session;
  active: boolean;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: (id: string, range?: boolean) => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void | Promise<void>;
  onArchive: (id: string, archived: boolean) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(props.session.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const className = `${props.active ? "session-row active" : "session-row"}${props.selecting ? " selecting" : ""}${props.selected ? " selected" : ""}`;

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
          {props.selecting ? <label className="session-select" title={`Select ${props.session.title}`}><input type="checkbox" checked={!!props.selected} onChange={() => undefined} onClick={(event) => props.onSelect?.(props.session.id, event.shiftKey)} /><span className="sr-only">Select {props.session.title}</span></label> : null}
          <button className="session" type="button" onClick={(event) => props.selecting ? props.onSelect?.(props.session.id, event.shiftKey) : props.onOpen(props.session.id)}>
            <strong>{props.session.title}</strong>
            <span>{props.session.turns} turns</span>
          </button>
          {props.selecting ? null : <button className="session-menu-button" type="button" aria-label={`Manage ${props.session.title}`} aria-expanded={menuOpen} title="Manage session" onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={16} /></button>}
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

type MessageFeedback = "helpful" | "not_helpful";
type ExpandedMessage = { content: string; opener: HTMLButtonElement | null } | null;

export function ChatThread(props: { messages: Message[]; busy: boolean; streamText: string; events: { label: string; ok?: boolean }[]; recovery: DesktopRunReceipt | null; approval: Approval | null; onApproval: (decision: ApprovalDecision) => void; onRetry: () => void; onPrompt: (text: string) => void }) {
  const rows = useMemo(() => props.messages.filter((m) => m.role !== "system"), [props.messages]);
  const recovery = props.recovery;
  const endRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<Record<string, MessageFeedback>>({});
  const [feedbackReasons, setFeedbackReasons] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<ExpandedMessage>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const next: Record<string, MessageFeedback> = {};
    const reasons: Record<string, string> = {};
    rows.forEach((message, index) => {
      if (message.role !== "assistant") return;
      const key = messageFeedbackKey(message, index);
      const stored = window.localStorage.getItem(key);
      if (stored === "helpful" || stored === "not_helpful") next[key] = stored;
      const reason = window.localStorage.getItem(`${key}:reason`);
      if (reason) reasons[key] = reason;
    });
    setFeedback(next);
    setFeedbackReasons(reasons);
  }, [rows]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [rows.length, props.busy, props.streamText]);

  function setMessageFeedback(key: string, value: MessageFeedback) {
    setFeedback((current) => ({ ...current, [key]: value }));
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  }
  function setMessageFeedbackReason(key: string, value: string) {
    setFeedbackReasons((current) => ({ ...current, [key]: value }));
    if (typeof window !== "undefined") window.localStorage.setItem(`${key}:reason`, value);
  }
  function closeExpanded() {
    const opener = expanded?.opener;
    setExpanded(null);
    window.requestAnimationFrame(() => opener?.focus());
  }

  return (
    <section className="chat-thread" aria-live="polite">
      {rows.length === 0 ? <EmptyState onPrompt={props.onPrompt} /> : <div className="run-summary"><span><i />{props.busy ? "Live trace" : "Run record"}</span><time>{props.busy ? "working now" : "current session"}</time></div>}
      {rows.map((message, index) => {
        if (message.role === "tool") return null;
        const key = messageFeedbackKey(message, index);
        return (
          <div className="transcript-turn" key={`${message.role}-${index}`}>
            <MessageBubble
              message={message}
              feedback={feedback[key]}
              feedbackReason={feedbackReasons[key]}
              onFeedback={(value) => setMessageFeedback(key, value)}
              onFeedbackReason={(value) => setMessageFeedbackReason(key, value)}
              onExpand={(opener) => setExpanded({ content: message.content ?? "", opener })}
            />
            {message.toolCalls?.length ? <RunTimeline calls={message.toolCalls} messages={rows} /> : null}
          </div>
        );
      })}
      {props.approval ? <ApprovalCheckpoint approval={props.approval} onAnswer={props.onApproval} /> : null}
      {props.streamText ? <article className="message assistant streaming" aria-label="Vanta response streaming"><div className="message-content"><header><strong>Vanta</strong><time>now</time></header><p>{props.streamText}</p></div></article> : null}
      {props.busy ? <div className="thinking"><i />Working...</div> : null}
      {props.events.length && props.events[0]?.label !== "No tool activity yet." ? <EventTimeline events={props.events.slice(-5)} /> : null}
      {recovery ? <RunRecovery receipt={recovery} onRetry={props.onRetry} onEdit={() => props.onPrompt(recovery.checkpoint?.instruction ?? "")} onCheckpoint={() => props.onPrompt(checkpointPrompt(recovery))} /> : null}
      {expanded ? <ExpandedResponseDialog content={expanded.content} onClose={closeExpanded} /> : null}
      <div ref={endRef} />
    </section>
  );
}

function MessageBubble(props: { message: Message; feedback?: MessageFeedback; feedbackReason?: string; onFeedback?: (value: MessageFeedback) => void; onFeedbackReason?: (reason: string) => void; onExpand?: (opener: HTMLButtonElement) => void }) {
  const { message } = props;
  const role = message.role === "user" ? "You" : message.role === "assistant" ? "Vanta" : message.name ?? message.role;
  const showHeader = message.role !== "user";
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const canAct = message.role === "assistant" && !!message.content;

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
        {showHeader ? (
          <header>
            <span className="message-meta"><strong>{role}</strong><time dateTime={new Date(0).toISOString()}>now</time></span>
            {canAct ? (
              <span className="message-actions" role="toolbar" aria-label="Response actions">
                <button type="button" aria-label="Copy response" title="Copy response" disabled={copyState === "copying"} data-state={copyState} onClick={() => void copyMessage()}><Copy size={14} /></button>
                <button type="button" aria-label="Mark helpful" title="Helpful" aria-pressed={props.feedback === "helpful"} data-state={props.feedback === "helpful" ? "selected" : "idle"} onClick={() => props.onFeedback?.("helpful")}><ThumbsUp size={14} /></button>
                <button type="button" aria-label="Mark not helpful" title="Not helpful" aria-pressed={props.feedback === "not_helpful"} data-state={props.feedback === "not_helpful" ? "selected" : "idle"} onClick={() => props.onFeedback?.("not_helpful")}><ThumbsDown size={14} /></button>
                <button type="button" aria-label="Expand response" title="Expand response" onClick={(event) => props.onExpand?.(event.currentTarget)}><Maximize2 size={14} /></button>
              </span>
            ) : null}
          </header>
        ) : null}
        <p>{message.content ?? ""}</p>
        {copyState === "copied" ? <small className="message-action-feedback" role="status">Copied response</small> : null}
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

function ExpandedResponseDialog(props: { content: string; onClose: () => void }) {
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

function messageFeedbackKey(message: Message, index: number): string {
  return `vanta.desktop.message-feedback.${index}.${messageFingerprint(message.content ?? "")}`;
}

function messageFingerprint(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  return Math.abs(hash).toString(36);
}

function RunTimeline(props: { calls: NonNullable<Message["toolCalls"]>; messages: Message[] }) {
  return <section className="run-timeline" aria-label="Run steps">{props.calls.map((call) => {
    const result = props.messages.find((message) => message.role === "tool" && message.toolCallId === call.id);
    return <div className="timeline-step" key={call.id}><span><CheckCircle2 size={13} /></span><div><strong>{result?.content || humanizeTool(call.name)}</strong><small>{call.name}</small></div><em>{result ? "done" : "running"}</em></div>;
  })}</section>;
}

function EventTimeline(props: { events: { label: string; ok?: boolean }[] }) {
  return <section className="run-timeline event-timeline" aria-label="Current run activity">{props.events.map((event, index) => <div className={`timeline-step ${event.ok === false ? "bad" : ""}`} key={`${event.label}-${index}`}><span><ChevronRight size={13} /></span><div><strong>{event.label}</strong></div><em>{event.ok === false ? "attention" : event.ok ? "done" : "active"}</em></div>)}</section>;
}

function RunRecovery(props: { receipt: DesktopRunReceipt; onRetry: () => void; onEdit: () => void; onCheckpoint: () => void }) {
  const label = props.receipt.status === "interrupted" ? "Run stopped" : "Run needs attention";
  const reason = props.receipt.failureKind ? props.receipt.failureKind.replaceAll("_", " ") : "unknown";
  return (
    <section className="run-recovery" role="status">
      <div><strong>{label}</strong><span>Partial output and timeline were saved. Failure: {reason}.</span></div>
      <div className="run-recovery-actions">
        <button type="button" onClick={props.onRetry}><RotateCcw size={15} />Retry failed step</button>
        <button type="button" onClick={props.onEdit}>Edit request</button>
        <button type="button" onClick={props.onCheckpoint}>Start from checkpoint</button>
      </div>
    </section>
  );
}

function checkpointPrompt(receipt: DesktopRunReceipt): string {
  const instruction = receipt.checkpoint?.instruction ?? "Continue from the saved checkpoint.";
  const partial = receipt.checkpoint?.partialText?.trim();
  return partial ? `Continue from this checkpoint and avoid repeating completed work. Original request: ${instruction}\n\nSaved partial output:\n${partial}` : `Continue from this checkpoint. Original request: ${instruction}`;
}

function ApprovalCheckpoint(props: { approval: Approval; onAnswer: (decision: ApprovalDecision) => void }) {
  const request = props.approval.request;
  return <section className="inline-approval" role="alert"><header><ShieldCheck size={15} /><strong>Approval required</strong></header><p>{request?.reason ?? props.approval.reason}</p>{request?.subject ? <code>{request.subject}</code> : null}<div><button className="primary" type="button" onClick={() => props.onAnswer("allow")}>Allow once</button><button type="button" onClick={() => props.onAnswer("deny")}>Reject</button></div></section>;
}

function humanizeTool(name: string): string {
  return name.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function Composer(props: { value: string; busy: boolean; model?: string; root?: string; tools?: number; attachments: string[]; onChange: (value: string) => void; onSubmit: (text: string) => void; onQueue: (text: string) => void; onRemoveAttachment: (file: string) => void; onStop: () => void; onAttach: () => void; onModel: () => void; onCommand: () => void }) {
  function send(event: FormEvent) {
    event.preventDefault();
    const value = props.value.trim();
    if (!value) return;
    props.onChange("");
    if (props.busy) props.onQueue(value);
    else props.onSubmit(value);
  }
  return (
    <form className="composer" onSubmit={send}>
      <div className="task-context" aria-label="Task execution context"><span><Bot size={12} /><strong>Operator</strong></span><span><Laptop size={12} /><strong>Local Mac</strong></span><span><FolderKanban size={12} /><strong>{props.root?.split("/").filter(Boolean).at(-1) ?? "Project"}</strong></span><span><GitBranch size={12} /><strong>main</strong></span><span><Cpu size={12} /><strong>Session model</strong></span><span><Network size={12} /><strong>Tools {props.tools ?? 0}</strong></span><span><PackageOpen size={12} /><strong>Memory local</strong></span><span className="safe"><ShieldCheck size={12} />Ask before risk</span></div>
      <label className="sr-only" htmlFor="vanta-composer">Message Vanta</label>
      <textarea id="vanta-composer" value={props.value} onChange={(e) => props.onChange(e.target.value)} onKeyDown={(event) => keyDown(event, props)} placeholder={props.busy ? "Queue the next instruction..." : "Ask Vanta to do something..."} />
      {props.attachments.length ? <div className="context-chips" aria-label="Attached project context">{props.attachments.map((file) => <span key={file}><span title={file}>{file}</span><button type="button" aria-label={`Remove ${file}`} title={`Remove ${file}`} onClick={() => props.onRemoveAttachment(file)}><X size={13} /></button></span>)}</div> : null}
      <div className="composer-footer">
        <div className="composer-context-controls"><button className="composer-context-button" type="button" title="Attach project files" aria-label="Attach project files" onClick={props.onAttach}><Paperclip size={15} /><span>Context</span></button><button className="composer-command-button" type="button" title="Open commands" aria-label="Open commands" onClick={props.onCommand}><Plus size={15} /><span>Commands</span></button></div>
        <div className="composer-actions"><button className="model-button" type="button" title="Change model" onClick={props.onModel}><Cpu size={14} /><span>{props.model ?? "Choose model"}</span></button><span className="approval-mode"><ShieldCheck size={12} />Ask</span>{props.busy ? <><button className="queue-button" type="submit" disabled={!props.value.trim()} title="Queue next instruction"><ListPlus size={15} /><span>Queue</span></button><button className="stop-button" type="button" title="Stop current run" aria-label="Stop current run" onClick={props.onStop}><Square size={14} /><span>Stop</span></button></> : <button className="send-button" type="submit" disabled={!props.value.trim()} aria-label="Send"><ArrowUp size={16} /></button>}</div>
      </div>
    </form>
  );
}

function keyDown(event: KeyboardEvent<HTMLTextAreaElement>, props: Pick<Parameters<typeof Composer>[0], "value" | "onAttach" | "onCommand">) {
  if (!props.value && event.key === "@") {
    event.preventDefault();
    props.onAttach();
    return;
  }
  if (!props.value && event.key === "/") {
    event.preventDefault();
    props.onCommand();
    return;
  }
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

function EmptyState(props: { onPrompt: (text: string) => void }) {
  const prompts = ["Show me what changed in this project", "Find the highest-impact task", "Review the current roadmap"];
  return (
    <div className="empty-state">
      <p className="empty-kicker">Vanta is ready in this project</p>
      <h2>Name the outcome.</h2>
      <p>Vanta will show its context, actions, approvals, and proof as it works.</p>
      <div className="prompt-grid">{prompts.map((prompt, index) => <button key={prompt} type="button" onClick={() => props.onPrompt(prompt)}><span aria-hidden="true">0{index + 1}</span><strong>{prompt}</strong></button>)}</div>
    </div>
  );
}
