import { useEffect, useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { Bot, Check, Command, KeyRound, MonitorCog, RefreshCw, Search, ShieldCheck, Star, X } from "lucide-react";
import type { Approval, ApprovalDecision, PermissionSection, Provider, RailTab, Status } from "./types.js";

export function CommandPalette(props: { open: boolean; onClose: () => void; onNew: () => void; onModel: () => void; onSound: () => void; onSettings: () => void; onTab: (tab: RailTab) => void }) {
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

export type NewTaskDraft = { agent: string; host: string; folder: string; branch: string; model: string; prompt: string; worktree: boolean; approvals: boolean };

export function NewTaskDialog(props: { open: boolean; root?: string; model?: string; onClose: () => void; onCreate: (draft: NewTaskDraft) => void }) {
  const [draft, setDraft] = useState<NewTaskDraft>(() => ({ agent: "Operator", host: "Local Mac", folder: props.root ?? "", branch: "main", model: props.model ?? "", prompt: "", worktree: true, approvals: true }));
  useEffect(() => {
    if (!props.open) return;
    setDraft((current) => ({ ...current, folder: props.root ?? current.folder, model: props.model ?? current.model }));
  }, [props.model, props.open, props.root]);
  if (!props.open) return null;
  const set = <K extends keyof NewTaskDraft>(key: K, value: NewTaskDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  return <div className="overlay" onClick={props.onClose}><form className="new-task-dialog" role="dialog" aria-modal="true" aria-labelledby="new-task-title" onSubmit={(event) => { event.preventDefault(); props.onCreate(draft); }} onClick={(event) => event.stopPropagation()}>
    <div className="dialog-heading"><div><p className="eyebrow">Work contract</p><h2 id="new-task-title">Start a new task</h2></div><button className="icon-button" type="button" aria-label="Close new task" onClick={props.onClose}><X size={16} /></button></div>
    <p className="dialog-copy">Choose where the work runs before the first message. The session starts only when you create it.</p>
    <div className="new-task-grid">
      <label>Agent<select value={draft.agent} onChange={(event) => set("agent", event.target.value)}><option>Operator</option><option>Researcher</option><option>Verifier</option><option>Sentinel</option></select></label>
      <label>Execution host<select value={draft.host} onChange={(event) => set("host", event.target.value)}><option>Local Mac</option><option>Gateway</option><option>Remote worker</option></select></label>
      <label className="wide">Project folder<input value={draft.folder} onChange={(event) => set("folder", event.target.value)} /></label>
      <label>Base branch<input value={draft.branch} onChange={(event) => set("branch", event.target.value)} /></label>
      <label>Model<input value={draft.model} onChange={(event) => set("model", event.target.value)} /></label>
      <label className="wide">First instruction<textarea autoFocus value={draft.prompt} onChange={(event) => set("prompt", event.target.value)} placeholder="What should Vanta handle?" /></label>
    </div>
    <label className="task-toggle"><input type="checkbox" checked={draft.worktree} onChange={(event) => set("worktree", event.target.checked)} /><span><strong>Use isolated worktree</strong><small>Create a reversible branch for this task.</small></span></label>
    <label className="task-toggle"><input type="checkbox" checked={draft.approvals} onChange={(event) => set("approvals", event.target.checked)} /><span><strong>Ask before consequential actions</strong><small>Show the exact command or diff before execution.</small></span></label>
    <div className="dialog-actions"><button type="button" onClick={props.onClose}>Cancel</button><button className="primary" type="submit">Create and run</button></div>
  </form></div>;
}

function commandActions(props: { onNew: () => void; onModel: () => void; onSound: () => void; onSettings: () => void; onTab: (tab: RailTab) => void }) {
  return [
    ["New session", props.onNew],
    ["Model picker", props.onModel],
    ["Completion sound", props.onSound],
    ["Settings", props.onSettings],
    ["Outputs", () => props.onTab("outputs")],
    ["Canvas", () => props.onTab("canvas")],
    ["Files", () => props.onTab("files")],
    ["Terminal", () => props.onTab("terminal")],
  ] as const;
}

export function KeyboardShortcuts(props: { open: boolean; onClose: () => void }) {
  if (!props.open) return null;
  const command = navigator.platform.toLowerCase().includes("mac") ? "Command" : "Ctrl";
  const rows = [
    [`${command} N`, "New session"], [`${command} K`, "Command palette"], ["?", "Keyboard shortcuts"], ["Esc", "Close the active dialog"], ["Enter", "Send message"], ["Shift Enter", "Insert newline"], ["@", "Attach a project file"], ["/", "Open quick actions"],
  ];
  return <div className="overlay" onClick={props.onClose}><section className="palette shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" onClick={(event) => event.stopPropagation()}>
    <div className="dialog-heading"><div><p className="eyebrow">Desktop controls</p><h2 id="shortcuts-title">Keyboard shortcuts</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={props.onClose}><X size={16} /></button></div>
    <div className="shortcut-list">{rows.map(([keys, label]) => <div key={label}><span>{label}</span><kbd>{keys}</kbd></div>)}</div>
  </section></div>;
}

export function SettingsDialog(props: { open: boolean; models: Provider[]; status: Status | null; theme: "dark" | "light"; onTheme: (theme: "dark" | "light") => void; onClose: () => void; onModel: () => void; onSetup: () => void }) {
  const [section, setSection] = useState<"model" | "appearance" | "safety" | "workspace">("model");
  if (!props.open) return null;
  const current = props.models.find((provider) => provider.id === props.status?.provider);
  return <div className="overlay" onClick={props.onClose}><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
    <header className="dialog-heading"><div><p className="eyebrow">Vanta desktop</p><h2 id="settings-title">Settings</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={props.onClose}><X size={16} /></button></header>
    <nav className="settings-nav" aria-label="Settings sections"><button className={section === "model" ? "active" : ""} type="button" onClick={() => setSection("model")}><Bot size={16} />Model</button><button className={section === "appearance" ? "active" : ""} type="button" onClick={() => setSection("appearance")}><MonitorCog size={16} />Appearance</button><button className={section === "safety" ? "active" : ""} type="button" onClick={() => setSection("safety")}><ShieldCheck size={16} />Safety</button><button className={section === "workspace" ? "active" : ""} type="button" onClick={() => setSection("workspace")}><KeyRound size={16} />Workspace</button></nav>
    <div className="settings-content">
      {section === "model" ? <><section><p className="eyebrow">Model</p><h3>{props.status?.model ?? "No model selected"}</h3><p>{current?.label ?? "Choose a provider"} · applies to the active session unless you set a default in the picker.</p><button type="button" onClick={props.onModel}>Change model</button></section><section><p className="eyebrow">Providers</p><h3>{props.models.length} available providers</h3><p>Connect or change a provider through Vanta’s local setup flow. Keys are stored in the project’s local configuration.</p><button type="button" onClick={props.onSetup}>Connect provider</button></section></> : null}
      {section === "appearance" ? <section><p className="eyebrow">Appearance</p><h3>Desktop theme</h3><p>Use the calm light workspace or Vanta's default dark operator theme. This setting stays on this device.</p><div className="theme-picker" role="group" aria-label="Desktop theme"><button className={props.theme === "dark" ? "active" : ""} type="button" onClick={() => props.onTheme("dark")}>Dark</button><button className={props.theme === "light" ? "active" : ""} type="button" onClick={() => props.onTheme("light")}>Light</button></div></section> : null}
      {section === "safety" ? <section><p className="eyebrow">Safety</p><h3>Kernel {props.status?.kernel ?? "checking"}</h3><p>Requests that cross Vanta’s kernel boundary still require the configured approval policy.</p></section> : null}
      {section === "workspace" ? <section><p className="eyebrow">Workspace</p><h3>{props.status?.root?.split("/").filter(Boolean).at(-1) ?? "Current project"}</h3><p>{props.status?.root ?? "Project path unavailable"}</p></section> : null}
    </div>
  </section></div>;
}

export function ModelPicker(props: { open: boolean; models: Provider[]; status: Status | null; onClose: () => void; onRefresh: (provider: string) => Promise<void>; onSelect: (provider: string, model: string, scope?: "session" | "global") => void }) {
  const [query, setQuery] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!props.open) return;
    const providerId = props.status?.provider ?? props.models.find((provider) => provider.current)?.id ?? props.models[0]?.id ?? "";
    setQuery("");
    setCustomModel("");
    setSelectedProviderId(providerId);
    if (providerId) {
      setRefreshing(true);
      void props.onRefresh(providerId).finally(() => setRefreshing(false));
    }
  }, [props.open]);
  if (!props.open) return null;
  const matchingProviders = filterProviders(props.models, query);
  const activeProvider = matchingProviders.find((provider) => provider.id === selectedProviderId)
    ?? matchingProviders.find((provider) => provider.id === props.status?.provider)
    ?? matchingProviders[0];
  const visibleModels = activeProvider ? filterModels(activeProvider, query) : [];
  async function refreshSelected() {
    if (!activeProvider || !activeProvider.discoveryAvailable) return;
    setRefreshing(true);
    try { await props.onRefresh(activeProvider.id); }
    finally { setRefreshing(false); }
  }
  function chooseCustom(event: FormEvent) {
    event.preventDefault();
    const model = customModel.trim();
    if (activeProvider && model) props.onSelect(activeProvider.id, model, "session");
  }
  function navigateProviders(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-provider-id]")];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = buttons[(Math.max(0, current) + delta + buttons.length) % buttons.length];
    if (!next) return;
    event.preventDefault();
    setSelectedProviderId(next.dataset.providerId ?? "");
    next.focus();
  }
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="palette model-picker" role="dialog" aria-modal="true" aria-labelledby="model-title" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-heading"><div><p className="eyebrow">Active task</p><h2 id="model-title">Models for this task</h2></div><button className="icon-button" type="button" aria-label="Close model picker" onClick={props.onClose}><X size={16} /></button></div>
        <label className="palette-search model-search"><Search size={16} /><span className="sr-only">Search provider or model</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search provider or model" /></label>
        <div className="model-picker-body">
          <nav className="model-provider-nav" aria-label="Model providers" onKeyDown={navigateProviders}>
            {matchingProviders.map((provider) => <button key={provider.id} data-provider-id={provider.id} className={provider.id === activeProvider?.id ? "active" : ""} type="button" onClick={() => setSelectedProviderId(provider.id)}>
              <span><strong>{provider.short || provider.label}</strong>{provider.current ? <small>Default provider</small> : null}</span>
              <b>{filterModels(provider, query).length}</b>
            </button>)}
          </nav>
          <section className="model-provider-detail" aria-live="polite">
            {activeProvider ? <>
              <header className="model-detail-heading">
                <div><h3>{activeProvider.label}</h3><p>{activeProvider.modelSource === "live" ? "Live provider models" : "Vanta catalog"}</p></div>
                <button className="icon-button" type="button" onClick={() => void refreshSelected()} disabled={!activeProvider.discoveryAvailable || refreshing} aria-label={`Refresh ${activeProvider.label} models`} title={activeProvider.discoveryAvailable ? "Refresh models from provider" : "Connect this provider to load live models"}><RefreshCw size={15} className={refreshing ? "spinning" : ""} /></button>
              </header>
              {activeProvider.discoveryError ? <p className="model-discovery-error" role="status">{activeProvider.discoveryError} Showing the offline catalog.</p> : null}
              <div className="model-rows">{visibleModels.map((model) => <ModelRow key={model} provider={activeProvider} model={model} status={props.status} onSelect={props.onSelect} />)}</div>
              {visibleModels.length === 0 ? <p className="muted model-empty">No matching models for this provider.</p> : null}
              <form className="custom-model" onSubmit={chooseCustom}><label htmlFor="custom-model-id">Use another model ID</label><div><input id="custom-model-id" value={customModel} onChange={(event) => setCustomModel(event.target.value)} placeholder="provider model ID" /><button type="submit" disabled={!customModel.trim()}>Use</button></div></form>
            </> : <p className="muted model-empty">No matching providers or models.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

export function filterModels(provider: Provider, query: string): string[] {
  const normalized = query.trim().toLowerCase();
  return provider.models.filter((model) => !normalized || `${provider.label} ${provider.short} ${model}`.toLowerCase().includes(normalized));
}

export function filterProviders(providers: Provider[], query: string): Provider[] {
  const normalized = query.trim().toLowerCase();
  return providers.filter((provider) => filterModels(provider, query).length > 0 || `${provider.label} ${provider.short}`.toLowerCase().includes(normalized));
}

function ModelRow(props: { provider: Provider; model: string; status: Status | null; onSelect: (provider: string, model: string, scope?: "session" | "global") => void }) {
  const selected = props.status?.provider === props.provider.id && props.status?.model === props.model;
  const savedDefault = props.provider.current && props.provider.savedDefaultModel === props.model;
  return <div className={`model-row${selected ? " selected" : ""}`}>
    <button className="model-select" type="button" onClick={() => props.onSelect(props.provider.id, props.model, "session")} aria-pressed={selected}>
      <span className="model-name">{props.model}</span>
      <span className="model-badges">{selected ? <span className="model-active"><Check size={14} />Current</span> : null}{savedDefault ? <span className="model-saved"><Star size={12} fill="currentColor" />Default</span> : null}</span>
    </button>
    <button className={`icon-button model-default${savedDefault ? " saved" : ""}`} type="button" onClick={() => props.onSelect(props.provider.id, props.model, "global")} aria-label={savedDefault ? `${props.provider.label} ${props.model} is the default` : `Set ${props.provider.label} ${props.model} as default`} title={savedDefault ? "Default for new sessions" : "Set as default"}><Star size={15} fill={savedDefault ? "currentColor" : "none"} /></button>
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
