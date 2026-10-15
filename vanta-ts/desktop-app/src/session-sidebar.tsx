import { Activity,Archive,ArchiveRestore,CalendarClock,Check,ChevronDown,Keyboard,LoaderCircle,PackageOpen,Plug,Plus,Search,Settings2,Trash2,X } from "lucide-react";
import { RunLibraryPanel } from "./run-library.js";
import { SessionButton } from "./session-button.js";
import { movePinnedSession } from "./session-pinning.js";
import { SessionNoticeToast } from "./session-safe-ops.js";
import { useSessionSidebar } from "./session-sidebar-state.js";
import type { SessionSidebarProps } from "./session-sidebar-types.js";
import type { Session } from "./types.js";

type SidebarState = ReturnType<typeof useSessionSidebar>;
type ViewProps = { props: SessionSidebarProps; state: SidebarState };

export function SessionSidebar(props: SessionSidebarProps) {
  const state = useSessionSidebar(props);
  return <aside className="session-sidebar">
    <SidebarNavigation props={props} state={state} />
    {state.section === "runs" && props.runLibrary && props.onRunPrepared
      ? <RunLibraryPanel controller={props.runLibrary} onPrepared={props.onRunPrepared} />
      : <SidebarHistory props={props} state={state} />}
      <footer className="session-sidebar-footer">
        <button className="persona-profile" type="button" onClick={props.onSettings} aria-label="Open personal persona settings">
          <span className="persona-avatar" aria-hidden="true">V</span>
          <span><strong>Personal</strong><small>Persona · Settings</small></span>
          <Settings2 size={15} aria-hidden="true" />
        </button>
        <button className="sidebar-shortcuts" type="button" onClick={props.onShortcuts} aria-label="Keyboard shortcuts"><Keyboard size={14} /><kbd>?</kbd></button>
      </footer>
    <SessionNoticeToast notice={state.safe.notice} onDismiss={state.safe.dismissNotice} />
  </aside>;
}

function SidebarNavigation({ props, state }: ViewProps) {
  const { section, setSection, searchRef } = state;
  return <>
      <div className="drawer-toolbar"><span>{section === "threads" ? "Threads" : "Saved runs"}</span><button className="panel-dismiss" type="button" aria-label="Close sessions" onClick={props.onDismiss}><X size={16} /></button></div>
      <div className="sidebar-product">
        <button className="product-switcher" type="button" onClick={() => { setSection("threads"); props.onView("work"); }}>
          <span className="product-mark" aria-hidden="true">V</span><strong>Vanta</strong><ChevronDown size={13} aria-hidden="true" />
        </button>
        <button className="sidebar-search-trigger" type="button" aria-label="Search tasks" title="Search tasks" onClick={() => { setSection("threads"); window.requestAnimationFrame(() => searchRef.current?.focus()); }}><Search size={15} /></button>
      </div>
      <button className="sidebar-new-task" type="button" onClick={props.onNew}><Plus size={15} />New task</button>
      <nav className="desktop-nav" aria-label="Vanta workspace">
        <button className={props.view === "operate" ? "active" : ""} type="button" onClick={() => props.onView("operate")}><Activity size={16} />Today</button>
        <button className={props.view === "connect" ? "active" : ""} type="button" onClick={() => props.onView("connect")}><Plug size={16} />Connect</button>
        <button className={props.view === "scheduled" ? "active" : ""} type="button" onClick={() => props.onView("scheduled")}><CalendarClock size={16} />Scheduled</button>
        <button className={props.view === "plugins" ? "active" : ""} type="button" onClick={() => props.onView("plugins")}><PackageOpen size={16} />Plugins</button>
      </nav>
      {props.runLibrary ? <div className="library-switch segmented" aria-label="Task history view"><button className={section === "threads" ? "active" : ""} type="button" onClick={() => setSection("threads")}>Tasks</button><button className={section === "runs" ? "active" : ""} type="button" onClick={() => setSection("runs")}>Saved runs</button></div> : null}
  </>;
}

