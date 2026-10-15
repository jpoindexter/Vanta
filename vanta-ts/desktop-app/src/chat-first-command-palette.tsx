import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import type { ChatFirstState } from "./chat-first-state.js";
import type { ChatFirstActions } from "./chat-first-actions.js";

type Props = { state: ChatFirstState; actions: ChatFirstActions };

export function ChatCommandPalette(props: Props) {
  return props.state.data.paletteOpen ? <OpenCommandPalette {...props} /> : null;
}

function OpenCommandPalette(props: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  useEffect(() => { document.getElementById(`chat-command-${selected}`)?.scrollIntoView({ block: "nearest" }); }, [selected, query]);
  const matches = (input: string) => chatCommands(props).filter(([label]) => label.toLocaleLowerCase().includes(input.trim().toLocaleLowerCase()));
  const commands = matches(query);
  const run = (index: number, input = query) => {
    const command = matches(input)[input === query ? index : 0];
    if (!command) return;
    props.state.data.closePalette(); command[1]();
  };
  return <div className="overlay" onClick={props.state.data.closePalette}>
    <section className="palette chat-command-palette" role="dialog" aria-modal="true" aria-labelledby="chat-command-title" onClick={(event) => event.stopPropagation()}>
      <header><h2 id="chat-command-title">Commands</h2><button className="chat-icon" type="button" aria-label="Close commands" onClick={props.state.data.closePalette}><X size={16} /></button></header>
      <label className="palette-search"><Search size={18} /><span className="sr-only">Search commands</span>
        <input autoFocus role="combobox" aria-expanded="true" aria-controls="chat-command-results" aria-autocomplete="list"
          aria-activedescendant={commands.length ? `chat-command-${selected}` : undefined}
          value={query} placeholder="Where do you want to go?" onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); run(selected, event.currentTarget.value); }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault(); const step = event.key === "ArrowDown" ? 1 : -1;
              setSelected((current) => (current + step + commands.length) % Math.max(1, commands.length));
            }
          }} /></label>
      <div id="chat-command-results" role="listbox" aria-label="Commands" className="chat-command-results">{commands.map(([label], index) =>
        <div key={label} role="option" id={`chat-command-${index}`} aria-selected={selected === index}
          onMouseEnter={() => setSelected(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => run(index)}>{label}<span aria-hidden="true">↵</span></div>)}</div>
      {!commands.length ? <p className="chat-panel-note" role="status">No matching commands. Try “model”, “library”, or “settings”.</p> : null}
    </section>
  </div>;
}

function chatCommands({ state, actions }: Props): [string, () => void][] {
  return [
    ["New chat", () => { void actions.navigate(); }], ["New project task", () => state.setTaskOpen(true)],
    ["Open Library", () => state.setView("history")], ["Open Today", () => state.setView("operate")],
    ["Open Outputs", () => state.setView("outputs")], ["Open Schedules", () => state.setView("scheduled")],
    ["Open Skills & tools", () => state.setView("plugins")], ["Open Connections", () => state.setView("connect")],
    ["Open Review", () => { state.setContextTab("review"); state.setInspector(true); }],
    ["Toggle sidebar", () => state.setSidebar(!state.sidebar)], ["Choose model", state.data.openModelPicker],
    ["Set up Telegram", () => { state.setConnectTarget({ key: Date.now(), section: "messaging", messagingId: "telegram" }); state.setView("connect"); }], ["Model setup", state.data.openSetup],
    ["Cycle operating mode", () => { void actions.cycleAccess(); }], ["Completion sound", state.data.openSoundSettings],
    ["Settings", state.data.openSettings], ["Keyboard shortcuts", state.data.openShortcuts],
  ];
}
