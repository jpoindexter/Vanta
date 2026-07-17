import { useEffect, useRef, useState } from "react";
import { ChevronDown, Cpu, Gauge, HardDrive, ListTree, Play, RefreshCw, RotateCcw, Server, ShieldCheck, Square, X } from "lucide-react";
import type { DesktopRuntime, RuntimeAction, RuntimeHostSnapshot } from "./types.js";
import { RuntimeProfilesPanel } from "./runtime-profiles.js";
import { ModelDownloadsPanel } from "./model-downloads.js";

export function RuntimeStrip(props: { runtime: DesktopRuntime; onSelect: (hostId: string) => Promise<void>; onAction: (hostId: string, action: RuntimeAction) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(""); const [error, setError] = useState("");
  const [lastAction, setLastAction] = useState<RuntimeAction>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = selectedRuntime(props.runtime);
  useRuntimeDismiss(open, setOpen, root, trigger);

  async function select(hostId: string) {
    setPending(hostId);
    setError("");
    try { await props.onSelect(hostId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setPending(""); }
  }

  async function act(action: RuntimeAction) {
    if (!selected) return;
    setPending(action); setError("");
    try { await props.onAction(selected.host.id, action); setLastAction(action); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setPending(""); }
  }

  return <div className="runtime-strip" data-runtime-strip ref={root}>
    <button
      ref={trigger}
      className="runtime-strip-trigger"
      type="button"
      aria-expanded={open}
      aria-controls="runtime-context-panel"
      onClick={() => setOpen((current) => !current)}
      disabled={!selected}
    >
      <RuntimeSummary runtime={selected} />
      <ChevronDown className="runtime-chevron" size={14} aria-hidden="true" />
    </button>
    {open && selected ? <RuntimeDetail
      runtime={props.runtime}
      selected={selected}
      pending={pending}
      error={error}
      lastAction={lastAction}
      onSelect={(hostId) => { void select(hostId); }}
      onAction={(action) => { void act(action); }}
      onClose={() => { setOpen(false); trigger.current?.focus(); }}
    /> : null}
  </div>;
}

function useRuntimeDismiss(
  open: boolean,
  setOpen: (open: boolean) => void,
  root: React.RefObject<HTMLDivElement | null>,
  trigger: React.RefObject<HTMLButtonElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const closeOnPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, root, setOpen, trigger]);
}

function RuntimeSummary(props: { runtime?: RuntimeHostSnapshot }) {
  const runtime = props.runtime;
  if (!runtime) return <span className="runtime-empty"><Server size={13} />Runtime unavailable</span>;
  const pressure = pressurePercent(runtime);
  return <>
    <span className="runtime-host"><i className={`runtime-state state-${runtime.status}`} /><Server size={13} />{runtime.host.label}</span>
    <span className="runtime-model"><Cpu size={13} />{runtime.engine.model ?? "No model"}</span>
    <span className="runtime-engine">{runtime.engine.id ?? "engine idle"}</span>
    <span className="runtime-pressure" aria-label={`Memory pressure ${pressure}%`}><Gauge size={13} /><meter min="0" max="100" value={pressure} />{pressure}%</span>
    <span className="runtime-throughput">{formatThroughput(runtime.resources.throughputPerSecond)}</span>
    <span className="runtime-queue"><ListTree size={13} />{runtime.queueDepth}</span>
    <span className={`runtime-trust trust-${runtime.kernel}`}><ShieldCheck size={13} />{runtime.kernel === "ready" ? "gated" : "ungated"}</span>
  </>;
}

export function RuntimeDetail(props: {
  runtime: DesktopRuntime;
  selected: RuntimeHostSnapshot;
  pending?: string;
  error?: string;
  lastAction?: RuntimeAction;
  onSelect: (hostId: string) => void;
  onAction: (action: RuntimeAction) => void;
  onClose: () => void;
}) {
  return <section id="runtime-context-panel" className="runtime-context-panel" role="dialog" aria-label="Runtime details" aria-modal="false">
    <header><div><span>Session runtime</span><strong>{props.selected.host.label}</strong></div><button type="button" onClick={props.onClose} aria-label="Close runtime details"><X size={15} /></button></header>
    <RuntimeFacts runtime={props.selected} />
    <RuntimeEvidence runtime={props.selected} />
    <ModelDownloadsPanel />
    <RuntimeProfilesPanel />
    <RuntimeControls runtime={props.selected} pending={props.pending} lastAction={props.lastAction} onAction={props.onAction} />
    <div className="runtime-host-switcher" role="group" aria-label="Switch runtime host">
      <span>Run this session on</span>
      {props.runtime.hosts.map((host) => <button
        key={host.host.id}
        type="button"
        aria-pressed={host.host.id === props.runtime.selectedHostId}
        disabled={props.pending === host.host.id}
        onClick={() => props.onSelect(host.host.id)}
      ><HardDrive size={13} />{host.host.label}<small>{statusLabel(host.status)}</small></button>)}
    </div>
    <RuntimeLogs runtime={props.selected} />
    {props.error ? <p className="runtime-switch-error" role="alert">{props.error}</p> : null}
  </section>;
}

