import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { callbackRank, type TelephonyCallback } from "./callbacks.js";
import { hashTelephonyAction, type TelephonyAction } from "./schema.js";

const ReceiptSchema = z.object({
  version: z.literal(1), eventId: z.string().uuid(), actionId: z.string(), at: z.string().datetime(),
  action: z.enum(["sms", "call", "number_provision"]), provider: z.literal("twilio"),
  providerId: z.string().optional(), recipientHash: z.string().length(64), purposeHash: z.string().length(64),
  idempotencyKey: z.string().uuid(), actionHash: z.string().length(64),
  status: z.enum(["denied", "reserved", "accepted", "failed", "callback"]), providerStatus: z.string().max(80),
  callbackKind: z.enum(["message", "call", "recording"]).optional(), callbackRank: z.number().int().nonnegative().optional(),
  sequence: z.number().int().nonnegative().optional(), durationSeconds: z.number().int().nonnegative().optional(),
  recordingSid: z.string().optional(), retainUntil: z.string().datetime(),
  credentialPersisted: z.literal(false), contentPersisted: z.literal(false),
}).strict();
export type TelephonyReceipt = z.infer<typeof ReceiptSchema>;

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function telephonyReceiptPath(root: string): string { return join(root, ".vanta", "telephony", "receipts.jsonl"); }

export async function loadTelephonyReceipts(root: string): Promise<TelephonyReceipt[]> {
  let raw: string;
  try { raw = await readFile(telephonyReceiptPath(root), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  return raw.split("\n").filter(Boolean).map((line, index) => {
    const parsed = ReceiptSchema.safeParse(JSON.parse(line)); if (!parsed.success) throw new Error(`invalid telephony receipt at line ${index + 1}`); return parsed.data;
  });
}

function retainedUntil(action: TelephonyAction, at: string): string {
  return new Date(Date.parse(at) + action.retention.receiptDays * 86_400_000).toISOString();
}

export function buildTelephonyReceipt(action: TelephonyAction, input: {
  at: string; status: TelephonyReceipt["status"]; providerStatus: string; providerId?: string; callback?: TelephonyCallback;
}): TelephonyReceipt {
  const target = action.action === "number_provision" ? action.phoneNumber : action.recipient, callback = input.callback;
  return ReceiptSchema.parse({
    version: 1, eventId: randomUUID(), actionId: action.id, at: input.at, action: action.action, provider: "twilio",
    providerId: input.providerId ?? callback?.providerId, recipientHash: hash(target), purposeHash: hash(action.purpose),
    idempotencyKey: action.idempotencyKey, actionHash: hashTelephonyAction(action), status: input.status,
    providerStatus: input.providerStatus, callbackKind: callback?.kind, callbackRank: callback ? callbackRank(callback.status) : undefined,
    sequence: callback?.sequence, durationSeconds: callback?.durationSeconds, recordingSid: callback?.recordingSid,
    retainUntil: retainedUntil(action, input.at), credentialPersisted: false, contentPersisted: false,
  });
}

export function buildTelephonyCallbackReceipt(prior: TelephonyReceipt, callback: TelephonyCallback, at: string): TelephonyReceipt {
  return ReceiptSchema.parse({
    ...prior, eventId: randomUUID(), at, status: "callback", providerId: callback.providerId,
    providerStatus: callback.status, callbackKind: callback.kind, callbackRank: callbackRank(callback.status),
    sequence: callback.sequence, durationSeconds: callback.durationSeconds, recordingSid: callback.recordingSid,
  });
}

export async function appendTelephonyReceipt(root: string, receipt: TelephonyReceipt): Promise<void> {
  const path = telephonyReceiptPath(root); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(path, "a", 0o600); try { await handle.appendFile(`${JSON.stringify(ReceiptSchema.parse(receipt))}\n`, "utf8"); } finally { await handle.close(); }
  await chmod(path, 0o600);
}

function receiptRank(receipt: TelephonyReceipt | undefined): number {
  return receipt?.callbackRank ?? (receipt?.status === "accepted" ? 1 : 0);
}

function shouldReplace(prior: TelephonyReceipt | undefined, next: TelephonyReceipt): boolean {
  if (!prior) return true;
  if (receiptRank(next) !== receiptRank(prior)) return receiptRank(next) > receiptRank(prior);
  return (next.sequence ?? 0) >= (prior.sequence ?? 0);
}

export function latestTelephonyStates(receipts: readonly TelephonyReceipt[]): TelephonyReceipt[] {
  const latest = new Map<string, TelephonyReceipt>();
  for (const receipt of receipts) {
    const key = receipt.providerId ?? receipt.actionId, prior = latest.get(key);
    if (shouldReplace(prior, receipt)) latest.set(key, receipt);
  }
  return [...latest.values()];
}

export async function pruneTelephonyReceipts(root: string, now = new Date()): Promise<number> {
  const path = telephonyReceiptPath(root), receipts = await loadTelephonyReceipts(root);
  const kept = receipts.filter((receipt) => Date.parse(receipt.retainUntil) > now.getTime()), removed = receipts.length - kept.length;
  if (removed === 0) return 0;
  const temp = `${path}.tmp`; await writeFile(temp, kept.map((receipt) => JSON.stringify(receipt)).join("\n") + (kept.length ? "\n" : ""), { encoding: "utf8", mode: 0o600 }); await rename(temp, path); await chmod(path, 0o600); return removed;
}

async function stale(path: string): Promise<boolean> { try { return Date.now() - (await stat(path)).mtimeMs > 30_000; } catch { return false; } }
export async function withTelephonyReceiptLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const lock = join(root, ".vanta", "telephony", "receipts.lock"); await mkdir(dirname(lock), { recursive: true, mode: 0o700 }); const deadline = Date.now() + 5_000;
  while (true) {
    try { const handle = await open(lock, "wx", 0o600); await handle.close(); try { return await operation(); } finally { await rm(lock, { force: true }); } }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; if (await stale(lock)) { await rm(lock, { force: true }); continue; } if (Date.now() >= deadline) throw new Error("telephony receipt ledger is busy"); await new Promise((resolve) => setTimeout(resolve, 25)); }
  }
}
