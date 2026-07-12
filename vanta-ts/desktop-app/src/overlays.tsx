import { FormEvent, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { Approval, ApprovalDecision, PermissionSection, Provider, RailTab } from "./types.js";

export function CommandPalette(props: { open: boolean; onClose: () => void; onNew: () => void; onModel: () => void; onSound: () => void; onTab: (tab: RailTab) => void }) {
  const [query, setQuery] = useState("");
  const actions = commandActions(props);
  const visible = useMemo(() => actions.filter(([label]) => label.toLowerCase().includes(query.toLowerCase())), [actions, query]);
  if (!props.open) return null;
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-labelledby="command-title" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-heading"><h2 id="command-title">Command palette</h2><button className="icon-button" type="button" aria-label="Close" onClick={props.onClose}><X size={16} /></button></div>
        <label className="palette-search"><Search size={16} /><span className="sr-only">Search commands</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actions" /></label>
        <div className="palette-actions">{visible.map(([label, action]) => <button key={label} type="button" onClick={() => { action(); props.onClose(); }}>{label}</button>)}</div>
        {visible.length === 0 ? <p className="muted">No matching action.</p> : null}
      </div>
    </div>
  );
}

function commandActions(props: { onNew: () => void; onModel: () => void; onSound: () => void; onTab: (tab: RailTab) => void }) {
  return [
    ["New session", props.onNew],
    ["Model picker", props.onModel],
    ["Completion sound", props.onSound],
    ["Canvas", () => props.onTab("canvas")],
    ["Files", () => props.onTab("files")],
    ["Terminal", () => props.onTab("terminal")],
  ] as const;
}

export function ModelPicker(props: { open: boolean; models: Provider[]; onClose: () => void; onSelect: (provider: string, model: string, scope?: "session" | "global") => void }) {
  if (!props.open) return null;
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="palette model-grid" role="dialog" aria-modal="true" aria-labelledby="model-title" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-heading"><h2 id="model-title">Models for this session</h2><button className="icon-button" type="button" aria-label="Close" onClick={props.onClose}><X size={16} /></button></div>
        {props.models.flatMap((p) => p.models.map((model) => <ModelButton key={`${p.id}:${model}`} provider={p} model={model} onSelect={props.onSelect} />))}
      </div>
    </div>
  );
}

function ModelButton(props: { provider: Provider; model: string; onSelect: (provider: string, model: string, scope?: "session" | "global") => void }) {
  return <div className="model-choice">
    <button type="button" onClick={() => props.onSelect(props.provider.id, props.model, "session")}>{props.provider.short} · {props.model}</button>
    <button type="button" className="model-default" onClick={() => props.onSelect(props.provider.id, props.model, "global")}>Set as default</button>
  </div>;
}

export function SetupWizard(props: { open: boolean; models: Provider[]; onClose: () => void; onSave: (provider: string, model: string, apiKey: string) => Promise<void> }) {
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const provider = props.models.find((item) => item.id === providerId) ?? props.models[0];
  useEffect(() => {
    if (!props.open || providerId || !props.models[0]) return;
    setProviderId(props.models[0].id); setModel(props.models[0].defaultModel ?? props.models[0].models[0] ?? "");
  }, [props.open, props.models, providerId]);
  if (!props.open) return null;
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { await props.onSave(provider?.id ?? "", model, apiKey); setApiKey(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  }
  return <div className="overlay" onClick={props.onClose}>
    <form className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <div className="dialog-heading"><div><p className="eyebrow">First run</p><h2 id="setup-title">Connect a model</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={props.onClose}><X size={16} /></button></div>
      <label>Provider<select value={provider?.id ?? ""} onChange={(event) => { const next = props.models.find((item) => item.id === event.target.value); setProviderId(event.target.value); setModel(next?.defaultModel ?? next?.models[0] ?? ""); setApiKey(""); }}>{props.models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Model<input list="setup-models" value={model} onChange={(event) => setModel(event.target.value)} /></label>
      <datalist id="setup-models">{provider?.models.map((item) => <option key={item} value={item} />)}</datalist>
      {provider?.requiresKey ? <label>API key<input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} required /></label> : null}
      {provider?.note ? <p className="muted">{provider.note}</p> : null}
      {provider?.signupUrl ? <a href={provider.signupUrl} target="_blank" rel="noreferrer">Get an API key</a> : null}
      {error ? <p className="setup-error" role="alert">{error}</p> : null}
      <div className="dialog-actions"><button type="button" onClick={props.onClose}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Connecting…" : "Connect"}</button></div>
    </form>
  </div>;
}

export function ApprovalOverlay(props: { approval: Approval | null; onAnswer: (decision: ApprovalDecision) => void }) {
  if (!props.approval) return null;
  const request = props.approval.request;
  return (
    <div className="overlay">
      <div className={`approval ${request?.kind ?? "generic"}`}>
        <h2>{request?.title ?? "Approval Needed"}</h2>
        <p className="approval-subject">{request?.subject ?? props.approval.action}</p>
        <p>{request?.reason ?? props.approval.reason}</p>
        {(request?.sections ?? fallbackSections(props.approval)).map((section) => <ApprovalSection key={section.label} section={section} />)}
        <div>
          <button type="button" onClick={() => props.onAnswer("deny")}>Deny</button>
          <button type="button" onClick={() => props.onAnswer("allow")}>Allow once</button>
          <button type="button" className="secondary-risk" onClick={() => props.onAnswer("never")}>Never allow</button>
          <button type="button" className="secondary-risk" onClick={() => props.onAnswer("always")}>Always allow</button>
        </div>
      </div>
    </div>
  );
}

function ApprovalSection({ section }: { section: PermissionSection }) {
  return <p className={`approval-section ${section.tone ?? ""}`}><strong>{section.label}</strong><code>{section.value}</code></p>;
}

function fallbackSections(approval: Approval): PermissionSection[] {
  return [{ label: "Action", value: approval.action, tone: "code" }];
}
