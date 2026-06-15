import type { Approval, Provider, RailTab } from "./types.js";

export function CommandPalette(props: { open: boolean; onClose: () => void; onNew: () => void; onModel: () => void; onTab: (tab: RailTab) => void }) {
  if (!props.open) return null;
  const actions = commandActions(props);
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <h2>Command Center</h2>
        {actions.map(([label, action]) => <button key={label} type="button" onClick={() => { action(); props.onClose(); }}>{label}</button>)}
      </div>
    </div>
  );
}

function commandActions(props: { onNew: () => void; onModel: () => void; onTab: (tab: RailTab) => void }) {
  return [
    ["New session", props.onNew],
    ["Model picker", props.onModel],
    ["Files", () => props.onTab("files")],
    ["Terminal", () => props.onTab("terminal")],
  ] as const;
}

export function ModelPicker(props: { open: boolean; models: Provider[]; onClose: () => void; onSelect: (provider: string, model: string) => void }) {
  if (!props.open) return null;
  return (
    <div className="overlay" onClick={props.onClose}>
      <div className="palette model-grid" onClick={(e) => e.stopPropagation()}>
        <h2>Models</h2>
        {props.models.flatMap((p) => p.models.map((model) => <ModelButton key={`${p.id}:${model}`} provider={p} model={model} onSelect={props.onSelect} />))}
      </div>
    </div>
  );
}

function ModelButton(props: { provider: Provider; model: string; onSelect: (provider: string, model: string) => void }) {
  return <button type="button" onClick={() => props.onSelect(props.provider.id, props.model)}>{props.provider.short} · {props.model}</button>;
}

export function ApprovalOverlay(props: { approval: Approval | null; onAnswer: (approved: boolean) => void }) {
  if (!props.approval) return null;
  return (
    <div className="overlay">
      <div className="approval">
        <h2>Approval Needed</h2>
        <p>{props.approval.reason}</p>
        <pre>{props.approval.action}</pre>
        <div>
          <button type="button" onClick={() => props.onAnswer(false)}>Deny</button>
          <button type="button" onClick={() => props.onAnswer(true)}>Approve</button>
        </div>
      </div>
    </div>
  );
}
