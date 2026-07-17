import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Activity, ArrowRight, Bot, Boxes, CheckCircle2, ExternalLink, FileText, Image, Link2, Network, PackageOpen, PauseCircle, RefreshCw, Search, ShieldAlert, Wrench } from "lucide-react";
import type { Artifact, Capability, ConnectStatus, ConnectTestResult, EventRow, MessagingPlatform, Provider, Session, Status } from "./types.js";
import { McpConnectorsView } from "./mcp-connectors-view.js";
import type { useDesktopMcp } from "./mcp-state.js";

type TestConnection = (kind: "provider" | "messaging", id?: string) => Promise<ConnectTestResult>;

export function OperateView(props: { sessions: Session[]; events: EventRow[]; status: Status | null; onOpenSession: (id: string) => void }) {
  const active = props.sessions.filter((session) => !session.archived).slice(0, 6);
  const needsAttention = props.events.filter((event) => event.ok === false).length;
  return <WorkspaceView title="Operate" eyebrow="Background work" description="See what Vanta is running, what needs a decision, and what finished without opening every task.">
    <div className="operate-summary" aria-label="Task summary">
      <div><Activity size={16} /><strong>{active.length}</strong><span>active tasks</span></div>
      <div><ShieldAlert size={16} /><strong>{needsAttention}</strong><span>need you</span></div>
      <div><CheckCircle2 size={16} /><strong>{props.events.filter((event) => event.ok).length}</strong><span>verified events</span></div>
    </div>
    <div className="operate-ledger">
      {active.map((session, index) => <button key={session.id} type="button" onClick={() => props.onOpenSession(session.id)}>
        <span className={`operate-state ${index === 0 ? "working" : "idle"}`}>{index === 0 ? <Activity size={15} /> : <PauseCircle size={15} />}</span>
        <span><strong>{session.title}</strong><small>{index === 0 ? "Working in the current project" : `Last updated ${session.updated}`}</small></span>
        <em>{session.turns} turns</em>
      </button>)}
      {active.length === 0 ? <Empty message="No active tasks. Start one from Work when there is an outcome for Vanta to handle." /> : null}
    </div>
    <section className="operate-policy"><div><p className="eyebrow">Execution contract</p><h2>Kernel {props.status?.kernel ?? "checking"}</h2></div><p>Vanta can continue routine work in the background. Consequential commands and file changes still surface an exact approval.</p></section>
  </WorkspaceView>;
}

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

export function MessagingView(props: { platforms: MessagingPlatform[]; onSave: (id: string, values: Record<string, string>) => Promise<void>; onTest: TestConnection }) {
  return <WorkspaceView title="Messaging" eyebrow="Reach Vanta elsewhere" description="Connect one of Vanta's gateway adapters. Credentials are saved locally and never displayed again."><MessagingPanel {...props} /></WorkspaceView>;
}

function MessagingPanel(props: { platforms: MessagingPlatform[]; onSave: (id: string, values: Record<string, string>) => Promise<void>; onTest: TestConnection }) {
  const [selectedId, setSelectedId] = useState("");
  const selected = props.platforms.find((platform) => platform.id === selectedId) ?? props.platforms[0];
  useEffect(() => { if (!selectedId && props.platforms[0]) setSelectedId(props.platforms[0].id); }, [props.platforms, selectedId]);
  return <div className="messaging-layout">
      <aside className="platform-list" aria-label="Messaging platforms">
        {props.platforms.map((platform) => <button className={platform.id === selected?.id ? "active" : ""} type="button" key={platform.id} onClick={() => setSelectedId(platform.id)}><i className={platform.status} /><span>{platform.label}</span><small>{statusLabel(platform.status)}{platform.status === "needs_setup" ? ` · ${platform.missing.length} required` : ""}</small></button>)}
      </aside>
      {selected ? <MessagingDetail key={selected.id} platform={selected} onSave={props.onSave} onTest={props.onTest} /> : <Empty message="No messaging adapters are available." />}
    </div>;
}

