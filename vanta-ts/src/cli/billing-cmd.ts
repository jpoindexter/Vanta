import { formatBillingStatus, readBillingStatus } from "../billing/status.js";

export async function runBillingCommand(dataDir: string, rest: string[], log = console.log): Promise<number> {
  const sub = rest[0] ?? "status";
  if (sub !== "status" && sub !== "json") {
    log("usage: vanta billing [status|json]");
    return 1;
  }
  const status = await readBillingStatus(dataDir);
  log(sub === "json" ? JSON.stringify(status, null, 2) : formatBillingStatus(status));
  return 0;
}
