import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { hashShopifyPayload, type ShopifyMutationPlan } from "./schema.js";

const ReceiptSchema = z.object({
  version: z.literal(1), eventId: z.string().uuid(), planId: z.string(), at: z.string().datetime(),
  store: z.string(), operation: z.enum(["product_update", "inventory_set"]), targetId: z.string(),
  scopes: z.array(z.string()), idempotencyKey: z.string().uuid(), requestHash: z.string().length(64),
  status: z.enum(["denied", "reserved", "verified", "failed"]), resultHash: z.string().length(64).optional(),
  state: z.string().max(80), verified: z.boolean(), userErrorCount: z.number().int().nonnegative(),
  credentialPersisted: z.literal(false), customerDataPersisted: z.literal(false),
}).strict();
export type ShopifyReceipt = z.infer<typeof ReceiptSchema>;

export function shopifyReceiptPath(root: string): string {
  return join(root, ".vanta", "shopify", "receipts.jsonl");
}

export async function loadShopifyReceipts(root: string): Promise<ShopifyReceipt[]> {
  let raw: string;
  try { raw = await readFile(shopifyReceiptPath(root), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  return raw.split("\n").filter(Boolean).map((line, index) => {
    const parsed = ReceiptSchema.safeParse(JSON.parse(line));
    if (!parsed.success) throw new Error(`invalid Shopify receipt at line ${index + 1}`);
    return parsed.data;
  });
}

export function buildShopifyReceipt(plan: ShopifyMutationPlan, input: {
  at: string; status: ShopifyReceipt["status"]; state: string; result?: unknown; userErrorCount?: number;
}): ShopifyReceipt {
  const targetId = plan.operation === "product_update" ? plan.input.id : plan.input.inventoryItemId;
  return ReceiptSchema.parse({
    version: 1, eventId: randomUUID(), planId: plan.id, at: input.at, store: plan.profile.store,
    operation: plan.operation, targetId, scopes: plan.profile.scopes, idempotencyKey: plan.idempotencyKey,
    requestHash: hashShopifyPayload(plan.input), status: input.status,
    resultHash: input.result === undefined ? undefined : hashShopifyPayload(input.result),
    state: input.state, verified: input.status === "verified", userErrorCount: input.userErrorCount ?? 0,
    credentialPersisted: false, customerDataPersisted: false,
  });
}

export async function appendShopifyReceipt(root: string, receipt: ShopifyReceipt): Promise<void> {
  const path = shopifyReceiptPath(root); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(path, "a", 0o600);
  try { await handle.appendFile(`${JSON.stringify(ReceiptSchema.parse(receipt))}\n`, "utf8"); }
  finally { await handle.close(); }
  await chmod(path, 0o600);
}

async function stale(path: string): Promise<boolean> {
  try { return Date.now() - (await stat(path)).mtimeMs > 30_000; } catch { return false; }
}

export async function withShopifyReceiptLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const lock = join(root, ".vanta", "shopify", "receipts.lock"); await mkdir(dirname(lock), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      const handle = await open(lock, "wx", 0o600); await handle.close();
      try { return await operation(); } finally { await rm(lock, { force: true }); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await stale(lock)) { await rm(lock, { force: true }); continue; }
      if (Date.now() >= deadline) throw new Error("Shopify receipt ledger is busy");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}
