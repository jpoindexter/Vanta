import { chmod, mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { PaymentContract, PaymentReceiptSummary } from "./contract.js";

const StatusSchema = z.enum(["denied", "reserved", "authorized", "settled", "failed"]);
const ReceiptSchema = z.object({
  version: z.literal(1), eventId: z.string().uuid(), transactionId: z.string(), at: z.string().datetime(),
  provider: z.enum(["stripe_link", "mpp", "stripe_projects"]),
  merchant: z.string(), item: z.string(), currency: z.string(), amountMinor: z.number().int().nonnegative(),
  status: StatusSchema,
  approval: z.object({ operator: z.enum(["approved", "denied"]), operatorAt: z.string().datetime(), external: z.enum(["required", "approved", "not_available", "denied", "timeout"]) }).strict(),
  providerResult: z.object({ redactedId: z.string().max(120).optional(), state: z.string().max(80), httpStatus: z.number().int().optional(), challengeHash: z.string().length(64).optional() }).strict(),
  vaultRefs: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/)).optional(),
  cleanup: z.object({ transientCredentialsRemoved: z.boolean(), plaintextPersisted: z.literal(false), environmentWritten: z.literal(false) }).strict(),
}).strict();
export type PaymentReceipt = z.infer<typeof ReceiptSchema>;

export function paymentLedgerPath(root: string): string {
  return join(root, ".vanta", "payments", "receipts.jsonl");
}

export async function loadPaymentReceipts(root: string): Promise<PaymentReceipt[]> {
  let raw: string;
  try { raw = await readFile(paymentLedgerPath(root), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  return raw.split("\n").filter(Boolean).map((line, index) => {
    const parsed = ReceiptSchema.safeParse(JSON.parse(line));
    if (!parsed.success) throw new Error(`invalid payment receipt at line ${index + 1}`);
    return parsed.data;
  });
}

export function summarizePaymentReceipts(events: readonly PaymentReceipt[]): PaymentReceiptSummary[] {
  const latest = new Map<string, PaymentReceipt>();
  for (const event of events) latest.set(event.transactionId, event);
  return [...latest.values()].map((event) => ({
    transactionId: event.transactionId, at: event.at, currency: event.currency,
    amountMinor: event.amountMinor,
    status: event.status === "reserved" ? "authorized" : event.status,
  } as PaymentReceiptSummary));
}

export function redactProviderId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/[^a-zA-Z0-9_-]/g, "");
  if (clean.length <= 8) return "[redacted]";
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

export function hashChallenge(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildReceipt(contract: PaymentContract, input: {
  at: string; status: PaymentReceipt["status"]; operator: "approved" | "denied";
  external: PaymentReceipt["approval"]["external"]; providerState: string;
  providerId?: string; httpStatus?: number; challengeHash?: string; vaultRefs?: string[];
}): PaymentReceipt {
  return ReceiptSchema.parse({
    version: 1, eventId: randomUUID(), transactionId: contract.id, at: input.at,
    provider: contract.provider, merchant: contract.merchant.name, item: contract.item.name,
    currency: contract.currency, amountMinor: contract.amountMinor, status: input.status,
    approval: { operator: input.operator, operatorAt: input.at, external: input.external },
    providerResult: { redactedId: redactProviderId(input.providerId), state: input.providerState, httpStatus: input.httpStatus, challengeHash: input.challengeHash },
    vaultRefs: input.vaultRefs,
    cleanup: { transientCredentialsRemoved: true, plaintextPersisted: false, environmentWritten: false },
  });
}

export async function appendPaymentReceipt(root: string, receipt: PaymentReceipt): Promise<void> {
  const path = paymentLedgerPath(root);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(path, "a", 0o600);
  try { await handle.appendFile(`${JSON.stringify(ReceiptSchema.parse(receipt))}\n`, "utf8"); }
  finally { await handle.close(); }
  await chmod(path, 0o600);
}

async function stale(path: string, now: number): Promise<boolean> {
  try { return now - (await stat(path)).mtimeMs > 30_000; } catch { return false; }
}

export async function withPaymentLedgerLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const lock = join(root, ".vanta", "payments", "ledger.lock");
  await mkdir(dirname(lock), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      const handle = await open(lock, "wx", 0o600); await handle.close();
      try { return await operation(); } finally { await rm(lock, { force: true }); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await stale(lock, Date.now())) { await rm(lock, { force: true }); continue; }
      if (Date.now() >= deadline) throw new Error("payment ledger is busy");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}
