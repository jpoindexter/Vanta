import type { ClassicActions } from "./classic-shell-actions.js";
import { DesktopOverlays } from "./classic-shell-overlays.js";
import { classicShellPresentation,type ClassicState } from "./classic-shell-state.js";
import { NewTaskDialog } from "./overlays.js";

type ViewProps = { state: ClassicState; actions: ClassicActions };

export function ClassicDialogs({ state, actions }: ViewProps) {
  const { data, sound, convo, accessWarning, setMobilePanel, setSidebarCollapsed, setInspectorOpen, theme, setTheme, newTaskOpen, setNewTaskOpen, projectTaskRecovery } = state;
  const { openView, openNewTask, createNewTask, openTelegramSetup, cycleAccessMode } = actions;
  const { inspectorVisible, sidebarMaximum, mentionedFiles, reviewCount } = classicShellPresentation(state);
  const changeTheme = setTheme;
  return <>
      <NewTaskDialog open={newTaskOpen} root={data.status?.root} model={data.status?.model} initialDraft={projectTaskRecovery?.draft} initialError={projectTaskRecovery?.error} onClose={() => setNewTaskOpen(false)} onCreate={createNewTask} />
      <DesktopOverlays
        data={data}
        sound={sound}
        convo={convo}
        theme={theme}
        accessWarning={accessWarning}
        onTheme={changeTheme}
        onNew={openNewTask}
        onTelegram={openTelegramSetup}
        onReview={() => { data.setTab("files"); setInspectorOpen(true); setMobilePanel("inspect"); }}
        onSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onCycleMode={cycleAccessMode}
        onView={openView}
      />
  </>;
}
