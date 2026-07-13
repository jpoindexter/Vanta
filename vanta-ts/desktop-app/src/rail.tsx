import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AppWindow, ChevronLeft, ExternalLink, FileText, Image, Link2, X } from "lucide-react";
import { api } from "./api.js";
import { CanvasPanel } from "./canvas.js";
import type { Artifact, CanvasArtifact, EventRow, RailTab, Status, Tool } from "./types.js";

export function RightRail(props: {
  status: Status | null;
  tools: Tool[];
  files: string[];
  artifacts: Artifact[];
  events: EventRow[];
  canvas: CanvasArtifact | null;
  onRefresh: () => void;
  tab: RailTab;
  onTab: (tab: RailTab) => void;
  onInsertFile: (file: string) => void;
  onOpenOutputs: () => void;
  onOpenSession: (id: string) => void;
  onDismiss?: () => void;
}) {
  const groups = useMemo(() => groupTools(props.tools), [props.tools]);
  const title = railTitle(props.tab);
  return (
    <aside className="right-rail">
      <header className="rail-heading"><div><p className="eyebrow">Workspace</p><h2>{title}</h2></div>{props.tab === "outputs" ? <button className="icon-button" type="button" title="Open all outputs" aria-label="Open all outputs" onClick={props.onOpenOutputs}><ExternalLink size={16} /></button> : <button className="icon-button" type="button" title="Back to outputs" aria-label="Back to outputs" onClick={() => props.onTab("outputs")}><ChevronLeft size={16} /></button>}</header>
      <button className="panel-dismiss rail-dismiss" type="button" aria-label="Close inspector" onClick={props.onDismiss}><X size={16} /></button>
      {props.tab === "outputs" ? <OutputsPanel artifacts={props.artifacts} events={props.events} onOpenSession={props.onOpenSession} onOpenOutputs={props.onOpenOutputs} /> : null}
      {props.tab === "canvas" ? <CanvasPanel artifact={props.canvas} onRefresh={props.onRefresh} /> : null}
      {props.tab === "preview" ? <PreviewPanel status={props.status} groups={groups} events={props.events} /> : null}
      {props.tab === "files" ? <FilesPanel files={props.files} onInsert={props.onInsertFile} /> : null}
      {props.tab === "terminal" ? <TerminalPanel /> : null}
    </aside>
  );
}

function railTitle(tab: RailTab): string {
  return tab === "outputs" ? "Outputs" : tab === "canvas" ? "Canvas" : tab === "preview" ? "Preview" : tab === "files" ? "Project files" : "Terminal";
}

function OutputsPanel(props: { artifacts: Artifact[]; events: EventRow[]; onOpenSession: (id: string) => void; onOpenOutputs: () => void }) {
  const visible = props.artifacts.slice(0, 7);
  return <section className="rail-panel outputs-panel">
    {visible.length ? <div className="output-list">{visible.map((artifact) => <OutputRow key={artifact.id} artifact={artifact} onOpenSession={props.onOpenSession} />)}</div> : <div className="rail-empty"><FileText size={18} /><p>Files, previews, links, and receipts from completed work appear here.</p></div>}
    {props.artifacts.length > visible.length ? <button className="rail-link" type="button" onClick={props.onOpenOutputs}>Show {props.artifacts.length - visible.length} more</button> : null}
    <section className="rail-section"><h3>Activity</h3><EventList events={props.events} /></section>
    <section className="rail-section"><h3>Workspace tools</h3><p>Use the command palette for Canvas, Preview, or Terminal. Attach files directly from the composer.</p></section>
  </section>;
}

function OutputRow(props: { artifact: Artifact; onOpenSession: (id: string) => void }) {
  const Icon = props.artifact.kind === "canvas" ? Image : props.artifact.kind === "link" ? Link2 : FileText;
  const content = <><Icon size={16} /><span>{props.artifact.label}</span></>;
  if (props.artifact.kind === "link") return <a className="output-row" href={props.artifact.value} target="_blank" rel="noreferrer">{content}<ExternalLink size={14} /></a>;
  if (props.artifact.sessionId) return <button className="output-row" type="button" onClick={() => props.onOpenSession(props.artifact.sessionId!)}>{content}</button>;
  return <div className="output-row">{content}</div>;
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
