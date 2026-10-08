import { useEffect, useRef } from "react";
import { ExternalLink, X } from "lucide-react";
import { DiffPanel, FilesPanel } from "./rail.js";
import { CanvasPanel } from "./canvas.js";
import { mentionedProjectFiles } from "./file-context.js";
import { TaskDossier } from "./task-dossier.js";
import type { ChatFirstState } from "./chat-first-state.js";
import { DocumentPreview } from "./chat-first-documents.js";

type Tab = ChatFirstState["contextTab"];
const tabs: { id: Tab; label: string }[] = [{ id: "files", label: "Files" }, { id: "review", label: "Review" },
  { id: "sources", label: "Web sources" }, { id: "activity", label: "Activity" }, { id: "canvas", label: "Canvas" }];

export function ChatFirstInspector({ state }: { state: ChatFirstState }) {
  const { contextTab: tab, setContextTab: setTab } = state;
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => restoreContextFocus(opener);
  }, []);
  return <aside className="chat-inspector" aria-label="Context inspector" onKeyDown={(event) => {
    if (event.key === "Escape") { event.stopPropagation(); state.setInspector(false); }
  }}>
    <header><strong>Workbench</strong><button ref={close} className="chat-icon" type="button" aria-label="Close context" onClick={() => state.setInspector(false)}><X size={18} /></button></header>
    <nav aria-label="Context views">{tabs.map((item) => <button key={item.id} type="button" aria-pressed={!state.documents.active && tab === item.id} onClick={() => { setTab(item.id); state.documents.setActive(null); }}>{item.label}</button>)}</nav>
    {state.documents.active ? <DocumentPreview key={state.documents.active} path={state.documents.active} onAttach={state.attachments.addFile} /> : <InspectorContent state={state} />}
  </aside>;
}

function InspectorContent({ state }: { state: ChatFirstState }) {
  const tab = state.contextTab;
  const mentioned = mentionedProjectFiles(state.data.files, [...state.convo.messages.map((message) => message.content ?? ""), state.convo.draft]);
  if (tab === "files") return <FilesPanel files={state.data.files} mentioned={mentioned} selected={state.attachments.files} onInsert={state.attachments.addFile} onPreview={state.documents.open} />;
  if (tab === "sources") return <WebSources state={state} />;
  if (tab === "review") return <><p className="chat-panel-note">Reported changes, not a Git diff. Exact proposed edits appear with their approval request.</p><DiffPanel events={state.convo.events} /></>;
  if (tab === "canvas") return <CanvasPanel artifact={state.data.canvas} onRefresh={() => void state.data.refresh()} />;
  return <section className="chat-context-content"><h2>Activity</h2>
      <TaskDossier title={state.convo.activeTitle} hasMessages={state.convo.messages.length > 0} busy={state.convo.busy}
        streaming={Boolean(state.convo.streamText)} approval={state.approval.approval} recovery={state.convo.recovery} queueCount={state.queue.snapshot.items.length} />
      <p>Reported tool events. A successful event is not proof the whole task is done.</p>
      <ol>{state.convo.events.map((event, index) => <li key={index} data-failed={event.ok === false}>{event.label}</li>)}</ol>
      <button type="button" onClick={() => { state.setView("outputs"); state.setInspector(false); }}>Inspect outputs</button></section>;
}

export function restoreContextFocus(opener: HTMLElement | null) {
  const target = opener?.isConnected && opener !== document.body
    ? opener : document.querySelector<HTMLElement>('button[aria-label="Toggle context"]');
  target?.focus();
}

function WebSources({ state }: { state: ChatFirstState }) {
  const sources = state.data.artifacts.filter((artifact) => artifact.kind === "link"
    && (!artifact.sessionId || artifact.sessionId === state.convo.sessionId) && /^https?:\/\//i.test(artifact.value));
  return <section className="chat-context-content"><h2>Web sources</h2><p>Open reported sources in your browser. This panel does not grant browsing authority.</p>
    {sources.length ? <ul>{sources.map((source) => <li key={source.id}><a href={source.value} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={14} /></a></li>)}</ul> : <p>No web sources reported in this chat yet.</p>}
  </section>;
}
