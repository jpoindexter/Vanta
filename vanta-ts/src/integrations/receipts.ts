import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { IntegrationId, IntegrationReceipt } from "./types.js";

function receiptPath(root: string): string {
  return join(root, ".vanta", "integrations", "receipts.jsonl");
}

export function redactIntegrationDetail(value: string): string {
  return value
    .replace(/(bearer|token|secret|password|key)([=: ]+)[^\s,;]+/gi, "$1$2[redacted]")
    .replace(/https?:\/\/[^\s?#]+\?[^\s]+/gi, (url) => url.split("?")[0] ?? url);
}

export async function appendIntegrationReceipt(
  root: string,
  value: Omit<IntegrationReceipt, "version" | "at" | "detail"> & { detail: string; at?: Date },
): Promise<IntegrationReceipt> {
  const receipt: IntegrationReceipt = {
    version: 1,
    at: (value.at ?? new Date()).toISOString(),
    integration: value.integration,
    action: value.action,
    outcome: value.outcome,
    detail: redactIntegrationDetail(value.detail),
  };
  const path = receiptPath(root);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await appendFile(path, `${JSON.stringify(receipt)}\n`, { encoding: "utf8", mode: 0o600 });
  return receipt;
}

export async function readIntegrationReceipts(root: string): Promise<IntegrationReceipt[]> {
  try {
    return (await readFile(receiptPath(root), "utf8")).split("\n").filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line) as IntegrationReceipt]; } catch { return []; }
    });
  } catch {
    return [];
  }
}

export function latestIntegrationReceipt(
  receipts: readonly IntegrationReceipt[],
  integration: IntegrationId,
): IntegrationReceipt | undefined {
  return [...receipts].reverse().find((receipt) => receipt.integration === integration);
}
