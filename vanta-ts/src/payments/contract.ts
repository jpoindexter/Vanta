import { z } from "zod";

const SafeText = z.string().trim().min(1).max(160).refine(
  (value) => !/[\u0000-\u001f\u007f]/.test(value),
  "control characters are not allowed",
).refine((value) => !value.includes(","), "commas are not allowed in payment labels");
const Currency = z.string().regex(/^[a-z][a-z0-9]{1,11}$/, "currency must be lowercase");
const VaultAlias = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/, "invalid vault alias");
const HttpsUrl = z.string().url().refine((value) => new URL(value).protocol === "https:", "URL must use HTTPS");

const CapsSchema = z.object({
  perPurchaseMinor: z.number().int().nonnegative(),
  periodMinor: z.number().int().nonnegative(),
  period: z.enum(["day", "month"]),
}).strict();

const BaseSchema = z.object({
  version: z.literal(1),
  environment: z.literal("test"),
  id: z.string().regex(/^pay_[a-zA-Z0-9_-]{8,80}$/, "invalid transaction id"),
  merchant: z.object({ name: SafeText, url: HttpsUrl }).strict(),
  item: z.object({ name: SafeText, quantity: z.literal(1) }).strict(),
  currency: Currency,
  currencyExponent: z.number().int().min(0).max(12).default(2),
  amountMinor: z.number().int().nonnegative(),
  caps: CapsSchema,
  expiresAt: z.string().datetime({ offset: true }),
}).strict();

const StripeLinkSchema = BaseSchema.extend({
  provider: z.literal("stripe_link"),
  credential: z.object({ type: z.literal("link_cli"), storage: z.literal("provider_cli") }).strict(),
}).strict();

const MppSchema = BaseSchema.extend({
  provider: z.literal("mpp"),
  credential: z.object({ type: z.literal("link_cli"), storage: z.literal("provider_cli") }).strict(),
  request: z.object({
    url: HttpsUrl,
    method: z.enum(["GET", "POST"]).default("GET"),
    body: z.string().max(16_384).optional(),
  }).strict(),
}).strict();

const ProvisionSchema = BaseSchema.extend({
  provider: z.literal("stripe_projects"),
  credential: z.object({ type: z.literal("stripe_cli"), storage: z.literal("provider_cli") }).strict(),
  provisioning: z.object({ service: SafeText, credentialVaultRefs: z.array(VaultAlias).min(1).max(32) }).strict(),
}).strict();

export const PaymentContractSchema = z.discriminatedUnion("provider", [
  StripeLinkSchema,
  MppSchema,
  ProvisionSchema,
]);
export type PaymentContract = z.infer<typeof PaymentContractSchema>;

export type PaymentReceiptSummary = {
  transactionId: string;
  at: string;
  currency: string;
  amountMinor: number;
  status: "authorized" | "settled" | "denied" | "failed";
};

export type ContractAssessment = { ok: boolean; issues: string[]; periodSpentMinor: number };

function periodStart(now: Date, period: "day" | "month"): number {
  return period === "day"
    ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

export function assessPaymentContract(
  contract: PaymentContract,
  receipts: readonly PaymentReceiptSummary[],
  now = new Date(),
): ContractAssessment {
  const issues: string[] = [];
  if (Date.parse(contract.expiresAt) <= now.getTime()) issues.push("transaction contract expired");
  if (contract.amountMinor > contract.caps.perPurchaseMinor) issues.push("amount exceeds per-purchase cap");
  const start = periodStart(now, contract.caps.period);
  const spent = receipts.filter((receipt) =>
    receipt.currency === contract.currency
      && ["authorized", "settled"].includes(receipt.status)
      && Date.parse(receipt.at) >= start
      && Date.parse(receipt.at) <= now.getTime()
  ).reduce((sum, receipt) => sum + receipt.amountMinor, 0);
  if (spent + contract.amountMinor > contract.caps.periodMinor) issues.push("amount exceeds period cap");
  if (receipts.some((receipt) => receipt.transactionId === contract.id)) issues.push("transaction id already has a receipt");
  return { ok: issues.length === 0, issues, periodSpentMinor: spent };
}

export function formatPaymentPreview(contract: PaymentContract, assessment: ContractAssessment): string {
  const amount = `${contract.amountMinor} ${contract.currency} minor units`;
  return [
    `${contract.provider}: ${contract.merchant.name}`,
    `${contract.item.name} x1`,
    `exact total: ${amount}`,
    `per-purchase cap: ${contract.caps.perPurchaseMinor}`,
    `${contract.caps.period} cap: ${assessment.periodSpentMinor + contract.amountMinor}/${contract.caps.periodMinor}`,
    `expires: ${contract.expiresAt}`,
    `transaction: ${contract.id}`,
  ].join("\n");
}
