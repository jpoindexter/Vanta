import { useEffect, useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { Bot, Check, ChevronRight, Command, FolderOpen, KeyRound, MonitorCog, RefreshCw, Search, ShieldCheck, Star, X } from "lucide-react";
import type { Approval, ApprovalDecision, DesktopTheme, DesktopView, ModelEffort, PermissionSection, Provider, ProviderModelSettings, ProviderSpeed, Status } from "./types.js";
import { ConfirmationActions, ControlButton, InlineError, LoadingIndicator, StyledSelect, TextField } from "./form-controls.js";
import { pickDesktopProjectFolder } from "./project-folder-picker.js";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onReview: () => void;
  onSidebar: () => void;
  onCycleMode: () => void;
  onView: (view: DesktopView) => void;
  onModel: () => void;
  onTelegram: () => void;
  onSound: () => void;
  onSettings: () => void;
};

export function CommandPalette(props: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const actions = commandActions(props);
  const visible = useMemo(() => actions.filter(([label]) => label.toLowerCase().includes(query.toLowerCase())), [actions, query]);
  if (!props.open) return null;
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-labelledby="command-title" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-heading"><h2 id="command-title">Commands</h2><button className="icon-button" type="button" aria-label="Close" onClick={props.onClose}><X size={16} /></button></div>
        <label className="palette-search"><Search size={16} /><span className="sr-only">Search commands</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands…" /></label>
        <div className="palette-actions">{visible.map(([label, action], index) => <button key={label} type="button" onClick={() => { action(); props.onClose(); }}><span>{String(index + 1).padStart(2, "0")}</span><strong>{label}</strong><kbd>↵</kbd></button>)}</div>
        {visible.length === 0 ? <p className="muted">No matching action.</p> : null}
      </div>
    </div>
  );
}

export type NewTaskDraft = { agent: string; host: string; folder: string; branch: string; model: string; prompt: string; worktree: boolean; approvals: boolean };

