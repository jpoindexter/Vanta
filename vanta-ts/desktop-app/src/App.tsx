import type { CSSProperties } from "react";
import { classicShellActions } from "./classic-shell-actions.js";
import { ClassicDialogs } from "./classic-shell-dialogs.js";
import { useClassicEffects } from "./classic-shell-effects.js";
import { ClassicNavigation } from "./classic-shell-navigation.js";
import { classicShellPresentation,useClassicState } from "./classic-shell-state.js";
import { ClassicReview,ClassicWorkbench } from "./classic-shell-workbench.js";
import { QueuedTurnDrawer } from "./queued-turns.js";

/** Retained Classic surface; the normal entry point remains chat-first. */
export function AppShell() {
  const state = useClassicState();
  const actions = classicShellActions(state);
  useClassicEffects(state, actions);
  const { theme, mobilePanel, sidebarCollapsed, sidebarWidth, data, queueOpen, queued, setQueueOpen } = state;
  const { inspectorVisible } = classicShellPresentation(state);

  return (
    <div
      className={`app-shell theme-${theme} panel-${mobilePanel} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${inspectorVisible ? "inspector-open" : ""} ${data.tab === "canvas" && inspectorVisible ? "canvas-open" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <ClassicNavigation state={state} actions={actions} />
      <ClassicWorkbench state={state} actions={actions} />
      <QueuedTurnDrawer open={queueOpen} items={queued.snapshot.items} error={queued.error} onClose={() => setQueueOpen(false)} onAction={queued.mutate} />
      <ClassicReview state={state} actions={actions} />
      <ClassicDialogs state={state} actions={actions} />
    </div>
  );
}
