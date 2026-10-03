import { ArrowLeft, Maximize2, MessageSquare, MessageSquarePlus, Minimize2, PanelLeft, PanelRight } from "lucide-react";
import type { ChatFirstState } from "./chat-first-state.js";
import type { ChatFirstActions } from "./chat-first-actions.js";
import type { useDesktopSurface } from "./desktop-surface.js";
import { chatTitle } from "./chat-first-navigation.js";
import { ChatWindowOptions } from "./chat-window-options.js";
import { DocumentTabs } from "./chat-first-documents.js";

type Props = { state: ChatFirstState; actions: ChatFirstActions; surface: ReturnType<typeof useDesktopSurface> };

/** A single window bar. Tabs refer to real open documents, never placeholder UI. */
export function ChatTitlebar({ state, actions, surface }: Props) {
  const labels = { work: chatTitle({ title: state.convo.activeTitle }), operate: "Today", outputs: "Outputs", scheduled: "Schedules", connect: "Connections", plugins: "Skills & tools", history: "Library" };
  return <header className="chat-header chat-titlebar">
    <div className="chat-window-controls">
      <button className="chat-icon" type="button" aria-label={state.sidebar ? "Hide sidebar" : "Show sidebar"} aria-expanded={state.sidebar} onClick={() => state.setSidebar(!state.sidebar)}><PanelLeft size={16} /></button>
      <button className="chat-icon" type="button" aria-label="Start new chat" title="New chat (⌘ N)" disabled={state.convo.busy || state.pending || !state.ready} onClick={() => void actions.navigate()}><MessageSquarePlus size={16} /></button>
    </div>
    {state.view !== "work" ? <button className="chat-icon" type="button" aria-label="Back to chat" onClick={() => state.setView("work")}><ArrowLeft size={16} /></button> : null}
    <div className="chat-window-tabs" aria-label="Open workspace views">
      <button className="chat-window-tab" type="button" aria-pressed={state.view === "work"} onClick={() => state.setView("work")}>
        <MessageSquare size={15} aria-hidden="true" /><span className="chat-header-title">{labels[state.view]}</span>
      </button>
      {state.documents.paths.length ? <DocumentTabs documents={state.documents} onSelect={() => state.setInspector(true)} /> : null}
    </div>
    <ChatWindowOptions state={state} />
    <button className="chat-icon" type="button" aria-label="Toggle context" aria-expanded={state.inspector} onClick={() => state.setInspector(!state.inspector)}><PanelRight size={17} /></button>
    {surface.available ? <button className="chat-icon" type="button" onClick={surface.toggle} aria-label={surface.mode === "mini" ? "Expand Vanta" : "Mini Vanta"} title={surface.mode === "mini" ? "Return to full workspace" : "Keep this workspace in a small window"}>
      {surface.mode === "mini" ? <Maximize2 size={16} /> : <Minimize2 size={16} />}</button> : null}
  </header>;
}
