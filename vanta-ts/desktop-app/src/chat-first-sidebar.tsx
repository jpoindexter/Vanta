import { useMemo, useState } from "react";
import { Archive, Folder, MessageSquarePlus, Search } from "lucide-react";
import { ChatWorkspaceNavigation } from "./chat-workspace-navigation.js";
import { chatGroups } from "./chat-first-navigation.js";
import { ChatRow } from "./chat-first-row.js";
import { groupProjectChats } from "./chat-first-projects.js";
import type { ChatFirstState } from "./chat-first-state.js";
import type { ChatFirstActions } from "./chat-first-actions.js";

type Props = { state: ChatFirstState; actions: ChatFirstActions };

export function ChatFirstSidebar({ state, actions }: Props) {
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const locked = state.convo.busy || state.pending || !state.ready;
  return <aside className="chat-sidebar lc-sidebar" data-expanded={state.sidebar} aria-label="Chat navigation" id="chat-navigation">
    {state.sidebar ? <header><strong className="chat-wordmark">vanta<span aria-hidden="true">.</span></strong></header> : null}
    <div className="lc-sidebar-body">
    <ChatWorkspaceNavigation state={state} locked={locked} onNewChat={() => void actions.navigate()} />
    {state.sidebar ? <div className="lc-history-panel">
    <button className="chat-new" type="button" disabled={locked} onClick={() => void actions.navigate()}><MessageSquarePlus size={18} />New chat<kbd>⌘ N</kbd></button>
    <label className="chat-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search chats</span>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" /></label>
    <div className="chat-list-heading"><span>{archived ? "Archived chats" : "Your chats"}</span>
      <button className="chat-icon" type="button" aria-label={archived ? "Show recent chats" : "Show archived chats"} aria-pressed={archived} onClick={() => setArchived(!archived)}><Archive size={15} /></button></div>
    <ChatHistory state={state} actions={actions} locked={locked} query={query} archived={archived} />
    </div> : null}
    </div>
  </aside>;
}

function ChatHistory({ state, actions, locked, query, archived }: Props & { locked: boolean; query: string; archived: boolean }) {
  const groups = useMemo(() => chatGroups(state.data.sessions, query, archived), [state.data.sessions, query, archived]);
  const projects = groupProjectChats(groups.recent);
  return <div className="chat-session-list" role="region" aria-label="Chat history" tabIndex={0}>
      {groups.pinned.length ? <ChatGroup title="Pinned" sessions={groups.pinned} state={state} actions={actions} locked={locked} /> : null}
      {projects.general.length ? <ChatGroup title={archived ? "Archived" : "Recent"} sessions={projects.general} state={state} actions={actions} locked={locked} /> : null}
      {projects.projects.map((project) => <details className="chat-project-group" key={project.id} open>
        <summary title={project.id}><Folder size={16} aria-hidden="true" /><span>{project.id}</span><small>{project.sessions.length}</small></summary>
        <ChatGroup title={`Chats in ${project.id}`} sessions={project.sessions} state={state} actions={actions} locked={locked} />
      </details>)}
      {!groups.pinned.length && !groups.recent.length ? <p className="chat-list-empty">{emptyChatLabel(query, archived)}</p> : null}
    </div>;
}

function ChatGroup(props: Props & { title: string; sessions: ChatFirstState["data"]["sessions"]; locked: boolean }) {
  return <section className="chat-group" aria-label={props.title}><h2>{props.title}</h2><ul>{props.sessions.map((session) =>
    <ChatRow key={session.id} session={session} active={session.id === props.state.convo.sessionId && props.state.view === "work"}
      currentSession={session.id === props.state.convo.sessionId}
      locked={props.locked} onOpen={(id) => void props.actions.navigate(id)}
      onPin={(id, pinned) => void props.actions.pin(id, pinned)} onArchive={(id, archived) => void props.actions.archive(id, archived)} onRename={props.actions.rename} />)}</ul></section>;
}

function emptyChatLabel(query: string, archived: boolean) {
  if (query) return "No matching chats.";
  return archived ? "No archived chats." : "Your conversations will appear here.";
}
