import { useEffect } from "react";
import { comparableProjectPath,createTask,type ClassicActions } from "./classic-shell-actions.js";
import { clamp,MAX_SIDEBAR_WIDTH,MIN_SIDEBAR_WIDTH,MIN_WORK_WIDTH,type ClassicState } from "./classic-shell-state.js";
import { focusDesktopComposer,handleGlobalShortcut } from "./global-shortcuts.js";
import { acknowledgePendingDesktopProjectTask,readPendingDesktopProjectTask,type PendingDesktopProjectTask } from "./project-folder-picker.js";

export function useClassicEffects(state: ClassicState, actions: ClassicActions) {
  useInputModality();
  useClassicPaneConstraints(state, actions);
  useClassicBoot(state, actions);
  usePendingClassicTask(state, actions);
  useClassicShortcuts(state, actions);
}

function useClassicPaneConstraints(state: ClassicState, actions: ClassicActions) {
  const { mobilePanel, setInspectorOpen, setSidebarWidth, preferredSidebarWidth } = state;
  const { openNewTask, cycleAccessMode } = actions;
  useEffect(() => {
    function constrainPanes() {
      if (window.innerWidth <= 760 && mobilePanel !== "inspect") setInspectorOpen(false);
      const nextSidebar = clamp(preferredSidebarWidth.current, MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth - MIN_WORK_WIDTH));
      setSidebarWidth((current) => current === nextSidebar ? current : nextSidebar);
    }
    constrainPanes();
    window.addEventListener("resize", constrainPanes);
    return () => window.removeEventListener("resize", constrainPanes);
  }, [mobilePanel]);

}

function useClassicBoot(state: ClassicState, actions: ClassicActions) {
  const { data, convo, setConversationReady, bootSession } = state;
  const { openNewTask, cycleAccessMode } = actions;
  useEffect(() => {
    if (data.phase !== "ready") {
      setConversationReady(false);
      return;
    }
    if (bootSession.current) return;
    const id = data.sessions.find((session) => session.id === data.status?.sessionId)?.id ?? data.sessions.find((session) => !session.archived)?.id;
    if (!id) {
      setConversationReady(true);
      return;
    }
    bootSession.current = id;
    void convo.openSession(id)
      .catch(() => { bootSession.current = ""; })
      .finally(() => setConversationReady(true));
  }, [convo.openSession, data.phase, data.sessions, data.status?.sessionId]);

}

function usePendingClassicTask(state: ClassicState, actions: ClassicActions) {
  const { data, convo, setView, setNewTaskOpen, setProjectTaskRecovery, conversationReady, pendingProjectTaskAttempted } = state;
  const { openNewTask, cycleAccessMode } = actions;
  useEffect(() => {
    if (!conversationReady || pendingProjectTaskAttempted.current) return;
    pendingProjectTaskAttempted.current = true;
    void (async () => {
      const pending = await readPendingDesktopProjectTask();
      if (!pending) return;
      if (comparableProjectPath(pending.targetRoot) !== comparableProjectPath(data.status?.root)) {
        throw Object.assign(new Error("The retained task does not match the active project."), { pending });
      }
      try {
        await createTask(pending.draft, convo, () => { setNewTaskOpen(false); setView("work"); });
        await acknowledgePendingDesktopProjectTask(pending.id);
      } catch (error) {
        setProjectTaskRecovery({ ...pending, error: error instanceof Error ? error.message : "Vanta could not restore the task after switching projects." });
        setNewTaskOpen(true);
      }
    })().catch((error) => {
      const pending = (error as Error & { pending?: PendingDesktopProjectTask }).pending;
      if (pending) setProjectTaskRecovery({ ...pending, error: error instanceof Error ? error.message : "Vanta could not restore the task after switching projects." });
      setNewTaskOpen(Boolean(pending));
    });
  }, [conversationReady, convo, data.status?.root]);

}

function useClassicShortcuts(state: ClassicState, actions: ClassicActions) {
  const { data, convo, setMobilePanel, setInspectorOpen } = state;
  const { openNewTask, cycleAccessMode } = actions;
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      handleGlobalShortcut(event, {
        focusComposer: focusDesktopComposer,
        openPalette: data.openPalette,
        openNewTask,
        openReview: () => { data.setTab("files"); setInspectorOpen(true); setMobilePanel("inspect"); },
        cycleAccessMode,
        openShortcuts: data.openShortcuts,
        closeOverlays: () => { data.closePalette(); data.closeModelPicker(); data.closeSoundSettings(); data.closeSettings(); data.closeShortcuts(); setInspectorOpen(false); setMobilePanel("work"); },
      });
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [convo.newSession, data]);

}

function useInputModality(): void {
  useEffect(() => {
    const root = document.documentElement;
    const setModality = (modality: "keyboard" | "pointer") => {
      root.dataset.inputModality = modality;
      root.classList.toggle("keyboard-modality", modality === "keyboard");
      root.classList.toggle("pointer-modality", modality === "pointer");
    };
    setModality("pointer");
    const keyboard = () => setModality("keyboard");
    const pointer = () => setModality("pointer");
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("mousedown", pointer, true);
    window.addEventListener("touchstart", pointer, true);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("mousedown", pointer, true);
      window.removeEventListener("touchstart", pointer, true);
    };
  }, []);
}
