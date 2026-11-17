import { MessageSquare, Moon, Plug, Settings2, Sun, Activity } from "lucide-react";
import { SidebarRail } from "./librechat/sidebar-rail.js";
import { ChatToolsNavigation } from "./chat-first-tools-navigation.js";
import type { ChatFirstState } from "./chat-first-state.js";

type Props = { state: ChatFirstState };

/** The reused rail issues host commands only; the same conversation stays alive. */
export function ChatWorkspaceNavigation({ state }: Props) {
  const locked = state.convo.busy || state.pending || !state.ready;
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
