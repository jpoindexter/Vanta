import { parseVarArgs } from "../blueprint/apply.js";
import { getAutomationBlueprint, listAutomationBlueprints } from "../automation-blueprints/catalog.js";
import {
  applyAutomation, listAutomations, listAutomationReceipts, previewAutomation, setAutomationStatus, testAutomation,
} from "../automation-blueprints/runtime.js";

type CommandDeps = { log?: (line: string) => void; now?: () => Date; env?: NodeJS.ProcessEnv };
type CommandContext = { dataDir: string; deps: CommandDeps; log: (line: string) => void };
const USAGE = "usage: vanta automation blueprints | preview <name> [key=value] | apply <name> [key=value] --yes | list | pause|resume|test|receipts <id>";

export async function runAutomationCommand(dataDir: string, args: string[], deps: CommandDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  try { return await route(dataDir, args, deps, log); }
  catch (error) { log(`automation error: ${(error as Error).message}`); return 1; }
}

async function route(dataDir: string, args: string[], deps: CommandDeps, log: (line: string) => void): Promise<number> {
  const context = { dataDir, deps, log };
  const action = args[0];
  if (action === "blueprints") return printBlueprints(deps.env ?? process.env, log);
  if (action === "preview" || action === "apply") return planOrApply(context, action, args.slice(1));
  if (action === "list") return printAutomations(dataDir, log);
  if (action === "pause" || action === "resume") return toggle(context, args[1], action);
  if (action === "test") return test(dataDir, args[1], deps, log);
  if (action === "receipts") return printReceipts(dataDir, args[1], log);
  log(USAGE);
  return 1;
}

async function printBlueprints(env: NodeJS.ProcessEnv, log: (line: string) => void): Promise<number> {
  const blueprints = await listAutomationBlueprints(env);
  for (const item of blueprints) log(`${item.name}\t${item.kind}\t${item.description}`);
  if (!blueprints.length) log("(no automation blueprints)");
  return 0;
}

async function planOrApply(context: CommandContext, action: "preview" | "apply", args: string[]): Promise<number> {
  const { dataDir, deps, log } = context;
  const name = args[0] ?? "";
  const blueprint = await getAutomationBlueprint(name, deps.env ?? process.env);
  if (!blueprint) throw new Error(`blueprint "${name}" not found`);
  const values = parseVarArgs(args.slice(1));
  const preview = previewAutomation(blueprint, values);
  if ("missing" in preview) { log(`Missing: ${preview.missing.join(", ")}`); return 1; }
  if (action === "preview") {
    log(`Preview ${name}: ${preview.summary}`);
    log(`Confirm: vanta automation apply ${name} ${formatValues(values)} --yes`);
    return 0;
  }
  const record = await applyAutomation(dataDir, blueprint, values, { confirmed: args.includes("--yes"), now: deps.now?.() });
  log(`created ${record.id}\t${record.status}\t${record.kind}`);
  log(`receipts: vanta automation receipts ${record.id}`);
  return 0;
}

function formatValues(values: Record<string, string>): string {
  return Object.entries(values).map(([key, value]) => `${key}=${value}`).join(" ");
}

async function printAutomations(dataDir: string, log: (line: string) => void): Promise<number> {
  const records = await listAutomations(dataDir);
  for (const item of records) log(`${item.id}\t${item.status}\t${item.kind}\t${item.blueprint}\treceipts: vanta automation receipts ${item.id}`);
  if (!records.length) log("(no automations; run `vanta automation blueprints`)");
  return 0;
}

async function toggle(context: CommandContext, id: string | undefined, action: "pause" | "resume"): Promise<number> {
  const { dataDir, deps, log } = context;
  if (!id) throw new Error(`${action} needs an automation id`);
  const record = await setAutomationStatus(dataDir, id, action === "resume" ? "active" : "paused", deps.now?.());
  log(`${record.id}\t${record.status}`);
  return 0;
}

async function test(dataDir: string, id: string | undefined, deps: CommandDeps, log: (line: string) => void): Promise<number> {
  if (!id) throw new Error("test needs an automation id");
  const item = await testAutomation(dataDir, id, deps.now?.());
  log(`${item.action}\t${item.status}\t${item.detail}`);
  return 0;
}

async function printReceipts(dataDir: string, id: string | undefined, log: (line: string) => void): Promise<number> {
  const receipts = await listAutomationReceipts(dataDir, id);
  for (const item of receipts) log(`${item.at}\t${item.action}\t${item.status}\t${item.detail}`);
  if (!receipts.length) log("(no automation receipts)");
  return 0;
}
