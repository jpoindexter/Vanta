import type { WorkflowPortType } from "./node-schema.js";

export function validWorkflowValue(type: WorkflowPortType, value: unknown): boolean {
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "artifact-ref") return referenceValue(value, "artifactRef");
  if (type === "secret-ref") return referenceValue(value, "secretRef");
  return jsonValue(value);
}

function referenceValue(value: unknown, key: "artifactRef" | "secretRef"): boolean {
  return !!value && typeof value === "object" && typeof (value as Record<string, unknown>)[key] === "string";
}

function jsonValue(value: unknown): boolean {
  try { JSON.stringify(value); return value !== undefined; } catch { return false; }
}
