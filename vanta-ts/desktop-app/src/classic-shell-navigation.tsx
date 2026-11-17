import { SessionSidebar } from "./chat.js";
import { viewLabel } from "./classic-operator-workspace.js";
import type { ClassicActions } from "./classic-shell-actions.js";
import { DesktopHeader,PaneResizeHandle } from "./classic-shell-chrome.js";
import { classicShellPresentation,MIN_SIDEBAR_WIDTH,type ClassicState } from "./classic-shell-state.js";

type ViewProps = { state: ClassicState; actions: ClassicActions };

export function ClassicNavigation(props: ViewProps) {
  const { sidebarWidth, changeSidebarWidth } = props.state;
  const { sidebarMaximum } = classicShellPresentation(props.state);
  return <><ClassicHeader {...props} /><ClassicSidebar {...props} />
      <PaneResizeHandle
        className="sidebar-resize-handle"
        label="Resize sessions"
        value={sidebarWidth}
        minimum={MIN_SIDEBAR_WIDTH}
        maximum={sidebarMaximum}
        direction="right"
        onChange={changeSidebarWidth}
      />
  </>;
}

function ClassicHeader({ state, actions }: ViewProps) {
  const { data, convo, setQueueOpen, queued, setMobilePanel, sidebarCollapsed, setSidebarCollapsed, view, inspectorOpen, setInspectorOpen } = state;
  const { openNewTask } = actions;
  const { reviewCount } = classicShellPresentation(state);
  return (
      <DesktopHeader
        title={view === "work" ? convo.activeTitle : viewLabel(view)}
        reviewCount={reviewCount}
        queueCount={queued.snapshot.items.length}
        inspectorOpen={inspectorOpen}
        sidebarCollapsed={sidebarCollapsed}
        onNew={openNewTask}
        onSidebar={() => {
          if (window.innerWidth <= 760) setMobilePanel((panel) => panel === "sessions" ? "work" : "sessions");
          else setSidebarCollapsed((collapsed) => !collapsed);
        }}
        onQueue={() => setQueueOpen(true)}
        onCommand={data.openPalette}
        onInspector={() => { if (!inspectorOpen) data.setTab("files"); setInspectorOpen((open) => !open); setMobilePanel(inspectorOpen ? "work" : "inspect"); }}
      />
  );
}

function ClassicSidebar({ state, actions }: ViewProps) {
  const { data, convo, setMobilePanel, view, runLibrary } = state;
  const { openView, openNewTask } = actions;
  const { inspectorVisible, sidebarMaximum, mentionedFiles, reviewCount } = classicShellPresentation(state);
  return (
      <SessionSidebar
        sessions={data.sessions}
        root={data.status?.root}
        activeId={data.status?.sessionId}
        onNew={openNewTask}
        onOpen={(id) => { openView("work"); void convo.openSession(id); }}
        onRename={(id, title) => convo.renameSession(id, title, id === data.status?.sessionId)}
        onArchive={(id, archived) => convo.archiveSession(id, archived, id === data.status?.sessionId)}
        onDelete={(id, action) => convo.deleteSession(id, id === data.status?.sessionId, action)}
        onBulkArchive={(ids, archived) => convo.archiveSessions(ids, archived, !!data.status?.sessionId && ids.includes(data.status.sessionId))}
        onBulkDelete={(ids, action) => convo.deleteSessions(ids, !!data.status?.sessionId && ids.includes(data.status.sessionId), action)}
        onPin={convo.pinSession}
        onReorderPins={convo.reorderPinnedSessions}
        view={view}
        onView={openView}
        onSettings={data.openSettings}
        onShortcuts={data.openShortcuts}
        onDismiss={() => setMobilePanel("work")}
        runLibrary={runLibrary}
        onRunPrepared={actions.runPrepared}
      />
  );
}
