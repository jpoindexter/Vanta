import { z } from "zod";

const SafeText = z.string().trim().min(1).max(160).refine(
  (value) => !/[\u0000-\u001f\u007f]/.test(value),
  "control characters are not allowed",
).refine((value) => !value.includes(","), "commas are not allowed in payment labels");
const Currency = z.string().regex(/^[a-z][a-z0-9]{1,11}$/, "currency must be lowercase");
const Network = z.string().regex(/^[a-z][a-z0-9_.:-]{1,63}$/, "invalid payment network");
const VaultAlias = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/, "invalid vault alias");
const HttpsUrl = z.string().url().refine((value) => new URL(value).protocol === "https:", "URL must use HTTPS");
const ChainIdentifier = z.string().trim().min(1).max(192).refine(
  (value) => !/[\s\u0000-\u001f\u007f]/.test(value),
  "chain identifiers cannot contain whitespace or control characters",
);

export const X402_TEST_NETWORKS = [
  "eip155:84532",
  "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
] as const;
export const X402_TEST_FACILITATOR = "https://x402.org/facilitator" as const;

export const PaymentCapabilitySchema = z.enum(["delegated_fiat", "http_402", "merchant_recognition"]);
export type PaymentCapability = z.infer<typeof PaymentCapabilitySchema>;
export type PaymentOperationCapability = PaymentCapability | "saas_provisioning";

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
  capability: z.literal("delegated_fiat").default("delegated_fiat"),
  credential: z.object({ type: z.literal("link_cli"), storage: z.literal("provider_cli") }).strict(),
}).strict();

const MppSchema = BaseSchema.extend({
  provider: z.literal("mpp"),
  capability: z.literal("http_402").default("http_402"),
  credential: z.object({ type: z.literal("link_cli"), storage: z.literal("provider_cli") }).strict(),
  request: z.object({
    url: HttpsUrl,
    method: z.enum(["GET", "POST"]).default("GET"),
    network: Network.default("stripe"),
    body: z.string().max(16_384).optional(),
  }).strict(),
}).strict();

const VaultCredentialSchema = z.object({
  storage: z.literal("vault"),
  ref: VaultAlias,
}).strict();

const AdyenAgenticSchema = BaseSchema.extend({
  provider: z.literal("adyen_agentic"),
  capability: z.literal("delegated_fiat"),
  credential: VaultCredentialSchema.extend({ type: z.literal("adyen_agentic_token") }).strict(),
}).strict();

const X402Schema = BaseSchema.extend({
  provider: z.literal("x402"),
  capability: z.literal("http_402"),
  credential: VaultCredentialSchema.extend({ type: z.literal("wallet_signer") }).strict(),
  request: z.object({
    url: HttpsUrl,
    method: z.enum(["GET", "POST"]).default("GET"),
    network: z.enum(X402_TEST_NETWORKS),
    scheme: z.literal("exact"),
    asset: ChainIdentifier,
    payTo: ChainIdentifier,
    facilitator: z.literal(X402_TEST_FACILITATOR),
    body: z.string().max(16_384).optional(),
  }).strict().superRefine((request, context) => {
    if (request.method === "GET" && request.body !== undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["body"], message: "GET x402 requests cannot include a body" });
    }
  }),
}).strict();

const VisaTapSchema = BaseSchema.extend({
  provider: z.literal("visa_tap"),
  capability: z.literal("merchant_recognition"),
  credential: z.object({ type: z.literal("scheme_registry"), storage: z.literal("provider_registry"), keyId: SafeText }).strict(),
  request: z.object({ url: HttpsUrl, network: Network.default("visa_tap") }).strict(),
}).strict();

const ProvisionSchema = BaseSchema.extend({
  provider: z.literal("stripe_projects"),
  credential: z.object({ type: z.literal("stripe_cli"), storage: z.literal("provider_cli") }).strict(),
  provisioning: z.object({ service: SafeText, credentialVaultRefs: z.array(VaultAlias).min(1).max(32) }).strict(),
}).strict();

export const PaymentContractSchema = z.discriminatedUnion("provider", [
  StripeLinkSchema,
  MppSchema,
  AdyenAgenticSchema,
  X402Schema,
  VisaTapSchema,
  ProvisionSchema,
]);
export type PaymentContract = z.infer<typeof PaymentContractSchema>;

export type PaymentBinding = {
  amountMinor: number;
  currency: string;
  expiresAt: string;
  item: string;
  network: string;
  payee: string;
  resource: string;
};

export function paymentCapability(contract: PaymentContract): PaymentOperationCapability {
  return contract.provider === "stripe_projects" ? "saas_provisioning" : contract.capability;
}

export function paymentBinding(contract: PaymentContract): PaymentBinding {
  const request = contract.provider === "mpp" || contract.provider === "x402" || contract.provider === "visa_tap"
    ? contract.request
    : null;
  return {
    amountMinor: contract.amountMinor,
    currency: contract.currency,
    expiresAt: contract.expiresAt,
    item: contract.item.name,
    network: request?.network ?? contract.provider,
    payee: contract.provider === "x402" ? contract.request.payTo : contract.merchant.url,
    resource: request?.url ?? contract.merchant.url,
  };
}

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
  const binding = paymentBinding(contract);
  return [
    `${contract.provider}: ${contract.merchant.name}`,
    `capability: ${paymentCapability(contract)}`,
    `${contract.item.name} x1`,
    `exact total: ${amount}`,
    `payee: ${binding.payee}`,
    `network: ${binding.network}`,
    `resource: ${binding.resource}`,
    `per-purchase cap: ${contract.caps.perPurchaseMinor}`,
    `${contract.caps.period} cap: ${assessment.periodSpentMinor + contract.amountMinor}/${contract.caps.periodMinor}`,
    `expires: ${contract.expiresAt}`,
    `transaction: ${contract.id}`,
  ].join("\n");
}