export function NewTaskDialog(props: { open: boolean; root?: string; model?: string; initialDraft?: NewTaskDraft; initialError?: string; onClose: () => void; onCreate: (draft: NewTaskDraft) => void | Promise<void> }) {
  const [draft, setDraft] = useState<NewTaskDraft>(() => ({ agent: "Operator", host: "Local Mac", folder: props.root ?? "", branch: "main", model: props.model ?? "", prompt: "", worktree: true, approvals: true }));
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  useEffect(() => {
    if (!props.open) return;
    setDraft((current) => props.initialDraft ?? ({ ...current, folder: props.root ?? current.folder, model: props.model ?? current.model }));
    setFolderError("");
    setSubmitError(props.initialError ?? "");
  }, [props.initialDraft, props.initialError, props.model, props.open, props.root]);
  if (!props.open) return null;
  const set = <K extends keyof NewTaskDraft>(key: K, value: NewTaskDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  async function chooseFolder() {
    setChoosingFolder(true);
    setFolderError("");
    try {
      const folder = await pickDesktopProjectFolder(draft.folder);
      if (folder) set("folder", folder);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Vanta could not open the folder picker.");
    } finally {
      setChoosingFolder(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await props.onCreate(draft);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Vanta could not create the task.");
      setSubmitting(false);
    }
  }
  return <div className="overlay" onClick={() => { if (!submitting) props.onClose(); }}><form className="new-task-dialog" role="dialog" aria-modal="true" aria-labelledby="new-task-title" aria-busy={submitting} onSubmit={(event) => { void submit(event); }} onClick={(event) => event.stopPropagation()}>
    <div className="dialog-heading"><div><p className="eyebrow">Work contract</p><h2 id="new-task-title">Start a new task</h2></div><button className="icon-button" type="button" aria-label="Close new task" onClick={props.onClose} disabled={submitting}><X size={16} /></button></div>
    <p className="dialog-copy">Choose where the work runs before the first message. The session starts only when you create it.</p>
    <div className="new-task-grid">
      <label>Agent<StyledSelect value={draft.agent} onChange={(event) => set("agent", event.target.value)}><option>Operator</option><option>Researcher</option><option>Verifier</option><option>Sentinel</option></StyledSelect></label>
      <label>Execution host<StyledSelect value={draft.host} onChange={(event) => set("host", event.target.value)}><option>Local Mac</option><option>Gateway</option><option>Remote worker</option></StyledSelect></label>
      <div className="wide form-field">
        <label htmlFor="new-task-folder">Project folder</label>
        <div className="folder-picker-control">
          <input id="new-task-folder" value={draft.folder} readOnly aria-describedby={folderError ? "new-task-folder-error" : undefined} />
          <button type="button" onClick={() => void chooseFolder()} disabled={choosingFolder || submitting} aria-label="Choose project folder">
            <FolderOpen size={15} aria-hidden="true" />{choosingFolder ? "Opening…" : "Choose…"}
          </button>
        </div>
        {folderError ? <small id="new-task-folder-error" className="form-error" role="alert">{folderError}</small> : null}
      </div>
      <label>Base branch<input value={draft.branch} onChange={(event) => set("branch", event.target.value)} /></label>
      <label>Model<input value={draft.model} onChange={(event) => set("model", event.target.value)} /></label>
      <label className="wide">First instruction<textarea autoFocus value={draft.prompt} onChange={(event) => set("prompt", event.target.value)} placeholder="What should Vanta handle?" /></label>
    </div>
    <label className="task-toggle"><input type="checkbox" checked={draft.worktree} onChange={(event) => set("worktree", event.target.checked)} /><span><strong>Use isolated worktree</strong><small>Create a reversible branch for this task.</small></span></label>
    <label className="task-toggle"><input type="checkbox" checked={draft.approvals} onChange={(event) => set("approvals", event.target.checked)} /><span><strong>Ask before consequential actions</strong><small>Show the exact command or diff before execution.</small></span></label>
    {submitError ? <p className="form-error" role="alert">{submitError}</p> : null}
    <div className="dialog-actions"><button type="button" onClick={props.onClose} disabled={submitting}>Cancel</button><button className="primary" type="submit" disabled={submitting}>{submitting ? "Switching project…" : "Create and run"}</button></div>
  </form></div>;
}

function commandActions(props: CommandPaletteProps) {
  return [
    ["New task", props.onNew],
    ["Open Review", props.onReview],
    ["Cycle operating mode", props.onCycleMode],
    ["Toggle task sidebar", props.onSidebar],
    ["Open Today", () => props.onView("operate")],
    ["Open Connect", () => props.onView("connect")],
    ["Open Scheduled", () => props.onView("scheduled")],
    ["Open Plugins", () => props.onView("plugins")],
    ["Choose model", props.onModel],
    ["Set up Telegram", props.onTelegram],
    ["Completion sound", props.onSound],
    ["Settings", props.onSettings],
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

export function SettingsDialog(props: { open: boolean; models: Provider[]; status: Status | null; theme: DesktopTheme; fullAccessWarningAcknowledged: boolean; onResetFullAccessWarning: () => void; onTheme: (theme: DesktopTheme) => void; onClose: () => void; onModel: () => void; onSetup: () => void }) {
  const [section, setSection] = useState<"model" | "appearance" | "safety" | "workspace">("model");
  if (!props.open) return null;
  const current = props.models.find((provider) => provider.id === props.status?.provider);
  return <div className="overlay" onClick={props.onClose}><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
    <header className="dialog-heading"><div><p className="eyebrow">Vanta desktop</p><h2 id="settings-title">Settings</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={props.onClose}><X size={16} /></button></header>
    <nav className="settings-nav" aria-label="Settings sections"><button className={section === "model" ? "active" : ""} type="button" onClick={() => setSection("model")}><Bot size={16} />Model</button><button className={section === "appearance" ? "active" : ""} type="button" onClick={() => setSection("appearance")}><MonitorCog size={16} />Appearance</button><button className={section === "safety" ? "active" : ""} type="button" onClick={() => setSection("safety")}><ShieldCheck size={16} />Safety</button><button className={section === "workspace" ? "active" : ""} type="button" onClick={() => setSection("workspace")}><KeyRound size={16} />Workspace</button></nav>
    <div className="settings-content">
      {section === "model" ? <><section><p className="eyebrow">Model</p><h3>{props.status?.model ?? "No model selected"}</h3><p>{current?.label ?? "Choose a provider"} · applies to the active session unless you set a default in the picker.</p><button type="button" onClick={props.onModel}>Change model</button></section><section><p className="eyebrow">Providers</p><h3>{props.models.length} available providers</h3><p>Connect or change a provider through Vanta’s local setup flow. Keys are stored in the project’s local configuration.</p><button type="button" onClick={props.onSetup}>Connect provider</button></section></> : null}
      {section === "appearance" ? <section><p className="eyebrow">Appearance</p><h3>Desktop theme</h3><p>Use Vanta's ghost palette: black, bone white, and neutral gray. Color appears only when a status needs attention.</p><div className="theme-picker" role="group" aria-label="Desktop theme"><button className={props.theme === "dark" ? "active" : ""} type="button" onClick={() => props.onTheme("dark")}>Ghost dark</button><button className={props.theme === "light" ? "active" : ""} type="button" onClick={() => props.onTheme("light")}>Ghost light</button></div></section> : null}
      {section === "safety" ? <SafetySettings status={props.status} warningAcknowledged={props.fullAccessWarningAcknowledged} onResetWarning={props.onResetFullAccessWarning} /> : null}
      {section === "workspace" ? <section><p className="eyebrow">Workspace</p><h3>{props.status?.root?.split("/").filter(Boolean).at(-1) ?? "Current project"}</h3><p>{props.status?.root ?? "Project path unavailable"}</p></section> : null}
    </div>
  </section></div>;
}

function SafetySettings(props: { status: Status | null; warningAcknowledged: boolean; onResetWarning: () => void }) {
  return <section><p className="eyebrow">Safety</p><h3>Kernel {props.status?.kernel ?? "checking"}</h3><p>Requests that cross Vanta’s kernel boundary still require the configured approval policy.</p>
    <div className="safety-warning-control"><strong>Full access warning</strong><p>{props.warningAcknowledged ? "Acknowledged for this project and risk version." : "Shown when Full access is selected."}</p>{props.warningAcknowledged ? <button type="button" onClick={props.onResetWarning}>Show warning again</button> : null}</div>
  </section>;
}

export function ModelPicker(props: { open: boolean; models: Provider[]; status: Status | null; onClose: () => void; onRefresh: (provider: string) => Promise<void>; onSelect: (provider: string, model: string, scope?: "session" | "global") => void; onSettings: (settings: ProviderModelSettings, scope?: "session" | "global") => Promise<void> }) {
  const currentProvider = props.models.find((provider) => provider.id === props.status?.provider);
  const [view, setView] = useState<"settings" | "browser">(() => currentProvider ? "settings" : "browser");
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
    setView(currentProvider ? "settings" : "browser");
    if (!currentProvider && providerId) {
      setRefreshing(true);
      void props.onRefresh(providerId).finally(() => setRefreshing(false));
    }
  }, [props.open]);
  if (!props.open) return null;
  function close() {
    setView(currentProvider ? "settings" : "browser");
    props.onClose();
  }
  if (view === "settings" && currentProvider && props.status) {
    const providerName = currentProvider.short || currentProvider.label;
    return <div className="model-popover-layer" onClick={close}>
      <section className="model-settings-popover" role="dialog" aria-labelledby="model-settings-title" onClick={(event) => event.stopPropagation()}>
        <header className="model-settings-popover-heading"><div><p className="eyebrow">Current provider</p><h2 id="model-settings-title">{providerName} settings</h2></div><button className="icon-button" type="button" aria-label="Close model settings" onClick={close}><X size={16} /></button></header>
        <button className="model-settings-row" type="button" autoFocus onClick={() => setView("browser")}><span>Model</span><strong>{props.status.model}</strong><ChevronRight size={15} aria-hidden="true" /></button>
        <ProviderSettingsControls compact provider={currentProvider} status={props.status} onSettings={props.onSettings} />
        <button className="model-settings-browse" type="button" onClick={() => setView("browser")}>Browse providers and models<ChevronRight size={15} aria-hidden="true" /></button>
      </section>
    </div>;
  }
  const matchingProviders = filterProviders(props.models, query);
  const activeProvider = matchingProviders.find((provider) => provider.id === selectedProviderId)
    ?? matchingProviders.find((provider) => provider.id === props.status?.provider)
    ?? matchingProviders[0];
  const visibleModels = activeProvider ? filterModels(activeProvider, query) : [];
  // Claude-CLI style: after picking a model, drill into its settings view (effort /
  // speed) instead of closing. A model with no tunable controls has nothing to
  // tune, so close the picker as before. A "global" pick (Set as default) also
  // just applies and closes.
  async function selectModel(provider: string, model: string, scope?: "session" | "global") {
    props.onSelect(provider, model, scope);
    const picked = props.models.find((entry) => entry.id === provider);
    const tunable = Boolean(picked?.modelSettings?.effort || picked?.modelSettings?.speed);
    if (scope === "session" && tunable) setView("settings");
    else close();
  }
  async function refreshSelected() {
    if (!activeProvider || !activeProvider.discoveryAvailable) return;
    setRefreshing(true);
    try { await props.onRefresh(activeProvider.id); }
    finally { setRefreshing(false); }
  }
  function chooseCustom(event: FormEvent) {
    event.preventDefault();
    const model = customModel.trim();
    if (activeProvider && model) void selectModel(activeProvider.id, model, "session");
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
    <div className="overlay" onClick={close}>
      <div className="palette model-picker" role="dialog" aria-modal="true" aria-labelledby="model-title" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-heading model-picker-heading"><div>{currentProvider ? <button className="model-picker-back" type="button" onClick={() => setView("settings")}>Back to {currentProvider.short || currentProvider.label} settings</button> : null}<h2 id="model-title">Choose a model</h2><p>Choose a model and tune the controls supported by its provider.</p></div><button className="icon-button" type="button" aria-label="Close model picker" onClick={close}><X size={16} /></button></div>
        <label className="palette-search model-search"><Search size={16} /><span className="sr-only">Search models and providers</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models and providers" /></label>
        <div className="model-picker-body">
          <nav className="model-provider-nav" role="tablist" aria-label="Model providers" aria-orientation="vertical" onKeyDown={navigateProviders}>
            {matchingProviders.map((provider) => <button key={provider.id} role="tab" aria-selected={provider.id === activeProvider?.id} data-provider-id={provider.id} className={provider.id === activeProvider?.id ? "active" : ""} type="button" onClick={() => setSelectedProviderId(provider.id)}>
              <span><strong>{provider.short || provider.label}</strong>{provider.current ? <small>Default</small> : <small>{provider.modelSource === "live" ? "Live catalog" : "Catalog"}</small>}</span>
              <b>{filterModels(provider, query).length}</b>
            </button>)}
          </nav>
          <section className="model-provider-detail" aria-live="polite">
            {activeProvider ? <>
              <header className="model-detail-heading">
                <div><h3>{activeProvider.short || activeProvider.label}</h3><p>{visibleModels.length} models · {activeProvider.modelSource === "live" ? "Live provider catalog" : "Vanta catalog"}</p></div>
                <button className="icon-button" type="button" onClick={() => void refreshSelected()} disabled={!activeProvider.discoveryAvailable || refreshing} aria-label={`Refresh ${activeProvider.label} models`} title={activeProvider.discoveryAvailable ? "Refresh models from provider" : "Connect this provider to load live models"}><RefreshCw size={15} className={refreshing ? "spinning" : ""} /></button>
              </header>
              <ProviderSettingsControls provider={activeProvider} status={props.status} onSettings={props.onSettings} />
              {activeProvider.discoveryError ? <p className="model-discovery-error" role="status">{activeProvider.discoveryError} Showing the offline catalog.</p> : null}
              <div className="model-rows" aria-label={`${activeProvider.short || activeProvider.label} models`}>{visibleModels.map((model) => <ModelRow key={model} provider={activeProvider} model={model} status={props.status} onSelect={selectModel} />)}</div>
              {visibleModels.length === 0 ? <p className="muted model-empty">No matching models for this provider.</p> : null}
              <details className="custom-model-disclosure"><summary>Use a model ID that is not listed</summary><form className="custom-model" onSubmit={chooseCustom}><label htmlFor="custom-model-id">Model ID</label><div><input id="custom-model-id" value={customModel} onChange={(event) => setCustomModel(event.target.value)} placeholder="Enter the provider model ID" /><button type="submit" disabled={!customModel.trim()}>Use for task</button></div></form></details>
            </> : <p className="muted model-empty">No matching providers or models.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

const EFFORT_LABELS: Record<ModelEffort, string> = {
  low: "Light",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
  ultra: "Ultra",
};

const SPEED_LABELS: Record<ProviderSpeed, string> = {
  standard: "Standard",
  fast: "Fast",
};

/** The fast-tier tradeoff differs by provider: Anthropic documents up to 2.5×
 *  output tokens/sec for Opus fast mode, Codex 1.5× for its fast service tier. */
export function fastSpeedHint(providerId: string): string {
  return /^(anthropic|claude-code|claude-cli)$/.test(providerId.trim().toLowerCase())
    ? "Up to 2.5× output speed, premium rate"
    : "1.5× speed, increased usage";
}

function settingsForProvider(provider: Provider, status: Status | null): ProviderModelSettings {
  const current = status?.provider === provider.id ? status.modelSettings : undefined;
  return {
    ...(provider.modelSettings?.effort ? { effortLevel: current?.effortLevel ?? provider.modelSettings.effort.defaultValue } : {}),
    ...(provider.modelSettings?.speed ? { speed: current?.speed ?? provider.modelSettings.speed.defaultValue } : {}),
  };
}

function ProviderSettingsControls(props: { compact?: boolean; provider: Provider; status: Status | null; onSettings: (settings: ProviderModelSettings, scope?: "session" | "global") => Promise<void> }) {
  const capabilities = props.provider.modelSettings;
  const [draft, setDraft] = useState<ProviderModelSettings>(() => settingsForProvider(props.provider, props.status));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(settingsForProvider(props.provider, props.status));
    setMessage("");
  }, [props.provider.id, props.status?.provider, props.status?.model]);
  if (!capabilities?.effort && !capabilities?.speed) return null;
  if (props.status?.provider !== props.provider.id) return <section className="provider-settings provider-settings-inactive" aria-label={`${props.provider.label} settings unavailable`}><p>Select a {props.provider.short || props.provider.label} model for this task before tuning its provider controls.</p></section>;

  async function save(next: ProviderModelSettings, scope: "session" | "global") {
    setDraft(next);
    setBusy(true);
    setMessage("");
    try {
      await props.onSettings(next, scope);
      setMessage(scope === "global" ? "Saved as project defaults." : "Applies to the next request.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save model settings.");
    } finally {
      setBusy(false);
    }
  }

  return <section className={`provider-settings${props.compact ? " provider-settings-compact" : ""}`} {...(props.compact ? { "aria-label": `${props.provider.short || props.provider.label} controls` } : { "aria-labelledby": "provider-settings-title" })}>
    {!props.compact ? <div className="provider-settings-heading"><div><p className="eyebrow">Provider controls</p><h4 id="provider-settings-title">Tune {props.provider.short || props.provider.label}</h4></div><span>{busy ? "Saving…" : "This task"}</span></div> : null}
    <div className="provider-setting-grid">
      {capabilities.effort ? <label className="provider-setting"><span>Effort</span><StyledSelect aria-label={`${props.provider.label} effort`} value={draft.effortLevel ?? capabilities.effort.defaultValue} disabled={busy} onChange={(event) => void save({ ...draft, effortLevel: event.target.value as ModelEffort }, "session")}>
        {capabilities.effort.options.map((option) => <option key={option} value={option}>{EFFORT_LABELS[option]}</option>)}
      </StyledSelect><small>{draft.effortLevel === "ultra" ? "Uses allowance fastest" : "Reasoning depth"}</small></label> : null}
      {capabilities.speed ? <label className="provider-setting"><span>Speed</span><StyledSelect aria-label={`${props.provider.label} speed`} value={draft.speed ?? capabilities.speed.defaultValue} disabled={busy} onChange={(event) => void save({ ...draft, speed: event.target.value as ProviderSpeed }, "session")}>
        {capabilities.speed.options.map((option) => <option key={option} value={option}>{SPEED_LABELS[option]}</option>)}
      </StyledSelect><small>{draft.speed === "fast" ? fastSpeedHint(props.provider.id) : "Default speed"}</small></label> : null}
    </div>
    <details className="provider-settings-advanced"><summary>Advanced</summary><div><p>Save the selected effort{capabilities.speed ? " and speed" : ""} for new tasks in this project.</p><button type="button" disabled={busy} onClick={() => void save(draft, "global")}>Save as project defaults</button></div></details>
    <p className="provider-settings-message" role="status" aria-live="polite">{message}</p>
  </section>;
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
      <strong className="model-name">{props.model}</strong>
      <span className="model-badges">{selected ? <span className="model-active"><Check size={14} />This task</span> : null}{savedDefault ? <span className="model-saved"><Star size={12} fill="currentColor" />Default</span> : null}</span>
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
      <label>Provider<StyledSelect value={provider?.id ?? ""} onChange={(event) => { const next = props.models.find((item) => item.id === event.target.value); setProviderId(event.target.value); setModel(next?.defaultModel ?? next?.models[0] ?? ""); setApiKey(""); }}>{props.models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</StyledSelect></label>
      <label>Model<TextField list="setup-models" value={model} onChange={(event) => setModel(event.target.value)} /></label>
      <datalist id="setup-models">{provider?.models.map((item) => <option key={item} value={item} />)}</datalist>
      {provider?.requiresKey ? <label>API key<TextField type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} required /></label> : null}
      {provider?.note ? <p className="muted">{provider.note}</p> : null}
      {provider?.signupUrl ? <a href={provider.signupUrl} target="_blank" rel="noreferrer">Get an API key</a> : null}
      {error ? <InlineError>{error}</InlineError> : null}
      <ConfirmationActions className="dialog-actions"><ControlButton type="button" onClick={props.onClose}>Cancel</ControlButton><ControlButton tone="primary" type="submit" disabled={saving} aria-busy={saving}>{saving ? <><LoadingIndicator label="Connecting" />Connecting…</> : "Connect"}</ControlButton></ConfirmationActions>
    </form>
  </div>;
}

export function ApprovalOverlay(props: { approval: Approval | null; onAnswer: (decision: ApprovalDecision) => void }) {
  if (!props.approval) return null;
  const request = props.approval.request;
  return (
    <div className="overlay">
      <div className={`approval ${request?.kind ?? "generic"}`} role="dialog" aria-modal="true" aria-labelledby={`approval-overlay-${props.approval.id}`}>
        <h2 id={`approval-overlay-${props.approval.id}`}>{request?.title ?? "Approval Needed"}</h2>
        <p className="approval-subject">{request?.subject ?? props.approval.action}</p>
        <p>{request?.reason ?? props.approval.reason}</p>
        {(request?.sections ?? fallbackSections(props.approval)).map((section) => <ApprovalSection key={section.label} section={section} />)}
        <ConfirmationActions>
          <ControlButton tone="primary" type="button" onClick={() => props.onAnswer("allow")}>Allow once</ControlButton>
          <ControlButton type="button" onClick={() => props.onAnswer("deny")}>Reject</ControlButton>
        </ConfirmationActions>
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
