import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Activity, Check, FileDiff, FileText, X } from "lucide-react";
import { api } from "./api.js";
import type { Artifact, CanvasArtifact, EventRow, RailTab, Status, Tool } from "./types.js";
import { fallbackProjectFileContext, groupProjectFiles, type ProjectFileContext } from "./file-context.js";
import { compactTrace } from "../../src/trace/quiet-trace.js";

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
  const visibleTab = visibleRailTab(props.tab);
  return (
    <aside id="review-drawer" className="right-rail" role="dialog" aria-modal="true" aria-labelledby="review-drawer-title">
      <header className="review-drawer-heading"><strong id="review-drawer-title">Review</strong><button className="panel-dismiss inspector-dismiss" type="button" aria-label="Close review" onClick={props.onDismiss}><X size={16} /></button></header>
      <nav className="inspector-tabs" role="tablist" aria-label="Review views">
        <InspectorTab tab="files" current={visibleTab} icon={FileText} onTab={props.onTab}>Files</InspectorTab>
        <InspectorTab tab="diff" current={visibleTab} icon={FileDiff} onTab={props.onTab}>Diff</InspectorTab>
        <InspectorTab tab="activity" current={visibleTab} icon={Activity} onTab={props.onTab}>Activity</InspectorTab>
      </nav>
      {visibleTab === "activity" ? <ActivityPanel events={props.events} status={props.status} /> : null}
      {visibleTab === "files" ? <FilesPanel files={props.files} mentioned={props.mentionedFiles} selected={props.selectedFiles} onInsert={props.onInsertFile} /> : null}
      {visibleTab === "diff" ? <DiffPanel events={props.events} /> : null}
    </aside>
  );
}

function visibleRailTab(tab: RailTab): RailTab {
  return tab === "files" || tab === "diff" || tab === "activity" ? tab : "activity";
}

function InspectorTab(props: { tab: RailTab; current: RailTab; icon: typeof Activity; onTab: (tab: RailTab) => void; children: string }) {
  const Icon = props.icon;
  return <button role="tab" aria-selected={props.current === props.tab} className={props.current === props.tab ? "active" : ""} type="button" onClick={() => props.onTab(props.tab)}><Icon size={14} /><span>{props.children}</span></button>;
}

function ActivityPanel(props: { events: EventRow[]; status: Status | null }) {
  return <section className="rail-panel activity-panel"><div className="inspector-summary"><span><i className="status-dot online" />Kernel {props.status?.kernel ?? "starting"}</span><strong>{props.events.length} events</strong></div><EventList events={props.events} /><section className="rail-section"><h3>Standing goal</h3><p>{props.status?.goals?.[0]?.text ?? "No active goal"}</p></section></section>;
}

function DiffPanel(props: { events: EventRow[] }) {
  const changes = props.events.filter((event) => /\b(edit|write|patch|diff|changed?|created?|deleted?)\b/i.test(`${event.label} ${event.detail ?? ""}`)).slice(-12);
  return <section className="rail-panel diff-panel"><div className="diff-heading"><h3>Task changes</h3><span>{changes.length ? `${changes.length} events` : "none yet"}</span></div>{changes.length ? <ul className="review-change-list">{changes.map((event, index) => <li className={event.ok === false ? "bad" : ""} key={`${event.label}-${index}`}><FileDiff size={14} /><span>{event.label}</span></li>)}</ul> : <div className="rail-empty"><FileDiff size={18} /><p>No file changes have been reported for this task. Exact proposed edits still appear inline when approval is required.</p></div>}</section>;
}

function EventList(props: { events: EventRow[] }) {
  const groups = compactTrace(props.events);
  return <ul className="event-list">{groups.map((group, i) => <li key={i} className={group.status === "attention" ? "bad" : group.status === "done" ? "ok" : ""}>{group.label}</li>)}</ul>;
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
