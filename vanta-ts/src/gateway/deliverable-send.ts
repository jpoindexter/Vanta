import { appendFile, mkdir, readFile } from "node:fs/promises";
import type { DeliverableFile } from "./deliverables.js";
import type { OutboundFileDeliveryReceipt, PlatformAdapter } from "./platforms/base.js";

export async function sendDeliverables(opts: {
  dataDir: string; platform: PlatformAdapter; target: { chatId: string; threadId?: string };
  files: DeliverableFile[]; log?: (message: string) => void; now?: () => Date;
}): Promise<{ sent: number; skipped: string[] }> {
  const skipped: string[] = [];
  if (!opts.platform.sendFile) {
    return { sent: 0, skipped: opts.files.map((file) => `${file.name}: channel ${opts.platform.id} does not support native files`) };
  }
  let sent = 0;
  for (const file of opts.files) {
    try {
      const data = await readFile(file.path);
      const receipt = await opts.platform.sendFile({ ...opts.target, name: file.name, mime: file.mime, data });
      if (!receipt) { skipped.push(`${file.name}: delivery unacknowledged`); continue; }
      await appendReceipt(opts.dataDir, receipt, file.source, opts.now?.() ?? new Date());
      opts.log?.(`  📎 delivered ${file.name} (${receipt.bytes} bytes)`);
      sent += 1;
    } catch (error) { skipped.push(`${file.name}: ${(error as Error).message}`); }
  }
  return { sent, skipped };
}

async function appendReceipt(dataDir: string, receipt: OutboundFileDeliveryReceipt, source: DeliverableFile["source"], now: Date): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const event = { ...receipt, source, at: now.toISOString() };
  await appendFile(`${dataDir}/deliverable-receipts.jsonl`, `${JSON.stringify(event)}\n`, "utf8");
}
