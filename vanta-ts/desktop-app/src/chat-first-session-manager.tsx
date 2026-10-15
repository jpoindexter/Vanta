import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pin, Search } from "lucide-react";
import { SessionNoticeToast, useSessionSafeOps } from "./session-safe-ops.js";
import { movePinnedSession } from "./session-pinning.js";
import { chatTitle } from "./chat-first-navigation.js";
import type { ChatFirstState } from "./chat-first-state.js";
import type { ChatFirstActions } from "./chat-first-actions.js";
import type { Session } from "./types.js";

type Scope = "recent" | "archived" | "trash";
type Props = { state: ChatFirstState; actions: ChatFirstActions };

export function managedChats(sessions: Session[], scope: Scope, query: string): Session[] {
  return sessions.filter((session) => {
    const matches = chatTitle(session).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    if (scope === "trash") return matches && session.trashed;
    return matches && !session.trashed && Boolean(session.archived) === (scope === "archived");
  }).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
    (a.pinned && b.pinned ? (a.pinOrder ?? 0) - (b.pinOrder ?? 0) : b.updated.localeCompare(a.updated)));
}

function useChatManager(state: ChatFirstState) {
  const [scope, setScope] = useState<Scope>("recent");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const rows = useMemo(() => managedChats(state.data.sessions, scope, query), [state.data.sessions, scope, query]);
  const targets = rows.filter((row) => selected.includes(row.id));
  const safe = useManagerOperations(state);
  const locked = state.convo.busy || state.pending || !state.ready;
  const pending = targets.some((row) => safe.pending(row.id));
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const archive = async (value: boolean) => { if (await safe.archive(targets, value)) setSelected([]); };
  const remove = async (permanent = false) => {
    if (await safe.remove(targets, permanent ? "permanent" : scope === "trash" ? "restore" : "trash")) {
      setSelected([]); setConfirm(false); setConfirmation("");
    }
  };
  const changeScope = (value: Scope) => { setScope(value); setSelected([]); setConfirm(false); };
  return { scope, changeScope, query, setQuery, selected, setSelected, confirm, setConfirm, confirmation, setConfirmation,
    rows, targets, safe, locked, pending, toggle, archive, remove };
}

type Manager = ReturnType<typeof useChatManager>;

export function ChatSessionManager({ state, actions }: Props) {
  const manager = useChatManager(state);
  return <section className="chat-manager" aria-label="Manage chats">
    <div className="chat-manager-filter"><label><Search size={16} /><span className="sr-only">Find saved chats</span>
      <input type="search" value={manager.query} onChange={(event) => manager.setQuery(event.target.value)} placeholder="Find a conversation" /></label>
      <label><span className="sr-only">Chat collection</span><select value={manager.scope} onChange={(event) => manager.changeScope(event.target.value as Scope)}>
        <option value="recent">Recent chats</option><option value="archived">Archived chats</option><option value="trash">Trash</option></select></label></div>
    <ManagerToolbar manager={manager} />
    {manager.confirm ? <DeleteConfirmation manager={manager} /> : null}
    {manager.locked ? <p className="chat-panel-note">Stop the response before changing saved conversations.</p> : null}
    <ManagerRows manager={manager} state={state} actions={actions} />
    {!manager.rows.length ? <p className="chat-panel-note">{manager.query ? "No matching conversations in this collection." : "This collection is empty."}</p> : null}
    <SessionNoticeToast notice={manager.safe.notice} onDismiss={manager.safe.dismissNotice} />
  </section>;
}

function ManagerToolbar({ manager }: { manager: Manager }) {
  const { targets, rows, locked, pending, scope, archive, remove, setSelected, setConfirm, setConfirmation } = manager;
  const unavailable = locked || pending || !targets.length;
  return (
    <div className="chat-manager-toolbar" role="toolbar" aria-label="Selected chat actions" aria-busy={pending}>
      <span>{targets.length} selected</span><button type="button" disabled={locked || pending} onClick={() => setSelected(rows.map((row) => row.id))}>Select visible</button>
      <button type="button" disabled={!targets.length || pending} onClick={() => setSelected([])}>Clear</button>
      {scope !== "trash" ? <button type="button" disabled={unavailable} onClick={() => void archive(scope !== "archived")}>{scope === "archived" ? "Unarchive" : "Archive"}</button> : null}
      <button type="button" disabled={unavailable} onClick={() => void remove()}>{scope === "trash" ? "Restore" : "Move to Trash"}</button>
      {scope === "trash" ? <button type="button" className="danger" disabled={unavailable} onClick={() => { setConfirm(true); setConfirmation(""); }}>Delete forever…</button> : null}
    </div>
  );
}