function SidebarHistory({ props, state }: ViewProps) {
  const { query, setQuery, archivedOpen, setArchivedOpen, trashOpen, setTrashOpen, searchRef, projectName,
    selecting, selected, visibleSessions, bulkProgress, startSelecting, stopSelecting, clearSelected, selectAllVisible, archiveSelected, deleteSelected } = state;
  const { active, pinned, project: projectSessions, recent: recentSessions, archived, trashed } = state.groups;
  const renderSession = (session: Session) => <SidebarSession key={session.id} session={session} props={props} state={state} />;
  return (
<section className="project-rail">
        <div className="section-heading project-heading"><h2>{projectName}</h2><span>{active.length}</span></div>
        {pinned.length ? <>
          <div className="section-heading pinned-heading"><h2>Pinned</h2><span>{pinned.length}</span></div>
          <div className="session-list pinned-session-group">{pinned.map(renderSession)}</div>
        </> : null}
        <div className="session-list project-session-group">
          {projectSessions.map(renderSession)}
        </div>
        <div className="section-heading recent-heading">
          <h2>Tasks</h2>
          <div><span>{recentSessions.length}</span><button type="button" onClick={selecting ? stopSelecting : startSelecting}>{selecting ? "Cancel" : "Select chats"}</button></div>
        </div>
        <label className="session-search"><Search size={14} /><span className="sr-only">Search tasks</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></label>
        {selecting ? <BulkSessionActions count={selected.size} visibleCount={visibleSessions.length} progress={bulkProgress} onSelectAll={selectAllVisible} onClear={clearSelected} onArchive={() => void archiveSelected(true)} onRestore={() => void archiveSelected(false)} onDelete={() => void deleteSelected()} onCancel={stopSelecting} /> : null}
        <div className="session-list recent-session-group">
          {recentSessions.map(renderSession)}
          {archived.length > 0 ? (
            <details className="archived-sessions" open={archivedOpen} onToggle={(event) => setArchivedOpen(event.currentTarget.open)}>
              <summary>Archived <span>{archived.length}</span></summary>
              <div>{archived.map(renderSession)}</div>
            </details>
          ) : null}
          {trashed.length > 0 ? (
            <details className="trashed-sessions" open={trashOpen} onToggle={(event) => setTrashOpen(event.currentTarget.open)}>
              <summary>Trash <span>{trashed.length}</span></summary>
              <div>{trashed.map(renderSession)}</div>
            </details>
          ) : null}
          {hasNoSessions(state) ? <p className="muted">{query ? "No matching sessions." : "No saved sessions yet."}</p> : null}
        </div>
      </section>
  );
}

function SidebarSession({ session, props, state }: ViewProps & { session: Session }) {
  const { safe, selecting, selected, toggleSelected } = state;
  const { pinned } = state.groups;
    const pinnedIndex = pinned.findIndex(({ id }) => id === session.id);
    return (
    <SessionButton
      key={session.id}
      session={session}
      active={session.id === props.activeId}
      selecting={selecting}
      selected={selected.has(session.id)}
      pending={safe.pending(session.id)}
      onSelect={toggleSelected}
      onOpen={props.onOpen}
      onRename={(title) => safe.rename(session, title)}
      onArchive={(archivedState) => safe.archive([session], archivedState)}
      onDelete={(action) => safe.remove([session], action)}
      onPin={(pinnedState) => safe.pin(session, pinnedState)}
      onMove={pinnedIndex < 0 ? undefined : async (delta) => safe.reorder(session, movePinnedSession(pinned, session.id, delta), `Moved “${session.title}” ${delta < 0 ? "up" : "down"}.`)}
      canMoveUp={pinnedIndex > 0}
      canMoveDown={pinnedIndex >= 0 && pinnedIndex < pinned.length - 1}
    />
    );

}

function hasNoSessions(state: SidebarState) {
  const { recent, project, pinned } = state.groups;
  return recent.length === 0 && project.length === 0 && pinned.length === 0;
}

function BulkSessionActions(props: { count: number; visibleCount: number; progress: string; onSelectAll: () => void; onClear: () => void; onArchive: () => void; onRestore: () => void; onDelete: () => void; onCancel: () => void }) {
  const busy = Boolean(props.progress);
  const disabled = props.count === 0 || busy;
  return (
    <div className="session-bulk-actions" role="toolbar" aria-label="Selected session actions" aria-busy={busy}>
      <span>{props.count ? `${props.count} selected` : "Select chats"} <small role="status" aria-live="polite">{busy ? <><LoaderCircle className="spinning" size={12} aria-hidden="true" />{props.progress}</> : "Shift-click for a range"}</small></span>
      <button type="button" disabled={props.visibleCount === 0 || busy} onClick={props.onSelectAll}><Check size={13} />All visible</button>
      <button type="button" disabled={disabled} onClick={props.onClear}><X size={13} />Clear</button>
      <button type="button" disabled={disabled} onClick={props.onArchive}><Archive size={13} />Archive</button>
      <button type="button" disabled={disabled} onClick={props.onRestore}><ArchiveRestore size={13} />Restore</button>
      <button className="danger" type="button" disabled={disabled} onClick={props.onDelete}><Trash2 size={13} />Delete</button>
      <button type="button" disabled={busy} onClick={props.onCancel}><X size={13} />Done</button>
    </div>
  );
}
