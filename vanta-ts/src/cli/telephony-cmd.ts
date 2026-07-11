import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { resolveInScope } from "../scope.js";
import { searchTelephonyNumbers, type TelephonyResult } from "../telephony/client.js";
import { latestTelephonyStates, loadTelephonyReceipts } from "../telephony/receipts.js";
import { NumberSearchSchema, TelephonyActionSchema, TelephonyProfileSchema, previewTelephonyAction, type NumberSearch } from "../telephony/schema.js";
import { applyTelephonyRetention, executeTelephony, type TelephonyExecutor } from "../telephony/service.js";
import { startTelephonyIngress } from "../telephony/ingress.js";

const USAGE = "usage: vanta telephony search <profile.json> [--country US --area 415 --limit 5] | preview|execute <action.json> --approve <action-id> | receipts | prune <profile.json> --yes | ingress <profile.json> --public-url https://host/twilio [--port 7790]";
type Deps = { log?: (line: string) => void; search?: (request: NumberSearch) => Promise<TelephonyResult>; execute?: TelephonyExecutor; now?: () => Date };

async function readJson(root: string, path: string): Promise<unknown> { const scoped = resolveInScope(path, root); if (!scoped.ok) throw new Error("path outside project"); return JSON.parse(await readFile(scoped.path, "utf8")); }
function option(args: string[], name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }

async function search(root: string, args: string[], deps: Deps, log: (line: string) => void): Promise<number> {
  const path = args[1]; if (!path) { log(USAGE); return 1; }
  const request = NumberSearchSchema.parse({ profile: TelephonyProfileSchema.parse(await readJson(root, path)), country: option(args, "--country"), areaCode: option(args, "--area"), limit: option(args, "--limit") ? Number(option(args, "--limit")) : undefined });
  const result = await (deps.search ?? searchTelephonyNumbers)(request); log(result.ok ? JSON.stringify(result.data, null, 2) : `number search stopped: ${result.state}`); return result.ok ? 0 : 1;
}

async function act(root: string, action: "preview" | "execute", args: string[], options: { deps: Deps; log: (line: string) => void }): Promise<number> {
  const path = args[1]; if (!path) { options.log(USAGE); return 1; }
  const contract = TelephonyActionSchema.parse(await readJson(root, path)); options.log(previewTelephonyAction(contract));
  if (action === "preview") return 0;
  if (option(args, "--approve") !== contract.id) { options.log(`not executed; rerun with --approve ${contract.id}`); return 1; }
  const result = await executeTelephony(root, contract, { approve: async () => true, execute: options.deps.execute, now: options.deps.now });
  options.log(result.ok ? `telephony ${result.state}; lifecycle receipt recorded` : `telephony stopped: ${result.state}`); return result.ok ? 0 : 1;
}

async function receipts(root: string, log: (line: string) => void): Promise<number> {
  const states = latestTelephonyStates(await loadTelephonyReceipts(root)); for (const receipt of states) log(`${receipt.actionId}\t${receipt.action}\t${receipt.providerStatus}\t${receipt.providerId ?? "pending"}`); if (!states.length) log("no telephony receipts"); return 0;
}

async function ingress(root: string, args: string[], log: (line: string) => void): Promise<number> {
  const path = args[1], publicUrl = option(args, "--public-url"), port = Number(option(args, "--port") ?? 7790);
  if (!path || !publicUrl) { log(USAGE); return 1; }
  const profile = TelephonyProfileSchema.parse(await readJson(root, path));
  const server = startTelephonyIngress({ root, profile, publicUrl, port, host: option(args, "--host"), log });
  log(`telephony callback ingress listening on http://${option(args, "--host") ?? "127.0.0.1"}:${port}/twilio for ${publicUrl}`);
  const close = (): void => { server.close(); }; process.once("SIGINT", close); process.once("SIGTERM", close);
  await once(server, "close"); return 0;
}

async function maintenance(root: string, args: string[], options: { deps: Deps; log: (line: string) => void }): Promise<number | null> {
  if (args[0] === "receipts") return receipts(root, options.log);
  if (args[0] === "ingress") return ingress(root, args, options.log);
  if (args[0] !== "prune") return null;
  if (!args[1] || !args.includes("--yes")) return 1;
  const profile = TelephonyProfileSchema.parse(await readJson(root, args[1]));
  const result = await applyTelephonyRetention(root, profile, { now: options.deps.now });
  options.log(`retention: ${result.deletedRecordings} recordings deleted, ${result.failedRecordings} failed, ${result.prunedReceipts} receipts pruned`); return result.failedRecordings ? 1 : 0;
}

export async function runTelephonyCommand(root: string, args: string[], deps: Deps = {}): Promise<number> {
  const log = deps.log ?? console.log, action = args[0];
  try {
    if (action === "search") return await search(root, args, deps, log);
    if (action === "preview" || action === "execute") return await act(root, action, args, { deps, log });
    const handled = await maintenance(root, args, { deps, log }); if (handled !== null) return handled;
    log(USAGE); return 1;
  } catch { log("telephony error: invalid contract, ledger, credential, callback, or provider state"); return 1; }
}
