import { useEffect, useState } from "react";
import { Download, Pause, RefreshCw, RotateCcw, Square } from "lucide-react";
import { api } from "./api.js";

export type WorkflowRunPacket = {
  runId: string;
  graphId: string;
  status: string;
  revision: number;
  updatedAt: string;
  nodes: Array<{ id: string; type: string; status: string; attempts: number }>;
  timeline: Array<{ at: string; kind: string; label: string; replay: string }>;
  artifacts: Array<{ id: string; uri: string; revision: string }>;
  terminal?: { state: string; reason: string; recoveryAction?: string };
  controls: Array<"pause" | "cancel" | "retry">;
  replayPolicy: string;
};

export function WorkflowRunLedger() {
  const [runs, setRuns] = useState<WorkflowRunPacket[]>([]);
  const [selected, setSelected] = useState<WorkflowRunPacket | null>(null);
  const [error, setError] = useState("");
  async function refresh() {
    try {
      const next = await api<WorkflowRunPacket[]>("/api/workflow-runs");
      setRuns(next);
      setSelected((current) => next.find((run) => run.runId === current?.runId) ?? next[0] ?? null);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 2_000); return () => window.clearInterval(timer); }, []);
  async function control(action: "pause" | "cancel" | "retry") {
    if (!selected) return;
    try {
      const next = await api<WorkflowRunPacket>(`/api/workflow-runs/${encodeURIComponent(selected.runId)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
      });
      setSelected(next); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  async function exportHandoff() {
    if (!selected) return;
    const result = await api<{ handoff: string }>(`/api/workflow-runs/${encodeURIComponent(selected.runId)}/export`);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([result.handoff], { type: "text/plain" }));
    link.download = `${selected.runId}-handoff.txt`; link.click(); URL.revokeObjectURL(link.href);
  }
  return <section className="workflow-runs" aria-labelledby="workflow-runs-title">
    <header><div><p className="eyebrow">Graph runs</p><h2 id="workflow-runs-title">Execution replay</h2></div><button className="icon-button" type="button" aria-label="Refresh graph runs" onClick={() => void refresh()}><RefreshCw size={15} /></button></header>
    {error ? <p className="setup-error" role="alert">{error}</p> : null}
    {!runs.length ? <p className="workflow-run-empty">No graph runs in this project.</p> : <div className="workflow-run-layout">
      <div className="workflow-run-list">{runs.map((run) => <button className={selected?.runId === run.runId ? "active" : ""} type="button" key={run.runId} onClick={() => setSelected(run)}><i data-status={run.status} /><span><strong>{run.graphId}</strong><small>{run.runId}</small></span><em>{run.status}</em></button>)}</div>
      {selected ? <WorkflowRunDetail packet={selected} onControl={control} onExport={exportHandoff} /> : null}
    </div>}
  </section>;
}

export function WorkflowRunDetail(props: { packet: WorkflowRunPacket; onControl: (action: "pause" | "cancel" | "retry") => void; onExport: () => void }) {
  const packet = props.packet;
  return <article className="workflow-run-detail">
    <header><div><strong>{packet.runId}</strong><small>revision {packet.revision} · {packet.status}</small></div><div>
      {packet.controls.includes("pause") ? <button type="button" onClick={() => props.onControl("pause")}><Pause size={14} />Pause</button> : null}
      {packet.controls.includes("cancel") ? <button type="button" onClick={() => props.onControl("cancel")}><Square size={14} />Cancel</button> : null}
      {packet.controls.includes("retry") ? <button type="button" onClick={() => props.onControl("retry")}><RotateCcw size={14} />Retry</button> : null}
      <button type="button" onClick={props.onExport}><Download size={14} />Export</button>
    </div></header>
    <div className="workflow-node-strip">{packet.nodes.map((node) => <span key={node.id} data-status={node.status}><strong>{node.id}</strong><small>{node.type} · {node.attempts}x</small></span>)}</div>
    <ol className="workflow-timeline">{packet.timeline.slice(-8).reverse().map((event, index) => <li key={`${event.at}-${index}`}><i data-kind={event.kind} /><span><strong>{event.label}</strong><small>{event.kind.replace("_", " ")} · {event.replay.replaceAll("_", " ")}</small></span></li>)}</ol>
    {packet.terminal ? <p className="workflow-stop"><strong>{packet.terminal.state}</strong>{packet.terminal.reason}</p> : null}
    <small className="workflow-replay-policy">{packet.replayPolicy}</small>
  </article>;
}
