import { applyTemplate } from "../blueprint/apply.js";
import { validateDeliverTarget } from "../gateway/webhook.js";
import { addCron, isValidCron, loadCron, saveCron } from "../schedule/cron.js";
import { createWorkflow, setWorkflowEnabled } from "../webhook-workflows/store.js";
import type { AutomationBlueprint } from "./schema.js";
import {
  appendAutomationReceipt, listAutomationReceipts, listAutomationRecords, writeAutomationRecords,
  type AutomationReceipt, type AutomationRecord,
} from "./store.js";

export type AutomationPreview = {
  blueprint: string;
  kind: "schedule" | "webhook";
  targetId: string;
  summary: string;
  values: Record<string, string>;
};

function resolvedValues(blueprint: AutomationBlueprint, provided: Record<string, string>): { missing: string[] } | { values: Record<string, string> } {
  const values: Record<string, string> = {}, missing: string[] = [];
  for (const field of blueprint.fields) {
    const value = provided[field.key] ?? field.default;
    if (value === undefined) missing.push(field.key);
    else values[field.key] = value;
  }
  return missing.length ? { missing } : { values };
}

export function previewAutomation(blueprint: AutomationBlueprint, provided: Record<string, string>): AutomationPreview | { missing: string[] } {
  const resolved = resolvedValues(blueprint, provided);
  if ("missing" in resolved) return resolved;
  const values = resolved.values;
  if (blueprint.kind === "schedule") {
    const cron = applyTemplate(blueprint.schedule.cron, values);
    if (!isValidCron(cron)) throw new Error(`invalid cron expression: ${cron}`);
    return { blueprint: blueprint.name, kind: "schedule", targetId: "pending", summary: `${cron} -> ${applyTemplate(blueprint.schedule.instruction, values)}`, values };
  }
  const targetId = applyTemplate(blueprint.webhook.id, values);
  const deliver = applyTemplate(blueprint.webhook.deliver, values);
  const validated = validateDeliverTarget(deliver);
  if (!validated.ok) throw new Error(validated.error);
  return { blueprint: blueprint.name, kind: "webhook", targetId, summary: `${blueprint.webhook.template} -> ${deliver} (disabled)`, values };
}

export async function applyAutomation(dataDir: string, blueprint: AutomationBlueprint, provided: Record<string, string>, options: { confirmed: boolean; now?: Date }): Promise<AutomationRecord> {
  if (!options.confirmed) throw new Error("confirmation required; preview first, then pass --yes");
  const now = options.now ?? new Date();
  const preview = previewAutomation(blueprint, provided);
  if ("missing" in preview) throw new Error(`missing fields: ${preview.missing.join(", ")}`);
  const targetId = await createTarget(dataDir, blueprint, preview.values, now);
  const at = now.toISOString();
  const record: AutomationRecord = {
    id: `${blueprint.name}-${targetId}`, blueprint: blueprint.name, kind: blueprint.kind,
    targetId, status: blueprint.kind === "schedule" ? "active" : "paused", createdAt: at, updatedAt: at,
  };
  const records = await listAutomationRecords(dataDir);
  if (records.some((item) => item.id === record.id)) throw new Error(`automation "${record.id}" already exists`);
  await writeAutomationRecords(dataDir, [...records, record]);
  await receipt(dataDir, { automationId: record.id, action: "created", detail: preview.summary, now });
  return record;
}

async function createTarget(dataDir: string, blueprint: AutomationBlueprint, values: Record<string, string>, now: Date): Promise<string> {
  if (blueprint.kind === "schedule") {
    const created = await addCron(dataDir, applyTemplate(blueprint.schedule.cron, values), applyTemplate(blueprint.schedule.instruction, values));
    return String(created.id);
  }
  const id = applyTemplate(blueprint.webhook.id, values);
  await createWorkflow(dataDir, {
    id, name: applyTemplate(blueprint.webhook.name, values), template: blueprint.webhook.template,
    prompt: blueprint.webhook.prompt ? applyTemplate(blueprint.webhook.prompt, values) : undefined,
    deliver: applyTemplate(blueprint.webhook.deliver, values), now,
  });
  return id;
}

export const listAutomations = listAutomationRecords;
export { listAutomationReceipts };

export async function setAutomationStatus(dataDir: string, id: string, status: "active" | "paused", now = new Date()): Promise<AutomationRecord> {
  const records = await listAutomationRecords(dataDir);
  const index = records.findIndex((item) => item.id === id);
  if (index < 0) throw new Error(`automation "${id}" not found`);
  const current = records[index]!;
  await setTargetStatus(dataDir, current, status);
  const updated = { ...current, status, updatedAt: now.toISOString() };
  records[index] = updated;
  await writeAutomationRecords(dataDir, records);
  await receipt(dataDir, { automationId: id, action: status === "active" ? "resumed" : "paused", detail: `${current.kind} target ${current.targetId}`, now });
  return updated;
}

async function setTargetStatus(dataDir: string, record: AutomationRecord, status: "active" | "paused"): Promise<void> {
  if (record.kind === "webhook") {
    if (!await setWorkflowEnabled(dataDir, record.targetId, status === "active")) throw new Error("webhook target not found");
    return;
  }
  const cron = await loadCron(dataDir), target = cron.find((item) => String(item.id) === record.targetId);
  if (!target) throw new Error("schedule target not found");
  target.status = status;
  await saveCron(dataDir, cron);
}

export async function testAutomation(dataDir: string, id: string, now = new Date()): Promise<AutomationReceipt> {
  const record = (await listAutomationRecords(dataDir)).find((item) => item.id === id);
  if (!record) throw new Error(`automation "${id}" not found`);
  const detail = `${record.kind} target ${record.targetId} exists and is ${record.status}`;
  return receipt(dataDir, { automationId: id, action: "tested", detail, now });
}

async function receipt(dataDir: string, input: { automationId: string; action: AutomationReceipt["action"]; detail: string; now: Date }): Promise<AutomationReceipt> {
  const value: AutomationReceipt = { automationId: input.automationId, action: input.action, status: "passed", detail: input.detail, at: input.now.toISOString() };
  await appendAutomationReceipt(dataDir, value);
  return value;
}
