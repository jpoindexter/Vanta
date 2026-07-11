import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type AutomationRecord = {
  id: string;
  blueprint: string;
  kind: "schedule" | "webhook";
  targetId: string;
  status: "active" | "paused";
  createdAt: string;
  updatedAt: string;
};

export type AutomationReceipt = {
  automationId: string;
  action: "created" | "paused" | "resumed" | "tested";
  status: "passed";
  detail: string;
  at: string;
};

const directory = (dataDir: string) => join(dataDir, "automations");
const recordsPath = (dataDir: string) => join(directory(dataDir), "automations.json");
const receiptsPath = (dataDir: string) => join(directory(dataDir), "receipts.jsonl");

export async function listAutomationRecords(dataDir: string): Promise<AutomationRecord[]> {
  try {
    const value = JSON.parse(await readFile(recordsPath(dataDir), "utf8")) as { automations?: AutomationRecord[] };
    return value.automations ?? [];
  } catch { return []; }
}

export async function writeAutomationRecords(dataDir: string, records: AutomationRecord[]): Promise<void> {
  await mkdir(directory(dataDir), { recursive: true });
  const path = recordsPath(dataDir), temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ version: 1, automations: records }, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export async function appendAutomationReceipt(dataDir: string, receipt: AutomationReceipt): Promise<void> {
  await mkdir(directory(dataDir), { recursive: true });
  await appendFile(receiptsPath(dataDir), `${JSON.stringify(receipt)}\n`, "utf8");
}

export async function listAutomationReceipts(dataDir: string, id?: string): Promise<AutomationReceipt[]> {
  try {
    const lines = (await readFile(receiptsPath(dataDir), "utf8")).split("\n").filter(Boolean);
    const receipts = lines.flatMap((line) => { try { return [JSON.parse(line) as AutomationReceipt]; } catch { return []; } });
    return id ? receipts.filter((item) => item.automationId === id) : receipts;
  } catch { return []; }
}
