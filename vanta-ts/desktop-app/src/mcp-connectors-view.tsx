import { useEffect, useState } from "react";
import { Check, Download, ExternalLink, FileSearch, Plug, RefreshCw, ShieldCheck, ShieldX, Trash2, Upload } from "lucide-react";
import type { DesktopMcpActionRequest, DesktopMcpCatalogEntry, DesktopMcpConnector, DesktopMcpPayload } from "./mcp-types.js";
import { IntegrationCatalogView } from "./integration-catalog-view.js";

type McpViewProps = {
  payload: DesktopMcpPayload;
  loading: boolean;
  pending: string;
  error: string;
  onRefresh: () => Promise<void>;
  onAction: (request: DesktopMcpActionRequest) => Promise<DesktopMcpPayload>;
};

export function McpConnectorsView(props: McpViewProps) {
  const [selectedName, setSelectedName] = useState("");
  const selected = props.payload.connectors.find((item) => item.name === selectedName) ?? props.payload.connectors[0];
  useEffect(() => { if (selected && selected.name !== selectedName) setSelectedName(selected.name); }, [selected, selectedName]);
  return <div className="mcp-control-center">
    <div className="mcp-toolbar">
      <div><strong>MCP connectors</strong><span>{props.payload.connectors.length} installed · {props.payload.connectors.filter((item) => item.health === "ready").length} ready</span></div>
      <div><button type="button" disabled={!!props.pending} onClick={() => void run(props, { action: "import_desktop" })}><Upload size={14} />Import Claude Desktop</button><button className="icon-button" type="button" title="Refresh MCP connectors" aria-label="Refresh MCP connectors" disabled={props.loading} onClick={() => void props.onRefresh()}><RefreshCw size={15} /></button></div>
    </div>
    {props.error ? <p className="mcp-error" role="alert">{props.error}</p> : null}
    {props.payload.message ? <p className="mcp-message" role="status">{props.payload.message}</p> : null}
    <div className="mcp-layout">
      <aside className="mcp-server-list" aria-label="Installed MCP connectors">
        {props.payload.connectors.map((item) => <button key={item.name} className={item.name === selected?.name ? "active" : ""} type="button" onClick={() => setSelectedName(item.name)}><i className={item.health} /><span><strong>{item.name}</strong><small>{healthLabel(item)}</small></span><em>{item.tools.length}</em></button>)}
        {!props.loading && props.payload.connectors.length === 0 ? <p>No connectors installed.</p> : null}
      </aside>
      <section className="mcp-detail">
        {selected ? <ConnectorDetail connector={selected} pending={props.pending} payload={props.payload} onAction={props.onAction} /> : <Catalog entries={props.payload.catalog} pending={props.pending} onAction={props.onAction} />}
      </section>
    </div>
    {selected ? <Catalog entries={props.payload.catalog.filter((item) => !item.installed)} pending={props.pending} onAction={props.onAction} compact /> : null}
    <IntegrationCatalogView />
    <ReceiptList payload={props.payload} />
  </div>;
}

function ConnectorDetail(props: { connector: DesktopMcpConnector; payload: DesktopMcpPayload; pending: string; onAction: McpViewProps["onAction"] }) {
  const item = props.connector;
  const busy = (action: string) => props.pending === `${action}:${item.name}`;
  const invoke = (action: DesktopMcpActionRequest["action"], uri?: string) => run({ onAction: props.onAction }, { action, name: item.name, ...(uri ? { uri } : {}) });
  return <>
    <header><div><p className="eyebrow">{item.source} · {item.transport}</p><h2>{item.name}</h2></div><span className={`mcp-health ${item.health}`}>{healthLabel(item)}</span></header>
    <dl className="mcp-facts"><div><dt>Trust</dt><dd>{item.trust}</dd></div><div><dt>Authorization</dt><dd>{item.auth.replace("_", " ")}</dd></div><div><dt>Tools</dt><dd>{item.tools.length}</dd></div><div><dt>Resources</dt><dd>{item.resources.length}</dd></div></dl>
    {item.lastError ? <p className="mcp-error" role="alert">{item.lastError}</p> : null}
    <ConnectorActions item={item} busy={busy} invoke={invoke} />
    <EnvironmentPrompt names={item.missingEnv} />
    <Inventory title="Tools" items={item.tools} empty="Run Test to discover tools." />
    <div className="mcp-inventory"><h3>Resources</h3>{item.resources.length ? item.resources.map((uri) => <button key={uri} type="button" disabled={busy("read_resource")} onClick={() => void invoke("read_resource", uri)}><FileSearch size={13} /><span>{uri}</span></button>) : <p>Run Test to discover resources.</p>}</div>
    {props.payload.resource ? <pre className="mcp-resource-preview"><strong>{props.payload.resource.uri}</strong>{props.payload.resource.preview}</pre> : null}
  </>;
}

