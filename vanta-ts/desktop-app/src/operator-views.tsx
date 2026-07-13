import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ArrowRight, Bot, Boxes, ExternalLink, FileText, Image, Link2, Network, PackageOpen, RefreshCw, Search, Wrench } from "lucide-react";
import type { Artifact, Capability, MessagingPlatform, Provider, Status } from "./types.js";

export function CapabilitiesView(props: { items: Capability[] }) {
  return <WorkspaceView title="Capabilities" eyebrow="What Vanta can use" description="Live tools and project skills available to this operator."><CapabilitiesPanel {...props} /></WorkspaceView>;
}

function CapabilitiesPanel(props: { items: Capability[] }) {
  const [kind, setKind] = useState<"all" | "tool" | "skill">("all");
  const [query, setQuery] = useState("");
  const items = useMemo(() => props.items.filter((item) => (kind === "all" || item.kind === kind) && `${item.name} ${item.description} ${item.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [kind, props.items, query]);
  const tools = props.items.filter((item) => item.kind === "tool").length;
  const skills = props.items.filter((item) => item.kind === "skill").length;
  return <>
    <div className="view-toolbar">
      <label className="view-search"><Search size={16} /><span className="sr-only">Search capabilities</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search capabilities" /></label>
      <div className="segmented" aria-label="Capability type">
        <button className={kind === "all" ? "active" : ""} type="button" onClick={() => setKind("all")}>All {props.items.length}</button>
        <button className={kind === "tool" ? "active" : ""} type="button" onClick={() => setKind("tool")}>Tools {tools}</button>
        <button className={kind === "skill" ? "active" : ""} type="button" onClick={() => setKind("skill")}>Skills {skills}</button>
      </div>
    </div>
    <div className="capability-list" aria-live="polite">
      {items.map((item) => <article key={item.id} className="capability-row"><Wrench size={16} /><div><strong>{item.name}</strong><p>{item.description}</p>{item.tags.length ? <small>{item.tags.join(" · ")}</small> : null}</div><span>{item.kind}</span></article>)}
      {items.length === 0 ? <Empty message="No matching capabilities are available in this project." /> : null}
    </div>
  </>;
}

export function MessagingView(props: { platforms: MessagingPlatform[]; onSave: (id: string, values: Record<string, string>) => Promise<void> }) {
  return <WorkspaceView title="Messaging" eyebrow="Reach Vanta elsewhere" description="Connect one of Vanta's gateway adapters. Credentials are saved locally and never displayed again."><MessagingPanel {...props} /></WorkspaceView>;
}

function MessagingPanel(props: { platforms: MessagingPlatform[]; onSave: (id: string, values: Record<string, string>) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState("");
  const selected = props.platforms.find((platform) => platform.id === selectedId) ?? props.platforms[0];
  useEffect(() => { if (!selectedId && props.platforms[0]) setSelectedId(props.platforms[0].id); }, [props.platforms, selectedId]);
  return <div className="messaging-layout">
      <aside className="platform-list" aria-label="Messaging platforms">
        {props.platforms.map((platform) => <button className={platform.id === selected?.id ? "active" : ""} type="button" key={platform.id} onClick={() => setSelectedId(platform.id)}><i className={platform.configured ? "ready" : ""} /><span>{platform.label}</span><small>{platform.configured ? "Connected" : `${platform.missing.length} required`}</small></button>)}
      </aside>
      {selected ? <MessagingDetail key={selected.id} platform={selected} onSave={props.onSave} /> : <Empty message="No messaging adapters are available." />}
    </div>;
}

function MessagingDetail(props: { platform: MessagingPlatform; onSave: (id: string, values: Record<string, string>) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { await props.onSave(props.platform.id, values); setValues({}); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  }
  return <form className="messaging-detail" onSubmit={(event) => { void submit(event); }}>
    <header><div><p className="eyebrow">{props.platform.configured ? "Configured" : "Setup required"}</p><h2>{props.platform.label}</h2></div>{props.platform.signupUrl ? <a href={props.platform.signupUrl} target="_blank" rel="noreferrer">Get credentials <ExternalLink size={14} /></a> : null}</header>
    {props.platform.prerequisite ? <p className="operator-note"><strong>Prerequisite</strong>{props.platform.prerequisite}</p> : null}
    {props.platform.warning ? <p className="operator-warning">{props.platform.warning}</p> : null}
    <ol className="setup-steps">{props.platform.setupSteps.map((step) => <li key={step}>{step}</li>)}</ol>
    <fieldset><legend>{props.platform.configured ? "Replace saved credentials" : "Required credentials"}</legend>
      {props.platform.fields.map((field) => <label key={field.key}>{field.label}<input type={field.secret ? "password" : "text"} autoComplete="off" value={values[field.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.secret ? "Paste credential" : `Enter ${field.label.toLowerCase()}`} required /></label>)}
    </fieldset>
    {error ? <p className="setup-error" role="alert">{error}</p> : null}
    <div className="form-footer"><p>Start or restart <code>vanta gateway</code> after saving to connect this adapter.</p><button type="submit" disabled={saving}>{saving ? "Saving..." : "Save credentials"}</button></div>
  </form>;
}

export function ArtifactsView(props: { artifacts: Artifact[]; onOpenSession: (id: string) => void; onRefresh: () => void }) {
  const [kind, setKind] = useState<"all" | Artifact["kind"]>("all");
  const filtered = props.artifacts.filter((item) => kind === "all" || item.kind === kind);
  const counts = (value: Artifact["kind"]) => props.artifacts.filter((item) => item.kind === value).length;
  return <WorkspaceView title="Outputs" eyebrow="Outputs across sessions" description="Canvas results, links, and project files Vanta actually produced in saved sessions." actions={<button className="icon-button" type="button" title="Refresh outputs" aria-label="Refresh outputs" onClick={props.onRefresh}><RefreshCw size={16} /></button>}>
    <div className="view-toolbar artifact-tabs" role="tablist" aria-label="Artifact type">
      <button role="tab" aria-selected={kind === "all"} className={kind === "all" ? "active" : ""} type="button" onClick={() => setKind("all")}>All {props.artifacts.length}</button>
      <button role="tab" aria-selected={kind === "canvas"} className={kind === "canvas" ? "active" : ""} type="button" onClick={() => setKind("canvas")}>Canvas {counts("canvas")}</button>
      <button role="tab" aria-selected={kind === "file"} className={kind === "file" ? "active" : ""} type="button" onClick={() => setKind("file")}>Files {counts("file")}</button>
      <button role="tab" aria-selected={kind === "link"} className={kind === "link" ? "active" : ""} type="button" onClick={() => setKind("link")}>Links {counts("link")}</button>
    </div>
    <div className="artifact-grid">{filtered.map((item) => <ArtifactCard key={item.id} artifact={item} onOpenSession={props.onOpenSession} />)}</div>
    {filtered.length === 0 ? <Empty message="No artifacts found. Vanta's saved canvas, output links, and project-file references will appear here." /> : null}
  </WorkspaceView>;
}

export function ConnectView(props: {
  capabilities: Capability[];
  platforms: MessagingPlatform[];
  models: Provider[];
  status: Status | null;
  onSaveMessaging: (id: string, values: Record<string, string>) => Promise<void>;
  onOpenModel: () => void;
  onOpenSetup: () => void;
}) {
  const [section, setSection] = useState<"overview" | "capabilities" | "messaging">("overview");
  const configured = props.platforms.filter((platform) => platform.configured).length;
  return <WorkspaceView title="Connect" eyebrow="Setup when it is useful" description="Choose a model, inspect what Vanta can use, or connect the channels that let it reach you.">
    <div className="connect-tabs" role="tablist" aria-label="Connect sections">
      <button role="tab" aria-selected={section === "overview"} className={section === "overview" ? "active" : ""} type="button" onClick={() => setSection("overview")}>Overview</button>
      <button role="tab" aria-selected={section === "capabilities"} className={section === "capabilities" ? "active" : ""} type="button" onClick={() => setSection("capabilities")}>Capabilities</button>
      <button role="tab" aria-selected={section === "messaging"} className={section === "messaging" ? "active" : ""} type="button" onClick={() => setSection("messaging")}>Messaging</button>
    </div>
    {section === "overview" ? <div className="connect-grid">
      <ConnectCard icon={<Bot size={18} />} eyebrow="Model" title={props.status?.model ?? "Choose a model"} detail={props.models.length ? `${props.models.length} provider${props.models.length === 1 ? "" : "s"} available` : "No providers are available yet"} action={props.status?.model ? "Change model" : "Connect provider"} onAction={props.status?.model ? props.onOpenModel : props.onOpenSetup} />
      <ConnectCard icon={<Boxes size={18} />} eyebrow="Capability" title={`${props.capabilities.length} available`} detail="Live registered tools and project skills that Vanta can use in this workspace." action="Browse capabilities" onAction={() => setSection("capabilities")} />
      <ConnectCard icon={<Network size={18} />} eyebrow="Messaging" title={configured ? `${configured} connected` : "No channels connected"} detail={`${props.platforms.length} available adapters. Credentials stay local to this project.`} action="Configure messaging" onAction={() => setSection("messaging")} />
    </div> : null}
    {section === "capabilities" ? <CapabilitiesPanel items={props.capabilities} /> : null}
    {section === "messaging" ? <MessagingPanel platforms={props.platforms} onSave={props.onSaveMessaging} /> : null}
  </WorkspaceView>;
}

function ConnectCard(props: { icon: ReactNode; eyebrow: string; title: string; detail: string; action: string; onAction: () => void }) {
  return <article className="connect-card"><span>{props.icon}</span><p className="eyebrow">{props.eyebrow}</p><h2>{props.title}</h2><p>{props.detail}</p><button type="button" onClick={props.onAction}>{props.action}<ArrowRight size={15} /></button></article>;
}

function ArtifactCard(props: { artifact: Artifact; onOpenSession: (id: string) => void }) {
  const icon = props.artifact.kind === "canvas" ? <Image size={17} /> : props.artifact.kind === "link" ? <Link2 size={17} /> : <FileText size={17} />;
  const sessionId = props.artifact.sessionId;
  return <article className="artifact-card">{icon}<div><span>{props.artifact.kind}</span><strong>{props.artifact.label}</strong><p>{props.artifact.sessionTitle ? `From ${props.artifact.sessionTitle}` : props.artifact.value}</p></div>{props.artifact.kind === "link" ? <a href={props.artifact.value} target="_blank" rel="noreferrer" title="Open link"><ExternalLink size={15} /></a> : null}{sessionId ? <button type="button" onClick={() => props.onOpenSession(sessionId)}>Open session</button> : null}</article>;
}

function WorkspaceView(props: { title: string; eyebrow: string; description: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="operator-view"><header className="operator-header"><div><p className="eyebrow">{props.eyebrow}</p><h1>{props.title}</h1><p>{props.description}</p></div>{props.actions}</header>{props.children}</section>;
}

function Empty(props: { message: string }) { return <div className="operator-empty"><PackageOpen size={22} /><p>{props.message}</p></div>; }
