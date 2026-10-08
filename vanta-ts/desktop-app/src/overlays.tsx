import { Search,X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect,useMemo,useState } from "react";
import { ApprovalDecisionControls } from "./approval-decision-controls.js";
import { ConfirmationActions,ControlButton,InlineError,LoadingIndicator,StyledSelect,TextField } from "./form-controls.js";
import type { Approval,ApprovalDecision,DesktopView,PermissionSection,Provider } from "./types.js";

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
    [`${command} Shift D`, "Start or stop local dictation (composer focused)"], ["Esc while dictating", "Cancel dictation without sending"],
    [`${command} L`, "Focus composer"], [`${command} N`, "New session"], [`${command} K`, "Command palette"], [`${command} Shift M`, "Cycle access mode"], ["?", "Keyboard shortcuts"], ["Esc", "Close the active dialog"], ["Enter", "Send message"], ["Shift Enter", "Insert newline"], ["@", "Attach a project file"], ["/", "Open quick actions"],
  ];
  return <div className="overlay" onClick={props.onClose}><section className="palette shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" onClick={(event) => event.stopPropagation()}>
    <div className="dialog-heading"><div><p className="eyebrow">Desktop controls</p><h2 id="shortcuts-title">Keyboard shortcuts</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={props.onClose}><X size={16} /></button></div>
    <div className="shortcut-list">{rows.map(([keys, label]) => <div key={label}><span>{label}</span><kbd>{keys}</kbd></div>)}</div>
  </section></div>;
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

export function ApprovalOverlay(props: { approval: Approval | null; onAnswer: (decision: ApprovalDecision) => void | Promise<void> }) {
  if (!props.approval) return null;
  const request = props.approval.request;
  return (
    <div className="overlay">
      <div className={`approval ${request?.kind ?? "generic"}`} role="dialog" aria-modal="true" aria-labelledby={`approval-overlay-${props.approval.id}`}>
        <h2 id={`approval-overlay-${props.approval.id}`}>{request?.title ?? "Approval Needed"}</h2>
        <p className="approval-subject">{request?.subject ?? props.approval.action}</p>
        <p>{request?.reason ?? props.approval.reason}</p>
        {(request?.sections ?? fallbackSections(props.approval)).map((section) => <ApprovalSection key={section.label} section={section} />)}
        <ApprovalDecisionControls key={props.approval.id} approval={props.approval} onAnswer={props.onAnswer} />
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
export { filterModels,filterProviders } from "./model-picker-catalog.js";
export { ModelPicker } from "./model-picker.js";
export { NewTaskDialog,type NewTaskDraft } from "./new-task-dialog.js";
export { fastSpeedHint } from "./provider-settings-controls.js";
export { SettingsDialog } from "./settings-dialog.js";
