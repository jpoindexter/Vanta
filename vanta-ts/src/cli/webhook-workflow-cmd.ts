import { validateDeliverTarget } from "../gateway/webhook.js";
import { WEBHOOK_TEMPLATES, isWebhookTemplate } from "../webhook-workflows/templates.js";
import {
  appendWorkflowReceipt, createWorkflow, findWorkflow, listReceipts, listWorkflows, receipt, setWorkflowEnabled,
  type WebhookWorkflow,
} from "../webhook-workflows/store.js";

type CommandDeps = {
  log?: (line: string) => void;
  now?: () => Date;
  secret?: () => string;
};

const USAGE = [
  "usage: vanta webhook workflow new <github-pr|email|subscriber|generic> --id <id> [--name <name>] [--deliver <target>] [--prompt <text>] [--enable]",
  "       vanta webhook workflow list | show <id> | test <id> | enable <id> | disable <id>",
].join("\n");

export async function runWebhookCommand(dataDir: string, rest: string[], deps: CommandDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  if (rest[0] !== "workflow") { log(USAGE); return 1; }
  try {
    return await routeWorkflowCommand(dataDir, rest.slice(1), deps, log);
  } catch (error) {
    log(`webhook workflow error: ${(error as Error).message}`);
    return 1;
  }
}

async function routeWorkflowCommand(dataDir: string, args: string[], deps: CommandDeps, log: (line: string) => void): Promise<number> {
  const action = args[0];
  if (action === "new") return newWorkflow(dataDir, args.slice(1), deps, log);
  if (action === "list") return listCommand(dataDir, log);
  if (action === "show") return showCommand(dataDir, args[1], log);
  if (action === "test") return testCommand(dataDir, args[1], deps, log);
  if (action === "enable" || action === "disable") return toggleCommand(dataDir, args[1], action === "enable", log);
  log(USAGE);
  return 1;
}

async function newWorkflow(dataDir: string, args: string[], deps: CommandDeps, log: (line: string) => void): Promise<number> {
  const templateId = args[0] ?? "";
  if (!isWebhookTemplate(templateId)) { log(`template must be: ${Object.keys(WEBHOOK_TEMPLATES).join(" | ")}`); return 1; }
  const flags = parseFlags(args.slice(1));
  const id = flags.id ?? generatedId(templateId, deps.now?.() ?? new Date());
  const deliver = flags.deliver ?? "local";
  assertDeliverTarget(deliver);
  const created = await createWorkflow(dataDir, {
    id, template: templateId, name: flags.name ?? WEBHOOK_TEMPLATES[templateId].name,
    deliver, prompt: flags.prompt, secret: deps.secret?.(), now: deps.now?.(),
  });
  if (flags.enable === "true") await setWorkflowEnabled(dataDir, id, true);
  printCreated(created, log);
  return 0;
}

type Flags = Record<string, string>;

function parseFlags(args: string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < args.length; index++) {
    const token = args[index]!;
    if (token === "--enable") { flags.enable = "true"; continue; }
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} needs a value`);
    flags[token.slice(2)] = value;
    index++;
  }
  return flags;
}

function generatedId(template: string, now: Date): string {
  return `${template}-${now.toISOString().replace(/\D/g, "").slice(0, 14)}`;
}

function printCreated(created: Awaited<ReturnType<typeof createWorkflow>>, log: (line: string) => void): void {
  log(`created ${created.workflow.id} (${created.workflow.template}, disabled)`);
  log(`route: ${created.workflow.route}`);
  log(`deliver: ${created.workflow.deliver}`);
  log(`secret (shown once): ${created.secret}`);
  log(`test payload: ${created.samplePayload}`);
  log("dry-run: passed (route, prompt, and delivery target validated; no agent call sent)");
  log(`enable: vanta webhook workflow enable ${created.workflow.id}`);
}

async function listCommand(dataDir: string, log: (line: string) => void): Promise<number> {
  const workflows = await listWorkflows(dataDir);
  if (!workflows.length) { log("(no webhook workflows; run `vanta webhook workflow new generic --id <id>`)"); return 0; }
  for (const workflow of workflows) log(`${workflow.id}\t${workflow.enabled ? "enabled" : "disabled"}\t${workflow.template}\t${workflow.route}\t${workflow.deliver}`);
  return 0;
}

async function showCommand(dataDir: string, id: string | undefined, log: (line: string) => void): Promise<number> {
  const workflow = id ? await findWorkflow(dataDir, id) : null;
  if (!workflow) return notFound(id, log);
  printWorkflow(workflow, log);
  const receipts = await listReceipts(dataDir, workflow.id);
  log("receipts:");
  for (const item of receipts.slice(-10)) log(`  ${item.at} ${item.phase} ${item.status}: ${item.detail}`);
  return 0;
}

function printWorkflow(workflow: WebhookWorkflow, log: (line: string) => void): void {
  log(`${workflow.id} (${workflow.enabled ? "enabled" : "disabled"})`);
  log(`  ${workflow.name} · ${workflow.template}`);
  log(`  route ${workflow.route} -> ${workflow.deliver}`);
  log(`  prompt ${workflow.prompt}`);
}

async function testCommand(dataDir: string, id: string | undefined, deps: CommandDeps, log: (line: string) => void): Promise<number> {
  const workflow = id ? await findWorkflow(dataDir, id) : null;
  if (!workflow) return notFound(id, log);
  assertDeliverTarget(workflow.deliver);
  const sample = WEBHOOK_TEMPLATES[workflow.template].samplePayload;
  const chars = workflow.prompt.replace("{body}", sample).length;
  const at = (deps.now?.() ?? new Date()).toISOString();
  await appendWorkflowReceipt(dataDir, receipt({ workflowId: workflow.id, phase: "dry-run", status: "passed", detail: `sample produced ${chars} prompt chars`, at }));
  log(`dry-run passed: ${workflow.id} · ${chars} prompt chars · delivery ${workflow.deliver} ready`);
  return 0;
}

async function toggleCommand(dataDir: string, id: string | undefined, enabled: boolean, log: (line: string) => void): Promise<number> {
  const workflow = id ? await setWorkflowEnabled(dataDir, id, enabled) : null;
  if (!workflow) return notFound(id, log);
  log(`${workflow.id} ${enabled ? "enabled" : "disabled"} · ${workflow.route}`);
  return 0;
}

function notFound(id: string | undefined, log: (line: string) => void): 1 {
  log(`workflow not found: ${id ?? "(missing id)"}`);
  return 1;
}

function assertDeliverTarget(target: string): void {
  const result = validateDeliverTarget(target);
  if (!result.ok) throw new Error(result.error);
}
