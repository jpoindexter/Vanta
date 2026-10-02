import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { CalendarClock, ChevronDown, Folder, History, LayoutList, Plug, Wrench } from "lucide-react";
import type { ChatFirstState } from "./chat-first-state.js";

const destinations = [
  { id: "operate", label: "Today", icon: LayoutList },
  { id: "outputs", label: "Outputs", icon: Folder },
  { id: "history", label: "Library", icon: History },
  { id: "scheduled", label: "Schedules", icon: CalendarClock },
  { id: "plugins", label: "Skills & tools", icon: Wrench },
  { id: "connect", label: "Connections", icon: Plug },
] as const;

type Props = { view: ChatFirstState["view"]; onNavigate: (view: ChatFirstState["view"]) => void; children?: (close: () => void) => ReactNode };

/** Utilities stay discoverable without displacing conversation history. */
export function ChatToolsNavigation({ view, onNavigate, children }: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = destinations.find((destination) => destination.id === view);
  return <div className="chat-tools-navigation" onKeyDown={(event) => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
  }}>
    <button ref={trigger} className="chat-tools-toggle" type="button" aria-expanded={open}
      aria-controls="chat-feature-destinations" onClick={() => setOpen(!open)}>
      <Wrench size={16} aria-hidden="true" /><span>Tools & activity</span><ChevronDown size={14} aria-hidden="true" />
    </button>
    {current && !open ? <span className="chat-tools-current">Viewing {current.label}</span> : null}
    <nav id="chat-feature-destinations" aria-label="Vanta features" className="chat-feature-nav" hidden={!open}>
      {destinations.map(({ id, label, icon: Icon }) => <button key={id} type="button"
        aria-current={view === id ? "page" : undefined} onClick={() => { onNavigate(id); setOpen(false); }}>
        <Icon size={16} aria-hidden="true" />{label}
      </button>)}
      {children?.(() => setOpen(false))}
    </nav>
  </div>;
}
