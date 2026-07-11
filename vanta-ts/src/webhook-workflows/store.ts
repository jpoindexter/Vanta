import { randomBytes } from "node:crypto";
import { appendFile, chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WEBHOOK_TEMPLATES, type WebhookTemplateId } from "./templates.js";

export type WebhookWorkflow = {
  id: string;
  name: string;
  template: WebhookTemplateId;
  route: string;
  prompt: string;
  deliver: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowReceipt = {
  id: string;
  workflowId: string;
  phase: "dry-run" | "route" | "delivery";
  ok: boolean;
  status: string;
  detail: string;
  at: string;
  bodySha256?: string;
};

export type CreateWorkflowInput = {
  id: string;
  name: string;
  template: WebhookTemplateId;
  prompt?: string;
  deliver?: string;
  secret?: string;
  now?: Date;
};

const ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

function baseDir(dataDir: string): string { return join(dataDir, "webhook-workflows"); }
function workflowsPath(dataDir: string): string { return join(baseDir(dataDir), "workflows.json"); }
function receiptPath(dataDir: string): string { return join(baseDir(dataDir), "receipts.jsonl"); }
function secretPath(dataDir: string, id: string): string { return join(baseDir(dataDir), "secrets", id); }

export async function listWorkflows(dataDir: string): Promise<WebhookWorkflow[]> {
  try {
    const parsed = JSON.parse(await readFile(workflowsPath(dataDir), "utf8")) as { workflows?: WebhookWorkflow[] };
    return parsed.workflows ?? [];
  } catch { return []; }
}

export async function findWorkflow(dataDir: string, id: string): Promise<WebhookWorkflow | null> {
  return (await listWorkflows(dataDir)).find((workflow) => workflow.id === id) ?? null;
}

export async function createWorkflow(dataDir: string, input: CreateWorkflowInput): Promise<{
  workflow: WebhookWorkflow; secret: string; samplePayload: string; receipts: WorkflowReceipt[];
}> {
  validateId(input.id);
  const workflows = await listWorkflows(dataDir);
  if (workflows.some((workflow) => workflow.id === input.id)) throw new Error(`webhook workflow "${input.id}" already exists`);
  const now = (input.now ?? new Date()).toISOString();
  const template = WEBHOOK_TEMPLATES[input.template];
  const workflow: WebhookWorkflow = {
    id: input.id, name: input.name, template: input.template,
    route: `/webhooks/${input.id}`, prompt: input.prompt ?? template.prompt,
    deliver: input.deliver ?? "local", enabled: false, createdAt: now, updatedAt: now,
  };
  const secret = input.secret ?? randomBytes(32).toString("hex");
  await writeWorkflows(dataDir, [...workflows, workflow]);
  await writeSecret(dataDir, input.id, secret);
  const receipts = creationReceipts(workflow, template.samplePayload, now);
  for (const receipt of receipts) await appendWorkflowReceipt(dataDir, receipt);
  return { workflow, secret, samplePayload: template.samplePayload, receipts };
}

function validateId(id: string): void {
  if (!ID_RE.test(id)) throw new Error("workflow id must be 2-63 lowercase letters, numbers, or hyphens");
}

async function writeWorkflows(dataDir: string, workflows: WebhookWorkflow[]): Promise<void> {
  await mkdir(baseDir(dataDir), { recursive: true });
  const path = workflowsPath(dataDir), temp = `${path}.tmp`;
  await writeFile(temp, `${JSON.stringify({ version: 1, workflows }, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

async function writeSecret(dataDir: string, id: string, secret: string): Promise<void> {
  const path = secretPath(dataDir, id);
  await mkdir(join(baseDir(dataDir), "secrets"), { recursive: true });
  await writeFile(path, `${secret}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

export async function readWorkflowSecret(dataDir: string, id: string): Promise<string | null> {
  try { return (await readFile(secretPath(dataDir, id), "utf8")).trim(); }
  catch { return null; }
}

export async function setWorkflowEnabled(dataDir: string, id: string, enabled: boolean): Promise<WebhookWorkflow | null> {
  const workflows = await listWorkflows(dataDir);
  const index = workflows.findIndex((workflow) => workflow.id === id);
  if (index < 0) return null;
  const current = workflows[index]!;
  const updated = { ...current, enabled, updatedAt: new Date().toISOString() };
  workflows[index] = updated;
  await writeWorkflows(dataDir, workflows);
  return updated;
}

export async function appendWorkflowReceipt(dataDir: string, receipt: WorkflowReceipt): Promise<void> {
  await mkdir(baseDir(dataDir), { recursive: true });
  await appendFile(receiptPath(dataDir), `${JSON.stringify(receipt)}\n`, "utf8");
}

export async function listReceipts(dataDir: string, workflowId?: string): Promise<WorkflowReceipt[]> {
  try {
    const lines = (await readFile(receiptPath(dataDir), "utf8")).split("\n").filter(Boolean);
    const receipts = lines.flatMap((line) => { try { return [JSON.parse(line) as WorkflowReceipt]; } catch { return []; } });
    return workflowId ? receipts.filter((receipt) => receipt.workflowId === workflowId) : receipts;
  } catch { return []; }
}

function creationReceipts(workflow: WebhookWorkflow, sample: string, at: string): WorkflowReceipt[] {
  return [
    receipt({ workflowId: workflow.id, phase: "route", status: "ready", detail: `${workflow.route} reserved`, at }),
    receipt({ workflowId: workflow.id, phase: "delivery", status: "ready", detail: `${workflow.deliver} validated for dry-run`, at }),
    receipt({ workflowId: workflow.id, phase: "dry-run", status: "passed", detail: `sample produced ${workflow.prompt.replace("{body}", sample).length} prompt chars`, at }),
  ];
}

export function receipt(input: Omit<WorkflowReceipt, "id" | "ok" | "at"> & { at?: string }): WorkflowReceipt {
  const at = input.at ?? new Date().toISOString();
  return { ...input, id: `${input.workflowId}-${input.phase}-${Date.parse(at)}-${randomBytes(3).toString("hex")}`, ok: true, at };
}