function RuntimeFacts(props: { runtime: RuntimeHostSnapshot }) {
  const runtime = props.runtime;
  const boundary = runtime.kernel === "ready" ? "Ready" : runtime.kernel === "not_ready" ? "Not ready" : "Unknown";
  return <div className="runtime-detail-grid">
    <RuntimeFact label="Transport" value={transportLabel(runtime)} tone={runtime.transport === "reachable" ? "good" : "bad"} />
    <RuntimeFact label="Kernel boundary" value={boundary} tone={runtime.kernel === "ready" ? "good" : "bad"} />
    <RuntimeFact label="Lifecycle" value={statusLabel(runtime.status)} />
    <RuntimeFact label="Engine" value={runtime.engine.id ?? "Idle"} />
    <RuntimeFact label="Controller" value={runtime.detail.controllerId} />
    <RuntimeFact label="Request owner" value={runtime.detail.requestOwner} />
    <RuntimeFact label="Approval" value={approvalLabel(runtime.detail.approval)} tone={approvalTone(runtime.detail.approval)} />
    <RuntimeFact label="Model" value={runtime.engine.model ?? "None"} />
    <RuntimeFact label="Memory pressure" value={`${pressurePercent(runtime)}%`} />
    <RuntimeFact label="Throughput" value={formatThroughput(runtime.resources.throughputPerSecond)} />
    <RuntimeFact label="Queued turns" value={String(runtime.queueDepth)} />
    <RuntimeFact label="Observed" value={runtime.stale ? "Stale" : "Current"} tone={runtime.stale ? "bad" : "good"} />
  </div>;
}

function RuntimeEvidence(props: { runtime: RuntimeHostSnapshot }) {
  const detail = props.runtime.detail;
  return <div className="runtime-evidence">
    <section><h3>Launch command</h3>{detail.command
      ? <pre><code>{[detail.command.executable, ...detail.command.args].join(" ")}</code></pre>
      : <p>No launch command for this controller.</p>}</section>
    <section><h3>Resource fit</h3>{detail.resourceFit
      ? <p className={detail.resourceFit.fits ? "tone-good" : "tone-bad"}>{formatBytes(detail.resourceFit.estimatedMemoryBytes)} estimated · {formatBytes(detail.resourceFit.availableMemoryBytes)} available · {detail.resourceFit.fits ? "fits" : "does not fit"}</p>
      : <p>Not reported.</p>}</section>
    <section><h3>Benchmark</h3>{detail.benchmark
      ? <p>{detail.benchmark.latencyMs ?? "--"} ms · {detail.benchmark.outputTokens ?? "--"} tokens · provider {detail.benchmark.providerLatencyMs ?? "--"} ms</p>
      : <p>Not run.</p>}</section>
  </div>;
}

function RuntimeControls(props: { runtime: RuntimeHostSnapshot; pending?: string; lastAction?: RuntimeAction; onAction: (action: RuntimeAction) => void }) {
  return <div className="runtime-actions" role="group" aria-label="Runtime lifecycle actions">
    <span>Lifecycle</span>
    {props.runtime.detail.actions.map((action) => <button key={action} type="button" disabled={Boolean(props.pending)} onClick={() => props.onAction(action)}>
      {actionIcon(action)}{action === "launch" && props.lastAction === "stop" ? "Undo stop" : actionLabel(action)}
    </button>)}
  </div>;
}

function RuntimeLogs(props: { runtime: RuntimeHostSnapshot }) {
  return <section className="runtime-logs" aria-label="Runtime logs"><h3>Recent lifecycle</h3>
    {props.runtime.detail.logs.length ? <ol>{props.runtime.detail.logs.map((log, index) => <li key={`${log.at}-${index}`}><time>{new Date(log.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><span>{log.transition.replaceAll("_", " ")}</span>{log.code ? <code>{log.code}</code> : null}</li>)}</ol> : <p>No lifecycle events yet.</p>}
  </section>;
}

function actionIcon(action: RuntimeAction) {
  return action === "launch" ? <Play size={13} /> : action === "stop" ? <Square size={13} /> : action === "retry" ? <RotateCcw size={13} /> : <RefreshCw size={13} />;
}

function actionLabel(action: RuntimeAction): string {
  return action === "launch" ? "Launch" : action === "stop" ? "Stop" : action === "retry" ? "Retry" : "Reconnect";
}

function RuntimeFact(props: { label: string; value: string; tone?: "good" | "bad" }) {
  return <div className={props.tone ? `tone-${props.tone}` : undefined}><span>{props.label}</span><strong>{props.value}</strong></div>;
}

function selectedRuntime(runtime: DesktopRuntime): RuntimeHostSnapshot | undefined {
  return runtime.hosts.find((host) => host.host.id === runtime.selectedHostId) ?? runtime.hosts[0];
}

function pressurePercent(runtime: RuntimeHostSnapshot): number {
  if (runtime.resources.utilizationPercent !== undefined) return Math.round(runtime.resources.utilizationPercent);
  const used = runtime.resources.memoryUsedBytes;
  const total = runtime.resources.memoryTotalBytes;
  return used !== undefined && total ? Math.round(used / total * 100) : 0;
}

function formatThroughput(value?: number): string {
  return value === undefined ? "-- tok/s" : `${value.toFixed(1)} tok/s`;
}

function formatBytes(value: number): string {
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function approvalLabel(value: RuntimeHostSnapshot["detail"]["approval"]): string {
  return value === "not_required" ? "Not required" : value.charAt(0).toUpperCase() + value.slice(1);
}

function approvalTone(value: RuntimeHostSnapshot["detail"]["approval"]): "good" | "bad" {
  return value === "blocked" || value === "denied" ? "bad" : "good";
}

function transportLabel(runtime: RuntimeHostSnapshot): string {
  return runtime.transport === "reachable" ? "Reachable" : runtime.transport === "auth_required" ? "Authentication required" : "Offline";
}

function statusLabel(status: RuntimeHostSnapshot["status"]): string {
  return status === "auth_required" ? "Needs auth" : status.charAt(0).toUpperCase() + status.slice(1);
}
