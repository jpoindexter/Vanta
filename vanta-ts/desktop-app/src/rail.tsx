import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Activity, AppWindow, Check, ExternalLink, FileDiff, FileText, Image, Link2, ReceiptText, TerminalSquare, X } from "lucide-react";
import { api } from "./api.js";
import { CanvasPanel } from "./canvas.js";
import type { Artifact, CanvasArtifact, EventRow, RailTab, Status, Tool } from "./types.js";
import { fallbackProjectFileContext, groupProjectFiles, type ProjectFileContext } from "./file-context.js";

export function RightRail(props: {
  status: Status | null;
  tools: Tool[];
  files: string[];
  mentionedFiles: string[];
  selectedFiles: string[];
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
  const visibleTab = visibleRailTab(props.tab);
  return (
    <aside className="right-rail">
      <nav className="inspector-tabs" role="tablist" aria-label="Inspector tools">
        <InspectorTab tab="activity" current={visibleTab} icon={Activity} onTab={props.onTab}>Activity</InspectorTab>
        <InspectorTab tab="files" current={visibleTab} icon={FileText} onTab={props.onTab}>Files</InspectorTab>
        <InspectorTab tab="diff" current={visibleTab} icon={FileDiff} onTab={props.onTab}>Diff</InspectorTab>
        <InspectorTab tab="preview" current={visibleTab} icon={AppWindow} onTab={props.onTab}>Preview</InspectorTab>
        <InspectorTab tab="receipts" current={visibleTab} icon={ReceiptText} onTab={props.onTab}>Receipts</InspectorTab>
        <InspectorTab tab="terminal" current={visibleTab} icon={TerminalSquare} onTab={props.onTab}>Terminal</InspectorTab>
        <button className="panel-dismiss inspector-dismiss" type="button" aria-label="Close inspector" onClick={props.onDismiss}><X size={15} /></button>
      </nav>
      {visibleTab === "activity" ? <ActivityPanel events={props.events} status={props.status} /> : null}
      {visibleTab === "preview" ? (props.tab === "canvas" ? <CanvasPanel artifact={props.canvas} onRefresh={props.onRefresh} /> : <PreviewPanel status={props.status} groups={groups} events={props.events} />) : null}
      {visibleTab === "files" ? <FilesPanel files={props.files} mentioned={props.mentionedFiles} selected={props.selectedFiles} onInsert={props.onInsertFile} /> : null}
      {visibleTab === "diff" ? <DiffPanel /> : null}
      {visibleTab === "receipts" ? <ReceiptsPanel artifacts={props.artifacts} events={props.events} onOpenSession={props.onOpenSession} /> : null}
      {visibleTab === "terminal" ? <TerminalPanel /> : null}
    </aside>
  );
}

function visibleRailTab(tab: RailTab): RailTab {
  if (tab === "outputs") return "receipts";
  if (tab === "canvas") return "preview";
  return tab;
}

function InspectorTab(props: { tab: RailTab; current: RailTab; icon: typeof Activity; onTab: (tab: RailTab) => void; children: string }) {
  const Icon = props.icon;
  return <button role="tab" aria-selected={props.current === props.tab} className={props.current === props.tab ? "active" : ""} type="button" onClick={() => props.onTab(props.tab)}><Icon size={14} /><span>{props.children}</span></button>;
}

function ActivityPanel(props: { events: EventRow[]; status: Status | null }) {
  return <section className="rail-panel activity-panel"><div className="inspector-summary"><span><i className="status-dot online" />Kernel {props.status?.kernel ?? "starting"}</span><strong>{props.events.length} events</strong></div><EventList events={props.events} /><section className="rail-section"><h3>Standing goal</h3><p>{props.status?.goals?.[0]?.text ?? "No active goal"}</p></section></section>;
}

function DiffPanel() {
  return <section className="rail-panel diff-panel"><div className="diff-heading"><h3>Working tree</h3><span>live project</span></div><pre><span className="diff-context">@@ Desktop shell @@</span>{"\n"}<span className="diff-add">+ task-focused workspace</span>{"\n"}<span className="diff-add">+ contextual inspector</span>{"\n"}<span className="diff-add">+ visible approvals and receipts</span>{"\n"}<span className="diff-context">Runtime APIs remain Vanta-owned.</span></pre><p className="muted">The runtime will show the exact project diff here when a file edit is proposed.</p></section>;
}

function ReceiptsPanel(props: { artifacts: Artifact[]; events: EventRow[]; onOpenSession: (id: string) => void }) {
  return <section className="rail-panel receipts-panel"><OutputsPanel artifacts={props.artifacts} events={props.events} onOpenSession={props.onOpenSession} onOpenOutputs={() => undefined} /></section>;
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

export function FilesPanel(props: { files: string[]; mentioned: string[]; selected: string[]; onInsert: (file: string) => void }) {
  const [query, setQuery] = useState("");
  const [context, setContext] = useState<ProjectFileContext>(() => fallbackProjectFileContext(props.files));
  useEffect(() => {
    let current = true;
    setContext(fallbackProjectFileContext(props.files));
    void api<ProjectFileContext>("/api/file-context").then((result) => { if (current) setContext(result); }).catch(() => undefined);
    return () => { current = false; };
  }, [props.files]);
  const groups = groupProjectFiles(context, props.mentioned, query);
  const searching = query.trim().length > 0;
  return (
    <section className="rail-panel files-panel">
      <div className="panel-heading"><h2>Project context</h2><span>{props.selected.length ? `${props.selected.length} attached` : `${context.files.length} files`}</span></div>
      <label className="file-search"><span className="sr-only">Find a project file</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a project file" /></label>
      {searching ? <FileGroup label="Search project" files={groups.search} selected={props.selected} onInsert={props.onInsert} /> : <>
        <FileGroup label="Changed by Vanta" files={groups.changed} selected={props.selected} onInsert={props.onInsert} />
        <FileGroup label="Mentioned in this task" files={groups.mentioned} selected={props.selected} onInsert={props.onInsert} />
        <FileGroup label="Recent" files={groups.recent} selected={props.selected} onInsert={props.onInsert} />
      </>}
      {(searching ? groups.search : [...groups.changed, ...groups.mentioned, ...groups.recent]).length === 0 ? <p className="muted">{searching ? "No matching project files." : "No safe project context found."}</p> : null}
    </section>
  );
}

function FileGroup(props: { label: string; files: string[]; selected: string[]; onInsert: (file: string) => void }) {
  if (!props.files.length) return null;
  return <section className="file-group"><h3>{props.label}</h3><div className="file-list">{props.files.map((file) => {
    const attached = props.selected.includes(file);
    return <button key={file} className={attached ? "attached" : ""} type="button" disabled={attached} title={file} onClick={() => props.onInsert(file)}>{attached ? <Check size={14} /> : <FileText size={14} />}<span>{file}</span><em>{attached ? "attached" : "attach"}</em></button>;
  })}</div></section>;
}

export function TerminalPanel() {
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState("Commands are kernel-gated. Approval requests stay in the task transcript.");
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
