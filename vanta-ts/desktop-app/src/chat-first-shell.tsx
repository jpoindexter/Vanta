import { useEffect } from "react";
import { X } from "lucide-react";
import { useChatFirstState, type ChatFirstState } from "./chat-first-state.js";
import { useChatFirstActions, type ChatFirstActions } from "./chat-first-actions.js";
import { ChatFirstSidebar } from "./chat-first-sidebar.js";
import { ChatFirstConversation } from "./chat-first-conversation.js";
import { ChatFirstWorkspace } from "./chat-first-workspaces.js";
import { ChatFirstOverlays } from "./chat-first-overlays.js";
import { ChatFirstInspector } from "./chat-first-inspector.js";
import { chatTitle } from "./chat-first-navigation.js";
import { ChatTitlebar } from "./chat-titlebar.js";
import { focusDesktopComposer, handleGlobalShortcut } from "./global-shortcuts.js";
import { useChatProjectTask } from "./chat-first-project-task.js";
import { useChatDialogs } from "./chat-first-dialogs.js";
import { ChatPaneResize } from "./chat-first-layout.js";
import { useDesktopSurface } from "./desktop-surface.js";
import { ChatDocumentLinks } from "./chat-first-document-links.js";

type Props = { state: ChatFirstState; actions: ChatFirstActions };

export function ChatFirstShell() {
  const state = useChatFirstState();
  const actions = useChatFirstActions(state);
  const surface = useDesktopSurface(state);
  useChatProjectTask(state, actions);
  useChatDialogs();
  useChatShortcuts({ state, actions });
  return <div className={`app-shell chat-first-shell theme-${state.theme}`} style={state.layout.style} data-surface={surface.mode} data-sidebar={state.sidebar} data-inspector={state.inspector}>
    <ChatTitlebar state={state} actions={actions} surface={surface} />
    <ChatFirstSidebar state={state} actions={actions} />
    {state.sidebar ? <ChatPaneResize pane="sidebar" value={state.layout.sidebar} onChange={state.layout.setWidth} /> : null}
    <div className="chat-main-column">
      <ActiveChatNavigation state={state} />
      <ChatStatus state={state} />
      <ChatDocumentLinks state={state} surface={surface}><main className="chat-main" id="chat-main">{state.view === "work" ? <ChatFirstConversation state={state} actions={actions} /> : <ChatFirstWorkspace state={state} actions={actions} />}</main></ChatDocumentLinks>
    </div>
    {state.inspector ? <><ChatPaneResize pane="context" value={state.layout.context} onChange={state.layout.setWidth} /><ChatFirstInspector state={state} /></> : null}
    <ChatFirstOverlays state={state} actions={actions} />
  </div>;
}

function ChatStatus({ state }: { state: ChatFirstState }) {
  const message = state.error || state.data.error;
  if (message) return <div className="chat-status-error" role="alert"><span>{message}</span>
    <button type="button" onClick={() => { state.setBootAttempt((value) => value + 1); void state.data.refresh(); }}>Retry connection</button>
    <button type="button" onClick={state.data.openSetup}>Model setup</button>
    {state.error ? <button className="chat-icon" type="button" aria-label="Dismiss message" onClick={() => state.setError("")}><X size={16} /></button> : null}</div>;
  if (!state.ready) return <p className="chat-loading" role="status">Connecting to your local Vanta…</p>;
  return null;
}

function ActiveChatNavigation({ state }: { state: ChatFirstState }) {
  if (state.view === "work" || !state.convo.busy) return null;
  return <div className="chat-active-run" role="status"><span>Response running in {chatTitle({ title: state.convo.activeTitle })}</span>
    <button type="button" onClick={() => state.setView("work")}>Return to running chat</button>
    <button type="button" onClick={() => void state.convo.stop()}>Stop response</button></div>;
}

function useChatShortcuts({ state, actions }: Props) {
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      document.documentElement.dataset.inputModality = "keyboard";
      if (event.key !== "Escape" && document.querySelector('.chat-first-shell [role="dialog"]')) return;
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault(); state.setTaskOpen(true); return;
      }
      handleGlobalShortcut(event, {
        openNewTask: () => void actions.navigate(), openPalette: state.data.openPalette,
        focusComposer: () => { state.setView("work"); requestAnimationFrame(() => focusDesktopComposer()); },
        openReview: () => state.setInspector(true), cycleAccessMode: () => void actions.cycleAccess(),
        openShortcuts: state.data.openShortcuts, closeOverlays: () => closeOverlays(state),
      });
    };
    const pointer = () => { document.documentElement.dataset.inputModality = "pointer"; };
    window.addEventListener("keydown", keyboard);
    window.addEventListener("pointerdown", pointer);
    return () => { window.removeEventListener("keydown", keyboard); window.removeEventListener("pointerdown", pointer); };
  }, [state, actions]);
}

function closeOverlays(state: ChatFirstState) {
  state.data.closePalette(); state.data.closeModelPicker(); state.data.closeSoundSettings();
  state.data.closeSettings(); state.data.closeShortcuts(); state.data.closeSetup();
  state.setTaskOpen(false); state.setInspector(false);
}
