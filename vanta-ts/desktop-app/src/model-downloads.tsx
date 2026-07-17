import { CheckCircle2, HardDrive, Pause, Play, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "./api.js";
import type { ModelDownloadJob, ModelDownloadPayload } from "./types.js";

type DownloadAction =
  | { action: "enqueue"; input: Record<string, unknown>; start?: boolean }
  | { action: "run" | "pause" | "resume" | "retry"; id: string }
  | { action: "cleanup"; id: string; confirmed: boolean };

export function ModelDownloadsPanel() {
  const [payload, setPayload] = useState<ModelDownloadPayload>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  async function refresh() {
    try { setPayload(await api<ModelDownloadPayload>("/api/runtime/downloads")); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  async function act(action: DownloadAction) {
    setPending("id" in action ? action.id : "enqueue");
    try {
      setPayload(await api<ModelDownloadPayload>("/api/runtime/downloads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action) }));
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setPending(""); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!payload?.jobs.some((job) => job.status === "downloading" || job.status === "verifying")) return;
    const timer = window.setInterval(() => { void refresh(); }, 750);
    return () => window.clearInterval(timer);
  }, [payload?.jobs]);
  return <ModelDownloadsView payload={payload} error={error} pending={pending} onAction={act} />;
}

export function ModelDownloadsView(props: { payload?: ModelDownloadPayload; error?: string; pending?: string; onAction: (action: DownloadAction) => void | Promise<void> }) {
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState("");
  const active = props.payload?.jobs.filter((job) => job.status === "downloading" || job.status === "verifying").length ?? 0;
  const verified = props.payload?.jobs.filter((job) => job.status === "completed").length ?? 0;
  const receipts = useMemo(() => new Map((props.payload?.receipts ?? []).map((receipt) => [receipt.jobId, receipt])), [props.payload?.receipts]);

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const optional = (name: string) => String(data.get(name) ?? "").trim() || undefined;
    void props.onAction({
      action: "enqueue", start: data.get("start") === "on",
      input: {
        id: String(data.get("id")), label: String(data.get("label")),
        source: {
          kind: "hugging_face", url: String(data.get("url")), sha256: String(data.get("sha256")),
          bytes: Number(data.get("bytes")), filename: String(data.get("filename")),
          ...(optional("authSecretRef") ? { authSecretRef: optional("authSecretRef") } : {}),
          ...(optional("manifestUrl") ? { manifestUrl: optional("manifestUrl") } : {}),
        },
        ...(optional("storageRoot") ? { storageRoot: optional("storageRoot") } : {}),
        ...(optional("profileId") ? { profileId: optional("profileId") } : {}),
      },
    });
    setCreating(false);
  }

  return <details className="model-downloads-panel">
    <summary><span>Downloads</span><strong>{active ? `${active} active` : `${verified} verified`}</strong></summary>
    <div className="model-download-body">
      <header><div><HardDrive size={13} /><span>Verified local artifacts</span></div><button type="button" onClick={() => setCreating((value) => !value)}>{creating ? <X size={13} /> : <Plus size={13} />}{creating ? "Cancel" : "Add"}</button></header>
      {props.error ? <p className="runtime-switch-error" role="alert">{props.error}</p> : null}
      {creating ? <DownloadForm onSubmit={create} /> : null}
      {props.payload?.jobs.length ? <ol className="model-download-list">{props.payload.jobs.map((job) => <DownloadRow
        key={job.id} job={job} receiptAt={receipts.get(job.id)?.at} pending={props.pending === job.id}
        confirmCleanup={confirmId === job.id}
        onAction={props.onAction}
        onConfirmCleanup={() => setConfirmId(job.id)}
        onCancelCleanup={() => setConfirmId("")}
      />)}</ol> : <p className="model-download-empty">No model downloads queued.</p>}
    </div>
  </details>;
}

function DownloadForm(props: { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form className="model-download-form" onSubmit={props.onSubmit}>
    <label>ID<input name="id" required pattern="[a-z0-9._-]+" placeholder="qwen-local" /></label>
    <label>Name<input name="label" required placeholder="Qwen local" /></label>
    <label className="wide">Hugging Face file URL<input name="url" type="url" required placeholder="https://huggingface.co/.../model.gguf" /></label>
    <label>Bytes<input name="bytes" type="number" min="1" required /></label>
    <label>Filename<input name="filename" required pattern="[a-zA-Z0-9._-]+" placeholder="model.gguf" /></label>
    <label className="wide">SHA-256<input name="sha256" required pattern="[a-f0-9]{64}" /></label>
    <details className="wide"><summary>Storage, auth, and profile</summary><div>
      <label>Storage destination<input name="storageRoot" placeholder=".vanta/models" /></label>
      <label>Profile ID<input name="profileId" placeholder="selected profile" /></label>
      <label>Auth reference<input name="authSecretRef" placeholder="secret://huggingface/token" /></label>
      <label>Trusted manifest URL<input name="manifestUrl" type="url" /></label>
    </div></details>
    <div className="wide"><label className="model-download-start"><input name="start" type="checkbox" defaultChecked />Start after adding</label><button type="submit"><Plus size={13} />Add download</button></div>
  </form>;
}

function DownloadRow(props: { job: ModelDownloadJob; receiptAt?: string; pending: boolean; confirmCleanup: boolean; onAction: (action: DownloadAction) => void | Promise<void>; onConfirmCleanup: () => void; onCancelCleanup: () => void }) {
  const percent = Math.min(100, Math.round(props.job.downloadedBytes / props.job.source.bytes * 100));
  return <li data-download-status={props.job.status}>
    <header><div><DownloadStatusIcon status={props.job.status} /><span><strong>{props.job.label}</strong><small>{props.job.status.replaceAll("_", " ")} · {formatBytes(props.job.downloadedBytes)} / {formatBytes(props.job.source.bytes)}</small></span></div><code>{percent}%</code></header>
    <progress max={props.job.source.bytes} value={props.job.downloadedBytes} aria-label={`${props.job.label} download progress`} />
    <p title={props.job.destination}>{props.job.destination}</p>
    <DownloadRecovery text={props.job.recovery} />
    <footer><span>{props.job.profileId ? `profile ${props.job.profileId}` : "profile on completion"}{props.receiptAt ? ` · receipt ${new Date(props.receiptAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span><div>
      <DownloadActions {...props} />
    </div></footer>
  </li>;
}

const statusAction: Partial<Record<ModelDownloadJob["status"], "run" | "resume" | "retry">> = { queued: "run", paused: "resume", failed: "retry" };
const actionLabel = { run: "Start", resume: "Resume", retry: "Retry" } as const;

function DownloadStatusIcon(props: { status: ModelDownloadJob["status"] }) {
  return props.status === "completed" ? <CheckCircle2 size={13} /> : <HardDrive size={13} />;
}

function DownloadRecovery(props: { text?: string }) {
  return props.text ? <p className="model-download-recovery" role="status">{props.text}</p> : null;
}

function DownloadActions(props: { job: ModelDownloadJob; pending: boolean; confirmCleanup: boolean; onAction: (action: DownloadAction) => void | Promise<void>; onConfirmCleanup: () => void; onCancelCleanup: () => void }) {
  const action = statusAction[props.job.status];
  if (props.confirmCleanup) return <><button type="button" onClick={() => { void props.onAction({ action: "cleanup", id: props.job.id, confirmed: true }); props.onCancelCleanup(); }}>Confirm remove</button><button type="button" onClick={props.onCancelCleanup}>Keep</button></>;
  return <>
    {activeDownload(props.job) ? <button type="button" disabled={props.pending} onClick={() => props.onAction({ action: "pause", id: props.job.id })}><Pause size={12} />Pause</button> : null}
    {action ? <button type="button" disabled={props.pending} onClick={() => props.onAction({ action, id: props.job.id })}>{action === "retry" ? <RotateCcw size={12} /> : <Play size={12} />}{actionLabel[action]}</button> : null}
    {props.job.status !== "completed" ? <button type="button" disabled={props.pending} onClick={props.onConfirmCleanup}><Trash2 size={12} />Remove partial</button> : null}
  </>;
}

function activeDownload(job: ModelDownloadJob): boolean {
  return job.status === "downloading" || job.status === "verifying";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
