import type { Approval, ApprovalDecision, PermissionSection, Provider, RailTab } from "./types.js";

export function CommandPalette(props: { open: boolean; onClose: () => void; onNew: () => void; onModel: () => void; onSound: () => void; onTab: (tab: RailTab) => void }) {
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
      <div className="palette model-grid" onClick={(e) => e.stopPropagation()}>
        <h2>Models for this session</h2>
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
          <button type="button" onClick={() => props.onAnswer("allow")}>Allow once</button>
          <button type="button" onClick={() => props.onAnswer("always")}>Always allow</button>
          <button type="button" onClick={() => props.onAnswer("deny")}>Deny</button>
          <button type="button" onClick={() => props.onAnswer("never")}>Never allow</button>
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