function MessagingDetail(props: { platform: MessagingPlatform; onSave: (id: string, values: Record<string, string>) => Promise<void>; onTest: TestConnection }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const test = useConnectTest(() => props.onTest("messaging", props.platform.id));
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { await props.onSave(props.platform.id, values); setValues({}); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  }
  return <form className="messaging-detail" onSubmit={(event) => { void submit(event); }}>
    <header><div><StatusBadge status={props.platform.status} /><h2>{props.platform.label}</h2></div>{props.platform.signupUrl ? <a href={props.platform.signupUrl} target="_blank" rel="noreferrer">Get credentials <ExternalLink size={14} /></a> : null}</header>
    {props.platform.prerequisite ? <p className="operator-note"><strong>Prerequisite</strong>{props.platform.prerequisite}</p> : null}
    {props.platform.warning ? <p className="operator-warning">{props.platform.warning}</p> : null}
    <ol className="setup-steps">{props.platform.setupSteps.map((step) => <li key={step}>{step}</li>)}</ol>
    <fieldset><legend>{props.platform.configured ? "Replace saved credentials" : "Required credentials"}</legend>
      {props.platform.fields.map((field) => <label key={field.key}>{field.label}<input type={field.secret ? "password" : "text"} autoComplete="off" value={values[field.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.secret ? "Paste credential" : `Enter ${field.label.toLowerCase()}`} required /></label>)}
    </fieldset>
    {error ? <p className="setup-error" role="alert">{error}</p> : null}
    {test.message ? <p className={`connect-test-result ${test.status}`} role="status">{test.message}</p> : null}
    <div className="form-footer"><p>{props.platform.status === "ready" ? "Credentials are saved locally. Start the gateway when you want delivery." : "Save the required settings locally; secrets are never displayed again."}</p><div><button type="button" disabled={test.testing || props.platform.status !== "ready"} onClick={() => void test.run()}>{test.testing ? "Testing..." : "Test setup"}</button><button type="submit" disabled={saving || props.platform.status === "unavailable"}>{saving ? "Saving..." : "Save credentials"}</button></div></div>
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
  mcp?: ReturnType<typeof useDesktopMcp>;
  onSaveMessaging: (id: string, values: Record<string, string>) => Promise<void>;
  onTest: TestConnection;
  onOpenModel: () => void;
  onOpenSetup: () => void;
}) {
  const [section, setSection] = useState<"overview" | "capabilities" | "mcp" | "messaging">("overview");
  const configured = props.platforms.filter((platform) => platform.configured).length;
  const providerStatus: ConnectStatus = props.status?.model ? "ready" : props.models.length ? "needs_setup" : "unavailable";
  useEffect(() => { if (section === "mcp") void props.mcp?.refresh(); }, [props.mcp?.refresh, section]);
  return <WorkspaceView title="Connect" eyebrow="Setup when it is useful" description="Choose a model, inspect what Vanta can use, or connect the channels that let it reach you.">
    <div className="connect-tabs" role="tablist" aria-label="Connect sections">
      <button role="tab" aria-selected={section === "overview"} className={section === "overview" ? "active" : ""} type="button" onClick={() => setSection("overview")}>Overview</button>
      <button role="tab" aria-selected={section === "capabilities"} className={section === "capabilities" ? "active" : ""} type="button" onClick={() => setSection("capabilities")}>Capabilities</button>
      <button role="tab" aria-selected={section === "mcp"} className={section === "mcp" ? "active" : ""} type="button" onClick={() => setSection("mcp")}>MCP</button>
      <button role="tab" aria-selected={section === "messaging"} className={section === "messaging" ? "active" : ""} type="button" onClick={() => setSection("messaging")}>Messaging</button>
    </div>
    {section === "overview" ? <div className="connect-grid">
      <ConnectCard icon={<Bot size={18} />} status={providerStatus} eyebrow="Model" title={props.status?.model ?? "Choose a model"} detail={props.models.length ? `${props.models.length} provider${props.models.length === 1 ? "" : "s"} available` : "Provider catalog unavailable. Retry locally before opening setup."} action={props.status?.model ? "Change model" : "Connect provider"} onAction={props.status?.model ? props.onOpenModel : props.onOpenSetup} onTest={providerStatus === "ready" ? () => props.onTest("provider") : undefined} />
      <ConnectCard icon={<Boxes size={18} />} status={props.capabilities.length ? "ready" : "needs_setup"} eyebrow="Capabilities" title={`${props.capabilities.length} available`} detail="Live registered tools and project skills that Vanta can use in this workspace." action="Browse capabilities" onAction={() => setSection("capabilities")} />
      <ConnectCard icon={<Network size={18} />} status={props.mcp?.summary.servers ? "ready" : props.mcp?.payload.connectors.length ? "needs_setup" : "unavailable"} eyebrow="MCP" title={props.mcp?.summary.servers ? `${props.mcp.summary.servers} ready` : "No servers ready"} detail={`${props.mcp?.summary.tools ?? 0} tools and ${props.mcp?.summary.resources ?? 0} resources available to Work.`} action="Manage MCP" onAction={() => setSection("mcp")} />
      <ConnectCard icon={<Network size={18} />} status={configured ? "ready" : props.platforms.length ? "needs_setup" : "unavailable"} eyebrow="Messaging" title={configured ? `${configured} ready` : "No channels ready"} detail={`${props.platforms.length} available adapters. Credentials stay local to this project.`} action="Configure messaging" onAction={() => setSection("messaging")} />
    </div> : null}
    {section === "capabilities" ? <CapabilitiesPanel items={props.capabilities} /> : null}
    {section === "mcp" && props.mcp ? <McpConnectorsView payload={props.mcp.payload} loading={props.mcp.loading} pending={props.mcp.pending} error={props.mcp.error} onRefresh={props.mcp.refresh} onAction={props.mcp.act} /> : null}
    {section === "messaging" ? <MessagingPanel platforms={props.platforms} onSave={props.onSaveMessaging} onTest={props.onTest} /> : null}
  </WorkspaceView>;
}

