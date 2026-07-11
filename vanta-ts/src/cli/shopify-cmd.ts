import { readFile } from "node:fs/promises";
import { resolveInScope } from "../scope.js";
import { readShopify, type ShopifyResult } from "../shopify/client.js";
import { loadShopifyReceipts } from "../shopify/receipts.js";
import { ShopifyMutationPlanSchema, ShopifyProfileSchema, ShopifyReadRequestSchema, previewShopifyMutation, type ShopifyMutationPlan, type ShopifyProfile, type ShopifyReadRequest } from "../shopify/schema.js";
import { executeShopifyMutation, type ShopifyMutator } from "../shopify/service.js";

const USAGE = "usage: vanta shopify read <profile.json> <products|orders|inventory> [--limit N --query text] | preview|apply <plan.json> --approve <plan-id> | receipts";
type Deps = { log?: (line: string) => void; read?: (profile: ShopifyProfile, request: ShopifyReadRequest) => Promise<ShopifyResult>; mutate?: ShopifyMutator; now?: () => Date };

async function readJson(root: string, path: string): Promise<unknown> {
  const scoped = resolveInScope(path, root); if (!scoped.ok) throw new Error("path outside project");
  return JSON.parse(await readFile(scoped.path, "utf8"));
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined;
}

async function runRead(root: string, args: string[], deps: Deps, log: (line: string) => void): Promise<number> {
  const [, path, resource] = args; if (!path || !resource) { log(USAGE); return 1; }
  const profile = ShopifyProfileSchema.parse(await readJson(root, path));
  const request = ShopifyReadRequestSchema.parse({ resource, limit: option(args, "--limit") ? Number(option(args, "--limit")) : undefined, query: option(args, "--query") });
  const result = await (deps.read ?? readShopify)(profile, request);
  log(result.ok ? JSON.stringify(result.data, null, 2) : `Shopify read stopped: ${result.state}`);
  return result.ok ? 0 : 1;
}

async function runMutation(root: string, action: "preview" | "apply", args: string[], options: { deps: Deps; log: (line: string) => void }): Promise<number> {
  const path = args[1]; if (!path) { options.log(USAGE); return 1; }
  const plan = ShopifyMutationPlanSchema.parse(await readJson(root, path)); options.log(previewShopifyMutation(plan));
  if (action === "preview") return 0;
  if (option(args, "--approve") !== plan.id) { options.log(`not applied; rerun with --approve ${plan.id}`); return 1; }
  const result = await executeShopifyMutation(root, plan, { approve: async () => true, mutate: options.deps.mutate, now: options.deps.now });
  options.log(result.ok ? "Shopify mutation verified; receipt recorded" : `Shopify mutation stopped: ${result.state}`);
  return result.ok ? 0 : 1;
}

async function listReceipts(root: string, log: (line: string) => void): Promise<number> {
  const receipts = await loadShopifyReceipts(root);
  for (const receipt of receipts) log(`${receipt.at}\t${receipt.planId}\t${receipt.status}\t${receipt.operation}\t${receipt.targetId}`);
  if (receipts.length === 0) log("no Shopify receipts"); return 0;
}

export async function runShopifyCommand(root: string, args: string[], deps: Deps = {}): Promise<number> {
  const log = deps.log ?? console.log, action = args[0];
  try {
    if (action === "receipts") return await listReceipts(root, log);
    if (action === "read") return await runRead(root, args, deps, log);
    if (action === "preview" || action === "apply") return await runMutation(root, action, args, { deps, log });
    log(USAGE); return 1;
  } catch { log("Shopify error: invalid profile, plan, ledger, credential, or provider state"); return 1; }
}
