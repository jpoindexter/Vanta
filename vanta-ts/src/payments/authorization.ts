import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { paymentBinding, paymentCapability, type PaymentContract } from "./contract.js";

const ProviderSchema = z.enum(["stripe_link", "mpp", "stripe_projects", "adyen_agentic", "x402", "visa_tap"]);
const CapabilitySchema = z.enum(["delegated_fiat", "http_402", "merchant_recognition", "saas_provisioning"]);
const PhaseSchema = z.enum(["previewed", "operator_approved", "provider_challenge", "scoped_token", "executing", "stopped", "receipt_recorded"]);
const StateSchema = z.enum([
  "preview_ready", "operator_approved", "external_step_up", "scoped_credential_issued", "provider_execution",
  "operator_denied", "contract_rejected", "unsupported_region", "enrollment_required", "provider_unavailable",
  "provider_failed", "receipt_recorded",
]);
const ChallengeTypeSchema = z.enum(["provider_step_up", "http_402", "sca_3ds", "wallet_signature", "signed_agent_intent"]);
const PayeeSchema = z.string().trim().min(1).max(192).refine(
  (value) => !/[\s\u0000-\u001f\u007f]/.test(value),
  "payment payee cannot contain whitespace or control characters",
);
const BindingSchema = z.object({
  amountMinor: z.number().int().nonnegative(), currency: z.string(), expiresAt: z.string().datetime({ offset: true }),
  item: z.string(), network: z.string(), payee: PayeeSchema, resource: z.string().url(),
}).strict();

const AuthorizationEventSchema = z.object({
  version: z.literal(1), eventId: z.string().uuid(), transactionId: z.string(), at: z.string().datetime(),
  provider: ProviderSchema, capability: CapabilitySchema, phase: PhaseSchema, state: StateSchema,
  binding: BindingSchema, bindingHash: z.string().length(64), challengeType: ChallengeTypeSchema.optional(),
}).strict();
export type PaymentAuthorizationEvent = z.infer<typeof AuthorizationEventSchema>;
export type PaymentAuthorizationPhase = z.infer<typeof PhaseSchema>;
export type PaymentAuthorizationState = z.infer<typeof StateSchema>;

const ALLOWED: Record<PaymentAuthorizationPhase | "start", PaymentAuthorizationPhase[]> = {
  start: ["previewed"],
  previewed: ["operator_approved", "stopped"],
  operator_approved: ["provider_challenge", "scoped_token", "executing", "stopped"],
  provider_challenge: ["scoped_token", "executing", "stopped"],
  scoped_token: ["executing", "stopped"],
  executing: ["stopped", "receipt_recorded"],
  stopped: ["receipt_recorded"],
  receipt_recorded: ["previewed"],
};

export function paymentAuthorizationPath(root: string): string {
  return join(root, ".vanta", "payments", "authorization.jsonl");
}

export function paymentBindingHash(contract: PaymentContract): string {
  return createHash("sha256").update(JSON.stringify(paymentBinding(contract))).digest("hex");
}

export async function loadPaymentAuthorizationEvents(root: string): Promise<PaymentAuthorizationEvent[]> {
  let raw: string;
  try { raw = await readFile(paymentAuthorizationPath(root), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  return raw.split("\n").filter(Boolean).map((line, index) => {
    const parsed = AuthorizationEventSchema.safeParse(JSON.parse(line));
    if (!parsed.success) throw new Error(`invalid payment authorization event at line ${index + 1}`);
    return parsed.data;
  });
}

export async function recordPaymentAuthorizationEvent(
  root: string,
  contract: PaymentContract,
  phase: PaymentAuthorizationPhase,
  state: PaymentAuthorizationState,
  options: { at?: Date; challengeType?: PaymentAuthorizationEvent["challengeType"] } = {},
): Promise<PaymentAuthorizationEvent> {
  const existing = (await loadPaymentAuthorizationEvents(root)).filter((event) => event.transactionId === contract.id);
  const previous = existing.at(-1);
  if (!ALLOWED[previous?.phase ?? "start"].includes(phase)) {
    throw new Error(`invalid payment authorization transition ${previous?.phase ?? "start"} -> ${phase}`);
  }
  const binding = paymentBinding(contract);
  const bindingHash = paymentBindingHash(contract);
  if (previous && previous.bindingHash !== bindingHash) throw new Error("payment authorization binding changed");
  const event = AuthorizationEventSchema.parse({
    version: 1, eventId: randomUUID(), transactionId: contract.id,
    at: (options.at ?? new Date()).toISOString(), provider: contract.provider,
    capability: paymentCapability(contract), phase, state, binding, bindingHash,
    challengeType: options.challengeType,
  });
  const path = paymentAuthorizationPath(root);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(path, "a", 0o600);
  try { await handle.appendFile(`${JSON.stringify(event)}\n`, "utf8"); }
  finally { await handle.close(); }
  await chmod(path, 0o600);
  return event;
}
