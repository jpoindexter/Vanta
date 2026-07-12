import { FormEvent, useMemo, useState } from "react";
import { AppWindow, FileText, LayoutDashboard, TerminalSquare, X } from "lucide-react";
import { api } from "./api.js";
import { CanvasPanel } from "./canvas.js";
import type { CanvasArtifact, EventRow, RailTab, Status, Tool } from "./types.js";

export function RightRail(props: {
  status: Status | null;
  tools: Tool[];
  files: string[];
  events: EventRow[];
  canvas: CanvasArtifact | null;
  onRefresh: () => void;
  tab: RailTab;
  onTab: (tab: RailTab) => void;
  onInsertFile: (file: string) => void;
  onDismiss?: () => void;
}) {
  const groups = useMemo(() => groupTools(props.tools), [props.tools]);
  return (
    <aside className="right-rail">
      <div className="rail-tabs">
        {(["canvas", "preview", "files", "terminal"] as RailTab[]).map((tab) => <RailTabButton key={tab} tab={tab} active={props.tab === tab} onTab={props.onTab} />)}
      </div>
      <button className="panel-dismiss rail-dismiss" type="button" aria-label="Close inspector" onClick={props.onDismiss}><X size={16} /></button>
      {props.tab === "canvas" ? <CanvasPanel artifact={props.canvas} onRefresh={props.onRefresh} /> : null}
      {props.tab === "preview" ? <PreviewPanel status={props.status} groups={groups} events={props.events} /> : null}
      {props.tab === "files" ? <FilesPanel files={props.files} onInsert={props.onInsertFile} /> : null}
      {props.tab === "terminal" ? <TerminalPanel /> : null}
    </aside>
  );
}

function RailTabButton(props: { tab: RailTab; active: boolean; onTab: (tab: RailTab) => void }) {
  const icons = { canvas: LayoutDashboard, preview: AppWindow, files: FileText, terminal: TerminalSquare };
  const Icon = icons[props.tab];
  return <button className={props.active ? "active" : ""} type="button" title={props.tab} aria-label={`Open ${props.tab}`} onClick={() => props.onTab(props.tab)}><Icon size={16} /><span>{props.tab}</span></button>;
}

function PreviewPanel(props: { status: Status | null; groups: Record<string, Tool[]>; events: EventRow[] }) {
  const [url, setUrl] = useState("");
  const [frame, setFrame] = useState("");
  return (
    <section className="rail-panel">
      <h2>Safety Rail</h2>
      <p className="metric">Kernel {props.status?.kernel ?? "starting"}</p>
      <p className="muted">{props.status?.goals?.[0]?.text ?? "No active goal"}</p>
      <h2>Preview</h2>
      <form className="rail-form" onSubmit={(e) => { e.preventDefault(); setFrame(url); }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https:// or file path..." />
        <button type="submit">Open</button>
      </form>
      <iframe title="Preview" src={frame} />
      <h2>Activity</h2>
      <EventList events={props.events} />
      <h2>Tools</h2>
      <ToolGroups groups={props.groups} />
    </section>
  );
}

function EventList(props: { events: EventRow[] }) {
  return <ul className="event-list">{props.events.map((event, i) => <li key={i} className={event.ok === false ? "bad" : event.ok ? "ok" : ""}>{event.label}</li>)}</ul>;
}

function ToolGroups(props: { groups: Record<string, Tool[]> }) {
  return Object.entries(props.groups).slice(0, 5).map(([name, items]) => (
    <details key={name} open={name === "browser" || name === "read"}>
      <summary>{name} <span>{items.length}</span></summary>
      {items.slice(0, 4).map((tool) => <p key={tool.name} className="tool-row">{tool.name}</p>)}
    </details>
  ));
}

function FilesPanel(props: { files: string[]; onInsert: (file: string) => void }) {
  return (
    <section className="rail-panel files-panel">
      <h2>Project Files</h2>
      <div className="file-list">
        {props.files.slice(0, 220).map((file) => <button key={file} type="button" title={file} onClick={() => props.onInsert(file)}>{file}</button>)}
      </div>
    </section>
  );
}

export function TerminalPanel() {
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState("Commands are kernel-gated. Approval requests appear as modals.");
  async function run(event: FormEvent) {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    setOutput(`running: ${value}`);
    try {
      const result = await api<{ ok: boolean; output: string }>("/api/terminal", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command: value }),
      });
      setOutput(result.output);
    } catch (cause) { setOutput(cause instanceof Error ? cause.message : String(cause)); }
  }
  return (
    <section className="rail-panel">
      <h2>Terminal</h2>
      <form className="rail-form" onSubmit={run}>
        <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="pwd, git status, npm test..." />
        <button type="submit">Run</button>
      </form>
      <pre>{output}</pre>
    </section>
  );
}

function groupTools(tools: Tool[]) {
  return tools.reduce<Record<string, Tool[]>>((acc, tool) => {
    const key = tool.name.split("_")[0] ?? "tool";
    (acc[key] ??= []).push(tool);
    return acc;
  }, {});
}