function DeleteConfirmation({ manager }: { manager: Manager }) {
  const { confirmation, pending, targets, locked, remove, setConfirmation, setConfirm } = manager;
  return <form className="chat-delete-confirm" onSubmit={(event) => { event.preventDefault(); if (confirmation === "DELETE" && !pending) void remove(true); }}>
      <label>Type DELETE to permanently erase {targets.length} selected chats<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoFocus /></label>
      <p>Transcripts and associated drafts cannot be restored after this action.</p>
      <button type="submit" disabled={confirmation !== "DELETE" || pending || locked || !targets.length}>Delete forever</button><button type="button" disabled={pending} onClick={() => setConfirm(false)}>Cancel</button>
    </form>;
}

function ManagerRows({ manager, state, actions }: Props & { manager: Manager }) {
  const { rows, selected, locked, safe, toggle } = manager;
  return <ul className="chat-manager-list">{rows.map((row) => <li key={row.id}>
      <label className="chat-manager-check"><span className="sr-only">Select {chatTitle(row)}</span><input type="checkbox" checked={selected.includes(row.id)} disabled={locked || safe.pending(row.id)} onChange={() => toggle(row.id)} /></label>
      <button className="chat-manager-open" type="button" disabled={locked || Boolean(row.trashed)} onClick={() => void actions.navigate(row.id)}><strong>{chatTitle(row)}</strong><small>{row.turns === 0 ? "No messages sent" : `${row.turns} turns`} · {row.updated.slice(0, 10)}</small></button>
      {!row.trashed && !row.archived ? <ChatPinControls row={row} rows={state.data.sessions} locked={locked || safe.pending(row.id)} safe={safe} /> : null}
    </li>)}</ul>;
}

function useManagerOperations(state: ChatFirstState) {
  const hasActive = (ids: string[]) => ids.includes(state.convo.sessionId);
  const guard = async (operation: () => Promise<unknown>) => {
    if (state.convo.busy || state.pending || !state.ready) throw new Error("Stop the response before managing chats.");
    if (state.attachments.files.length || state.attachments.images.length) throw new Error("Send or remove attached context before managing chats. Your text draft is saved.");
    await state.convo.flushDraft();
    await operation();
  };
  return useSessionSafeOps({
    rename: (id, title) => guard(() => state.convo.renameSession(id, title, hasActive([id]))),
    archive: (id, value) => guard(() => state.convo.archiveSession(id, value, hasActive([id]))),
    archiveMany: (ids, value) => guard(() => state.convo.archiveSessions(ids, value, hasActive(ids))),
    remove: (id, action) => guard(() => state.convo.deleteSession(id, hasActive([id]), action)),
    removeMany: (ids, action) => guard(() => state.convo.deleteSessions(ids, hasActive(ids), action)),
    pin: (id, value) => guard(() => state.convo.pinSession(id, value)),
    reorderPins: (ids) => guard(() => state.convo.reorderPinnedSessions(ids)),
  });
}

function ChatPinControls(props: { row: Session; rows: Session[]; locked: boolean; safe: ReturnType<typeof useManagerOperations> }) {
  const pins = props.rows.filter((row) => row.pinned && !row.archived && !row.trashed).sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0));
  const index = pins.findIndex((row) => row.id === props.row.id);
  const move = (direction: "up" | "down") => props.safe.reorder(props.row, movePinnedSession(pins, props.row.id, direction === "up" ? -1 : 1), "Pinned order updated.");
  return <div className="chat-pin-controls"><button className="chat-icon" type="button" aria-label={`${props.row.pinned ? "Unpin" : "Pin"} ${chatTitle(props.row)}`} disabled={props.locked} onClick={() => void props.safe.pin(props.row, !props.row.pinned)}><Pin size={15} fill={props.row.pinned ? "currentColor" : "none"} /></button>
    {props.row.pinned ? <><button className="chat-icon" type="button" aria-label={`Move ${chatTitle(props.row)} up`} disabled={props.locked || index === 0} onClick={() => void move("up")}><ArrowUp size={14} /></button>
      <button className="chat-icon" type="button" aria-label={`Move ${chatTitle(props.row)} down`} disabled={props.locked || index === pins.length - 1} onClick={() => void move("down")}><ArrowDown size={14} /></button></> : null}</div>;
}
