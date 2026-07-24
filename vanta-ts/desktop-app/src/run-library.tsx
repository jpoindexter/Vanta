import { useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, ChevronRight, FileText, GitFork, History, Play, Search, ShieldCheck, Trash2, X } from "lucide-react";
import type { PreparedRun, ReplayPreview, RunRecord } from "./types.js";

export type RunLibraryController = {
  runs: RunRecord[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  save: (id: string, saved: boolean) => Promise<RunRecord>;
  remove: (id: string) => Promise<void>;
  preview: (id: string) => Promise<ReplayPreview>;
  prepare: (id: string, mode: "fork" | "replay", options?: { prompt?: string; files?: string[]; acknowledgeDrift?: boolean }) => Promise<PreparedRun>;
};

export function RunLibraryPanel(props: { controller: RunLibraryController; onPrepared: (prepared: PreparedRun) => void | Promise<void> }) {
  const [query, setQuery] = useState("");
  const [savedOnly, setSavedOnly] = useState(true);
  const [selected, setSelected] = useState<RunRecord | null>(null);
  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => props.controller.runs.filter((run) =>
    (!savedOnly || run.saved) &&
    (!needle || `${run.title}\n${run.prompt}\n${run.inputs.map((input) => input.path).join("\n")}`.toLowerCase().includes(needle)),
  ), [needle, props.controller.runs, savedOnly]);

  return (
    <section className="run-library-panel" aria-label="Reusable runs">
      <div className="run-library-filters">
        <div className="segmented" aria-label="Run library filter">
          <button className={savedOnly ? "active" : ""} type="button" onClick={() => setSavedOnly(true)}>Saved</button>
          <button className={!savedOnly ? "active" : ""} type="button" onClick={() => setSavedOnly(false)}>All runs</button>
        </div>
        <label className="session-search"><Search size={14} /><span className="sr-only">Search runs</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Prompt, file, or tool" /></label>
      </div>
      <div className="run-library-list">
        {props.controller.loading ? <p className="muted">Loading runs…</p> : null}
        {props.controller.error ? <p className="run-library-error">{props.controller.error}</p> : null}
        {!props.controller.loading && !visible.length ? <p className="muted">{savedOnly ? "No saved runs yet. Open All runs and save one that worked." : "No matching runs."}</p> : null}
        {visible.map((run) => (
          <button className="run-library-row" type="button" key={run.id} onClick={() => setSelected(run)}>
            <span className={`run-status ${run.status}`} aria-hidden="true" />
            <span><strong>{run.title}</strong><small>{run.providerId ?? "unknown provider"} · {run.events.filter((event) => event.kind === "tool_start").length} tools</small></span>
            {run.saved ? <BookmarkCheck size={14} aria-label="Saved" /> : <ChevronRight size={14} aria-hidden="true" />}
          </button>
        ))}
      </div>
      {selected ? <RunDetail run={selected} controller={props.controller} onClose={() => setSelected(null)} onUpdated={setSelected} onPrepared={async (prepared) => { setSelected(null); await props.onPrepared(prepared); }} /> : null}
    </section>
  );
}