function ConnectCard(props: { icon: ReactNode; status: ConnectStatus; eyebrow: string; title: string; detail: string; action: string; onAction: () => void; onTest?: () => Promise<ConnectTestResult> }) {
  const test = useConnectTest(props.onTest);
  return <article className="connect-card"><span>{props.icon}</span><StatusBadge status={props.status} /><p className="eyebrow">{props.eyebrow}</p><h2>{props.title}</h2><p>{props.detail}</p>{test.message ? <p className={`connect-test-result ${test.status}`} role="status">{test.message}</p> : null}<div className="connect-card-actions"><button type="button" onClick={props.onAction}>{props.action}<ArrowRight size={15} /></button>{props.onTest ? <button type="button" disabled={test.testing} onClick={() => void test.run()}>{test.testing ? "Testing..." : "Test model"}</button> : null}</div></article>;
}

function StatusBadge(props: { status: ConnectStatus }) {
  return <span className={`connect-status ${props.status}`}>{statusLabel(props.status)}</span>;
}

function statusLabel(status: ConnectStatus): string {
  return status === "ready" ? "Ready" : status === "needs_setup" ? "Needs setup" : "Unavailable";
}

function useConnectTest(runTest?: () => Promise<ConnectTestResult>) {
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<ConnectStatus | "">("");
  async function run() {
    if (!runTest) return;
    setTesting(true); setMessage(""); setStatus("");
    try { const result = await runTest(); setStatus(result.status); setMessage(result.message); }
    catch (error) { setStatus("unavailable"); setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setTesting(false); }
  }
  return { testing, message, status, run };
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
