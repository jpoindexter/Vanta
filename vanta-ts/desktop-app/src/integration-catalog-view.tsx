import { useDesktopIntegrations } from "./integrations-state.js";
import type { IntegrationAction, IntegrationState } from "../../src/integrations/types.js";

export function IntegrationCatalogView() {
  const integrations = useDesktopIntegrations();
  return <section className="mcp-catalog" aria-labelledby="integration-catalog-title">
    <h3 id="integration-catalog-title">Integrations</h3>
    <div>{integrations.items.map((item) => <article key={item.id}><div><strong>{item.label}</strong><p>{item.detail}</p><small>{integrationStateLabel(item.state)}{item.receipt ? ` · last ${item.receipt.outcome}` : ""}</small></div><span>{item.actions.map((action) => <button key={action} type="button" disabled={integrations.pending === `${action}:${item.id}`} onClick={() => { void integrations.act(item.id, action); }}>{integrations.pending === `${action}:${item.id}` ? "Working..." : actionLabel(action)}</button>)}</span></article>)}</div>
    {integrations.message ? <p className="mcp-message" role="status">{integrations.message}</p> : null}
    {integrations.error ? <p className="mcp-error" role="alert">{integrations.error}</p> : null}
  </section>;
}

function actionLabel(action: IntegrationAction): string {
  return ({ test: "Test", install: "Install", configure: "Setup", manage_mcp: "Open MCP" })[action];
}

function integrationStateLabel(state: IntegrationState): string {
  return ({ ready: "Ready", needs_setup: "Needs setup", installable: "Install available", installed: "Installed", degraded: "Needs attention", unavailable: "Unavailable" })[state];
}