function RunDetail(props: {
  run: RunRecord;
  controller: RunLibraryController;
  onClose: () => void;
  onUpdated: (run: RunRecord) => void;
  onPrepared: (prepared: PreparedRun) => void | Promise<void>;
}) {
  const [preview, setPreview] = useState<ReplayPreview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function act(label: string, action: () => Promise<void>) {
    setBusy(label); setError("");
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(""); }
  }

  return (
    <div className="dialog-backdrop run-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section className="run-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="run-detail-title">
        <header><div><span>Reusable run</span><h2 id="run-detail-title">{props.run.title}</h2></div><button type="button" onClick={props.onClose} aria-label="Close run details"><X size={16} /></button></header>
        <div className="run-detail-body">
          <section className="run-overview"><div><strong>{props.run.status}</strong><span>{props.run.provenance === "derived" ? "Incomplete provenance · derived from a legacy session" : "Captured provenance"}</span></div><div><strong>{props.run.providerId ?? "Unknown provider"}</strong><span>{props.run.modelId ?? "Unknown model"}</span></div><div><strong>{props.run.events.filter((event) => event.kind === "tool_start").length} tools</strong><span>{props.run.inputs.length} inputs</span></div></section>
          <details open><summary>Prompt</summary><pre>{props.run.prompt}</pre></details>
          <details><summary>Inputs <span>{props.run.inputs.length}</span></summary>{props.run.inputs.length ? <ul>{props.run.inputs.map((input) => <li key={input.path}><FileText size={13} /><span>{input.path}</span><em>{input.capture}</em></li>)}</ul> : <p className="muted">No structured file inputs were captured.</p>}</details>
          <details><summary>Timeline <span>{props.run.events.length}</span></summary>{props.run.events.length ? <ol>{props.run.events.map((event, index) => <li key={`${event.at}-${index}`}><span>{event.kind === "approval" ? <ShieldCheck size={13} /> : <History size={13} />}</span><div><strong>{event.toolName ?? event.kind}</strong><small>{event.approval?.decision ?? (event.ok === false ? "failed" : event.kind)}</small></div></li>)}</ol> : <p className="muted">No detailed events were available.</p>}</details>
          <details><summary>Final output</summary><pre>{props.run.finalOutput}</pre></details>
          <details><summary>Provenance</summary><p>Session {props.run.sessionId} · turn {props.run.turnIndex + 1} · {props.run.lineage.mode}{props.run.lineage.parentRunId ? ` of ${props.run.lineage.parentRunId}` : ""}</p></details>
          {preview ? <ReplayReview preview={preview} acknowledged={acknowledged} onAcknowledge={setAcknowledged} /> : null}
          {error ? <p className="run-library-error" role="alert">{error}</p> : null}
        </div>
        <footer>
          <button type="button" disabled={!!busy} onClick={() => void act("save", async () => props.onUpdated(await props.controller.save(props.run.id, !props.run.saved)))}>{props.run.saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}{props.run.saved ? "Saved" : "Save run"}</button>
          {props.run.saved ? <button className="danger" type="button" disabled={!!busy} onClick={() => void act("delete", async () => { await props.controller.remove(props.run.id); props.onClose(); })}><Trash2 size={14} />Delete saved run</button> : null}
          <button type="button" disabled={!!busy} onClick={() => void act("fork", async () => props.onPrepared(await props.controller.prepare(props.run.id, "fork")))}><GitFork size={14} />Fork</button>
          {!preview ? <button className="primary" type="button" disabled={!!busy} onClick={() => void act("preview", async () => setPreview(await props.controller.preview(props.run.id)))}><Play size={14} />Review replay</button> : <button className="primary" type="button" disabled={!!busy || (!preview.canExecute && !acknowledged)} onClick={() => void act("replay", async () => props.onPrepared(await props.controller.prepare(props.run.id, "replay", { acknowledgeDrift: acknowledged })))}><Play size={14} />Replay now</button>}
        </footer>
      </section>
    </div>
  );
}

function ReplayReview(props: { preview: ReplayPreview; acknowledged: boolean; onAcknowledge: (value: boolean) => void }) {
  const drift = props.preview.inputs.filter((input) => input.state !== "ready");
  const comparison = [
    { label: "Project root", recorded: props.preview.project.recorded, current: props.preview.project.current, changed: props.preview.project.changed },
    { label: "Provider", recorded: props.preview.provider.recorded ?? "Unavailable", current: props.preview.provider.current ?? "Unavailable", changed: props.preview.provider.changed },
    { label: "Model", recorded: props.preview.model.recorded ?? "Unavailable", current: props.preview.model.current ?? "Unavailable", changed: props.preview.model.changed },
  ];
  return <section className="replay-review"><h3>Replay review</h3><p>{props.preview.warning}</p><dl>{comparison.map((item) => <div key={item.label}><dt>{item.label}</dt><dd><span>{item.recorded}</span><span>{item.current}</span><em className={item.changed ? "changed" : "ready"}>{item.changed ? "changed" : "match"}</em></dd></div>)}<div><dt>Tools</dt><dd><span>{props.preview.tools.recorded.length ? `${props.preview.tools.recorded.length} recorded` : "None recorded"}</span><span>{props.preview.tools.unavailable.length ? props.preview.tools.unavailable.join(", ") : "All available"}</span><em className={props.preview.tools.unavailable.length ? "changed" : "ready"}>{props.preview.tools.unavailable.length ? "drift" : "match"}</em></dd></div></dl><h4>Inputs</h4><ul>{props.preview.inputs.map((input) => <li key={input.path}><span>{input.path}</span><em className={input.state}>{input.state}</em></li>)}</ul>{drift.length ? <label><input type="checkbox" checked={props.acknowledged} onChange={(event) => props.onAcknowledge(event.target.checked)} />I reviewed the changed or unavailable inputs and accept replay with the current inputs.</label> : <p className="replay-ready"><ShieldCheck size={14} />Inputs match. The new run will request fresh approvals.</p>}</section>;
}
