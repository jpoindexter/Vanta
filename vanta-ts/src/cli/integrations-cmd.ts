import { INTEGRATION_IDS, integrationStateLabel, readIntegrationCatalog } from "../integrations/catalog.js";
import { executeIntegrationAction } from "../integrations/actions.js";
import type { IntegrationAction, IntegrationId, IntegrationRecord } from "../integrations/types.js";

const ACTIONS: IntegrationAction[] = ["test", "install", "configure", "manage_mcp"];

export async function runIntegrationsCommand(root: string, args: string[]): Promise<number> {
  if (!args.length || args[0] === "list") {
    console.log(formatIntegrationCatalog(await readIntegrationCatalog(root)));
    return 0;
  }
  const [action, id] = args;
  if (!action || !id || !ACTIONS.includes(action as IntegrationAction) || !INTEGRATION_IDS.includes(id as IntegrationId)) {
    console.error("usage: vanta integrations [list|test|install|configure|manage_mcp] <integration>");
    return 1;
  }
  console.log(await executeIntegrationAction(root, id as IntegrationId, action as IntegrationAction));
  return 0;
}

export function formatIntegrationCatalog(items: readonly IntegrationRecord[]): string {
  const width = Math.max("Integration".length, ...items.map((item) => item.label.length));
  const rows = items.map((item) => {
    const receipt = item.receipt ? ` · last ${item.receipt.outcome}` : "";
    const actions = item.actions.length ? item.actions.join(", ") : "none";
    return `${item.label.padEnd(width)}  ${integrationStateLabel(item.state)}${receipt}\n  ${item.detail}\n  Actions: ${actions}`;
  });
  return ["Integration catalog", ...rows].join("\n");
}
