import { Check, Copy, Download, Plus, Upload } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "./api.js";
import type { RuntimeProfileItem, RuntimeProfilePayload } from "./types.js";

type ProfileAction =
  | { action: "select"; id: string }
  | { action: "clone"; id: string; newId: string; name: string }
  | { action: "create"; input: Record<string, unknown> }
  | { action: "import"; profile: unknown }
  | { action: "export"; id: string };

export function RuntimeProfilesPanel() {
  const [payload, setPayload] = useState<RuntimeProfilePayload>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function refresh() {
    try { setPayload(await api<RuntimeProfilePayload>("/api/runtime/profiles")); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  async function act(action: ProfileAction) {
    setPending(true);
    try {
      const next = await api<RuntimeProfilePayload>("/api/runtime/profiles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action) });
      setPayload(next); setError("");
      if (next.export) downloadProfile(action.action === "export" ? action.id : "runtime-profile", next.export);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setPending(false); }
  }
  useEffect(() => { void refresh(); }, []);
  return <RuntimeProfilesView payload={payload} error={error} pending={pending} onAction={act} />;
}

export function RuntimeProfilesView(props: { payload?: RuntimeProfilePayload; error?: string; pending?: boolean; onAction: (action: ProfileAction) => void | Promise<void> }) {
  const [query, setQuery] = useState("");
  const [inspectId, setInspectId] = useState("");
  const [creating, setCreating] = useState(false);
  const filtered = useMemo(() => (props.payload?.profiles ?? []).filter((item) => `${item.profile.name} ${item.profile.id} ${item.profile.backend}`.toLowerCase().includes(query.toLowerCase())), [props.payload, query]);
  const inspected = props.payload?.profiles.find((item) => item.profile.id === inspectId) ?? props.payload?.profiles.find((item) => item.profile.id === props.payload?.selectedId) ?? props.payload?.profiles[0];
  const selected = props.payload?.profiles.find((item) => item.profile.id === props.payload?.selectedId);

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void props.onAction({ action: "create", input: createInput(data) });
    setCreating(false);
  }

  return <details className="runtime-profiles-panel">
    <summary><span>Profiles</span><strong>{selected?.profile.name ?? "None selected"}</strong></summary>
    <div className="runtime-profile-body">
      <header><label><span className="sr-only">Search runtime profiles</span><input type="search" placeholder="Search profiles" value={query} onChange={(event) => setQuery(event.target.value)} /></label><button type="button" onClick={() => setCreating((value) => !value)}><Plus size={13} />New</button></header>
      {props.error ? <p className="runtime-switch-error" role="alert">{props.error}</p> : null}
      {creating ? <form className="runtime-profile-form" onSubmit={create}>
        <label>ID<input name="id" required pattern="[a-z0-9._-]+" /></label><label>Name<input name="name" required /></label>
        <label>Engine<select name="backend" defaultValue="llama_cpp"><option value="llama_cpp">llama.cpp</option><option value="mlx">MLX</option><option value="vllm">vLLM</option><option value="sglang">SGLang</option></select></label>
        <label>Model path<input name="modelPath" required /></label><label>Model bytes<input name="modelBytes" type="number" min="1" required /></label><label>Available memory<input name="availableMemoryBytes" type="number" min="1" defaultValue={props.payload?.host.memoryBytes} required /></label>
        <details><summary>Advanced controls</summary><div>
          <label>Host<input name="host" defaultValue="127.0.0.1" /></label><label>Port<input name="port" type="number" defaultValue="8129" /></label>
          <label>Context<input name="contextTokens" type="number" defaultValue="32768" /></label><label>Threads<input name="threads" type="number" min="1" /></label>
          <label>GPU layers<input name="gpuLayers" type="number" min="0" /></label><label>Batch size<input name="batchSize" type="number" min="1" /></label>
          <label>Parallel slots<input name="parallel" type="number" min="1" defaultValue="1" /></label><label>Flash attention<select name="flashAttention" defaultValue=""><option value="">Engine default</option><option value="on">On</option><option value="off">Off</option></select></label>
          <label>Environment references<textarea name="environment" placeholder="MODEL_TOKEN=secret://runtime/model-token" /></label><label>Extra arguments<textarea name="extraArgs" placeholder="--custom-kernel=1" /></label>
          <label>Compatible platforms<input name="platforms" placeholder="darwin, linux" /></label><label>Compatible architectures<input name="architectures" placeholder="arm64, x64" /></label>
          <label>Policy<select name="policyScope" defaultValue="ask"><option value="ask">Ask</option><option value="approve">Approve safe</option><option value="full">Full access</option></select></label>
          <fieldset><legend>Explicit reviews</legend><label><input name="reviewUnknown" type="checkbox" />Unknown flags reviewed</label><label><input name="reviewRemoteBind" type="checkbox" />Remote bind reviewed</label><label><input name="reviewContractOnly" type="checkbox" />Contract-only backend reviewed</label></fieldset>
        </div></details>
        <div><button type="submit" disabled={props.pending}>Create profile</button><button type="button" onClick={() => setCreating(false)}>Cancel</button></div>
      </form> : null}
      {!props.payload ? <p>Loading profiles…</p> : null}
      {props.payload && !filtered.length ? <p>No matching runtime profiles.</p> : null}
      <ul className="runtime-profile-list">{filtered.map((item) => <li key={item.profile.id}><button type="button" aria-pressed={item.profile.id === inspected?.profile.id} onClick={() => setInspectId(item.profile.id)}><span>{item.profile.name}<small>{item.profile.backend} · {formatBytes(item.profile.model.bytes)}</small></span>{item.profile.id === props.payload?.selectedId ? <Check size={14} aria-label="Selected" /> : null}</button></li>)}</ul>
      {inspected ? <ProfileEvidence item={inspected} selected={inspected.profile.id === props.payload?.selectedId} pending={props.pending} onAction={props.onAction} /> : null}
      <label className="runtime-profile-import"><Upload size={13} />Import<input type="file" accept="application/json,.json" onChange={(event) => void importFile(event.currentTarget.files?.[0], props.onAction)} /></label>
    </div>
  </details>;
}

function ProfileEvidence(props: { item: RuntimeProfileItem; selected: boolean; pending?: boolean; onAction: (action: ProfileAction) => void | Promise<void> }) {
  const item = props.item;
  return <section className="runtime-profile-evidence" aria-label={`Runtime profile ${item.profile.name}`}>
    <div><strong>{item.profile.name}</strong><span>{item.validation.valid ? "Ready on this host" : "Needs review"} · {item.profile.policyScope}</span></div>
    <pre><code>{[item.preview.command, ...item.preview.args].join(" ")}</code></pre>
    <p className={item.preview.resource.fits ? "tone-good" : "tone-bad"}>{formatBytes(item.preview.resource.estimatedMemoryBytes)} estimated · {formatBytes(item.preview.resource.availableMemoryBytes)} available</p>
    {item.validation.issues.map((entry) => <p key={`${entry.code}-${entry.field}`} className="runtime-profile-issue">{entry.message} {entry.recovery}</p>)}
    <div><button type="button" disabled={props.selected || !item.validation.valid || props.pending} onClick={() => void props.onAction({ action: "select", id: item.profile.id })}>{props.selected ? "Selected" : "Use profile"}</button><button type="button" disabled={props.pending} onClick={() => void props.onAction({ action: "clone", id: item.profile.id, newId: `${item.profile.id}-copy`, name: `${item.profile.name} copy` })}><Copy size={13} />Clone</button><button type="button" disabled={props.pending} onClick={() => void props.onAction({ action: "export", id: item.profile.id })}><Download size={13} />Export</button></div>
  </section>;
}

function createInput(data: FormData): Record<string, unknown> {
  const performance = compact({ threads: positive(data, "threads"), gpuLayers: nonNegative(data, "gpuLayers"), batchSize: positive(data, "batchSize"), parallel: positive(data, "parallel"), flashAttention: flash(data) });
  const platforms = csv(data, "platforms"); const architectures = csv(data, "architectures");
  return {
    id: String(data.get("id")), name: String(data.get("name")), backend: String(data.get("backend")), modelPath: String(data.get("modelPath")),
    modelBytes: Number(data.get("modelBytes")), availableMemoryBytes: Number(data.get("availableMemoryBytes")), host: String(data.get("host")),
    port: Number(data.get("port")), contextTokens: Number(data.get("contextTokens")), policyScope: String(data.get("policyScope")), performance,
    environment: environmentEntries(data), extraArgs: extraArguments(data),
    ...(platforms.length && architectures.length ? { compatibility: { platforms, architectures } } : {}),
    reviewedRemoteBind: data.has("reviewRemoteBind"), reviewedContractOnly: data.has("reviewContractOnly"),
  };
}

function lines(data: FormData, name: string): string[] { return String(data.get(name) ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean); }
function csv(data: FormData, name: string): string[] { return String(data.get(name) ?? "").split(",").map((value) => value.trim()).filter(Boolean); }
function positive(data: FormData, name: string): number | undefined { const value = Number(data.get(name)); return value > 0 ? value : undefined; }
function nonNegative(data: FormData, name: string): number | undefined { const raw = String(data.get(name) ?? ""); const value = Number(raw); return raw && value >= 0 ? value : undefined; }
function flash(data: FormData): boolean | undefined { const value = data.get("flashAttention"); return value === "on" ? true : value === "off" ? false : undefined; }
function compact(input: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)); }
function environmentEntries(data: FormData) { return lines(data, "environment").map((raw) => { const index = raw.indexOf("="); const name = raw.slice(0, index); const value = raw.slice(index + 1); return value.startsWith("secret://") ? { name, secretRef: value } : { name, value }; }); }
function extraArguments(data: FormData) { const reviewed = data.has("reviewUnknown"); return lines(data, "extraArgs").map((raw) => { const index = raw.indexOf("="); return index < 0 ? { flag: raw, reviewed } : { flag: raw.slice(0, index), value: raw.slice(index + 1), reviewed }; }); }

async function importFile(file: File | undefined, action: (value: ProfileAction) => void | Promise<void>) {
  if (!file) return;
  await action({ action: "import", profile: JSON.parse(await file.text()) });
}

function downloadProfile(id: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${id}.json`; anchor.click(); URL.revokeObjectURL(url);
}

function formatBytes(value: number): string { return `${(value / 1024 ** 3).toFixed(1)} GB`; }