function ConnectorActions(props: { item: DesktopMcpConnector; busy: (action: string) => boolean; invoke: (action: DesktopMcpActionRequest["action"], uri?: string) => Promise<void> }) {
  const { item, busy, invoke } = props;
  const probeDisabled = !item.enabled || item.trust !== "trusted";
  return <div className="mcp-actions">
    {item.trust !== "trusted" ? <button type="button" disabled={busy("trust")} onClick={() => void invoke("trust")}><ShieldCheck size={14} />Trust</button> : <button type="button" disabled={busy("deny")} onClick={() => void invoke("deny")}><ShieldX size={14} />Revoke trust</button>}
    {item.auth === "needs_auth" && item.authMode === "oauth" ? <button type="button" disabled={busy("auth")} onClick={() => void invoke("auth")}><ExternalLink size={14} />Authorize</button> : null}
    <button type="button" disabled={probeDisabled || busy("test")} onClick={() => void invoke("test")}><Check size={14} />Test</button>
    <button type="button" disabled={probeDisabled || busy("reconnect")} onClick={() => void invoke("reconnect")}><RefreshCw size={14} />Reconnect</button>
    <button type="button" disabled={busy(item.enabled ? "disable" : "enable")} onClick={() => void invoke(item.enabled ? "disable" : "enable")}><Plug size={14} />{item.enabled ? "Disable" : "Enable"}</button>
    <button className="danger" type="button" disabled={busy("remove") || item.source === "environment"} onClick={() => void invoke("remove")}><Trash2 size={14} />Remove</button>
  </div>;
}

function EnvironmentPrompt(props: { names: string[] }) {
  return props.names.length ? <p className="mcp-auth-prompt"><strong>Credentials needed</strong>Set {props.names.join(", ")} in Vanta's environment, then reconnect. Values stay hidden.</p> : null;
}

function Catalog(props: { entries: DesktopMcpCatalogEntry[]; pending: string; onAction: McpViewProps["onAction"]; compact?: boolean }) {
  if (!props.entries.length) return null;
  return <section className={`mcp-catalog ${props.compact ? "compact" : ""}`}><h3>Vetted catalog</h3><div>{props.entries.map((entry) => <article key={entry.name}><div><strong>{entry.name}</strong><p>{entry.description}</p><small>{entry.defaultTools.length} read-mostly tools{entry.authEnv?.length ? ` · needs ${entry.authEnv.join(", ")}` : ""}</small></div>{entry.docsUrl ? <a href={entry.docsUrl} target="_blank" rel="noreferrer" title={`${entry.name} documentation`}><ExternalLink size={14} /></a> : null}<button type="button" disabled={entry.installed || props.pending === `install:${entry.name}`} onClick={() => void run({ onAction: props.onAction }, { action: "install", name: entry.name })}><Download size={14} />{entry.installed ? "Installed" : "Install"}</button></article>)}</div></section>;
}

function Inventory(props: { title: string; items: string[]; empty: string }) {
  return <div className="mcp-inventory"><h3>{props.title}</h3>{props.items.length ? <ul>{props.items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{props.empty}</p>}</div>;
}

function ReceiptList(props: { payload: DesktopMcpPayload }) {
  return <section className="mcp-receipts"><h3>Recent receipts</h3>{props.payload.receipts.length ? props.payload.receipts.slice(0, 8).map((receipt) => <div key={`${receipt.at}:${receipt.action}:${receipt.server ?? "all"}`}><i className={receipt.outcome} /><time>{new Date(receipt.at).toLocaleString()}</time><strong>{receipt.action}{receipt.server ? ` · ${receipt.server}` : ""}</strong><span>{receipt.detail}</span></div>) : <p>No MCP lifecycle actions recorded yet.</p>}</section>;
}

function healthLabel(item: DesktopMcpConnector): string {
  if (!item.enabled) return "Disabled";
  if (item.trust === "pending") return "Trust required";
  if (item.trust === "denied") return "Trust revoked";
  if (item.auth === "needs_auth") return "Authorization needed";
  return item.health === "ready" ? "Ready" : item.health === "error" ? "Connection failed" : "Needs test";
}

async function run(props: Pick<McpViewProps, "onAction">, request: DesktopMcpActionRequest): Promise<void> {
  try { await props.onAction(request); } catch { /* Error is rendered by the state hook. */ }
}
