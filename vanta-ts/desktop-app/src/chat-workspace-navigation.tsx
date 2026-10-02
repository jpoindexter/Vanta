import { MessageSquare, MessageSquarePlus, Moon, PanelLeft, Plug, Settings2, Sun, Activity } from "lucide-react";
import { SidebarRail } from "./librechat/sidebar-rail.js";
import { ChatToolsNavigation } from "./chat-first-tools-navigation.js";
import type { ChatFirstState } from "./chat-first-state.js";

type Props = { state: ChatFirstState; locked: boolean; onNewChat: () => void };

/** The reused rail issues host commands only; the same conversation stays alive. */
export function ChatWorkspaceNavigation({ state, locked, onNewChat }: Props) {
  const open = (view: ChatFirstState["view"]) => {
    state.setView(view);
    if (window.innerWidth < 760) state.setSidebar(false);
  };
  const items = ([
    { id: "work", label: "Chats", icon: MessageSquare },
    { id: "operate", label: "Activity", icon: Activity },
    { id: "connect", label: "Connections", icon: Plug },
  ] as const).map((item) => ({ ...item, active: state.view === item.id,
    onSelect: () => open(item.id) }));
  return <SidebarRail items={items}
    header={<><button className="lc-rail-control" type="button" onClick={() => state.setSidebar(!state.sidebar)}
      aria-label={state.sidebar ? "Hide sidebar" : "Show sidebar"} aria-expanded={state.sidebar}
      title={state.sidebar ? "Hide chat history" : "Show chat history"}><PanelLeft size={19} aria-hidden="true" /></button>
      {!state.sidebar ? <button className="lc-rail-control" type="button" disabled={locked} onClick={onNewChat}
        aria-label="New chat" title="New chat" aria-keyshortcuts="Meta+N Control+N"><MessageSquarePlus size={19} aria-hidden="true" /></button> : null}</>}
    extra={<ChatToolsNavigation view={state.view} onNavigate={open}>
      {(close) => <button type="button" disabled={locked} onClick={() => { close(); state.setTaskOpen(true); }}>New project task</button>}
    </ChatToolsNavigation>}
    footer={<>
      <button className="lc-rail-control" type="button" onClick={state.data.openSettings} aria-label="Settings" title="Settings"><Settings2 size={19} aria-hidden="true" /></button>
      <button className="lc-rail-control" type="button" onClick={() => state.setTheme(state.theme === "light" ? "dark" : "light")}
        aria-label={`Switch to ${state.theme === "light" ? "dark" : "light"} mode`} title={state.theme === "light" ? "Light appearance" : "Dark appearance"}>
        {state.theme === "light" ? <Moon size={19} aria-hidden="true" /> : <Sun size={19} aria-hidden="true" />}
      </button>
    </>} />;
}
