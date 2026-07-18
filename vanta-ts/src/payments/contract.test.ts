import { describe, expect, it } from "vitest";
import { PaymentContractSchema, assessPaymentContract, formatPaymentPreview, paymentBinding, paymentCapability } from "./contract.js";

const raw = {
  version: 1 as const,
  environment: "test" as const,
  id: "pay_contract_1234",
  provider: "stripe_link" as const,
  merchant: { name: "Example Merchant", url: "https://merchant.example" },
  item: { name: "API credits", quantity: 1 as const },
  currency: "usd",
  currencyExponent: 2,
  amountMinor: 2500,
  caps: { perPurchaseMinor: 3000, periodMinor: 5000, period: "day" as const },
  credential: { type: "link_cli" as const, storage: "provider_cli" as const },
  expiresAt: "2026-07-12T12:00:00.000Z",
};

describe("payment contract", () => {
  it("accepts a strict test-only provider contract and renders exact approval terms", () => {
    const contract = PaymentContractSchema.parse(raw);
    const assessment = assessPaymentContract(contract, [], new Date("2026-07-11T12:00:00Z"));
    expect(assessment).toEqual({ ok: true, issues: [], periodSpentMinor: 0 });
    expect(formatPaymentPreview(contract, assessment)).toContain("exact total: 2500 usd minor units");
    expect(paymentCapability(contract)).toBe("delegated_fiat");
    expect(paymentBinding(contract)).toMatchObject({ payee: "https://merchant.example", network: "stripe_link", resource: "https://merchant.example" });
  });

  it("rejects secret-shaped extra fields and non-HTTPS merchant URLs", () => {
    expect(PaymentContractSchema.safeParse({ ...raw, secretKey: "sk_live_nope" }).success).toBe(false);
    expect(PaymentContractSchema.safeParse({ ...raw, merchant: { ...raw.merchant, url: "http://merchant.example" } }).success).toBe(false);
  });

  it("enforces expiry, per-purchase cap, period cap, and replay protection", () => {
    const contract = PaymentContractSchema.parse(raw);
    const receipts = [
      { transactionId: "pay_previous_123", at: "2026-07-11T10:00:00Z", currency: "usd", amountMinor: 3000, status: "settled" as const },
      { transactionId: contract.id, at: "2026-07-10T10:00:00Z", currency: "usd", amountMinor: 1, status: "failed" as const },
    ];
    expect(assessPaymentContract(contract, receipts, new Date("2026-07-11T13:00:00Z")).issues).toEqual([
      "amount exceeds period cap",
      "transaction id already has a receipt",
    ]);
    const expired = { ...raw, amountMinor: 4000, expiresAt: "2026-07-11T11:00:00Z" };
    expect(assessPaymentContract(PaymentContractSchema.parse(expired), [], new Date("2026-07-11T13:00:00Z")).issues).toEqual([
      "transaction contract expired",
      "amount exceeds per-purchase cap",
    ]);
  });

  it("requires provisioning results to name vault references rather than values", () => {
    const result = PaymentContractSchema.safeParse({
      ...raw,
      provider: "stripe_projects",
      credential: { type: "stripe_cli", storage: "provider_cli" },
      provisioning: { service: "neon/postgres", credentialVaultRefs: ["NEON_DATABASE_URL"] },
    });
    expect(result.success).toBe(true);
    expect(PaymentContractSchema.safeParse({
      ...raw,
      provider: "stripe_projects",
      credential: { type: "stripe_cli", storage: "provider_cli" },
      provisioning: { service: "neon/postgres", credentialVaultRefs: ["postgres://plaintext"] },
    }).success).toBe(false);
  });

  it("represents every provider-neutral capability without accepting credential material", () => {
    const adyen = PaymentContractSchema.parse({
      ...raw, provider: "adyen_agentic", capability: "delegated_fiat",
      credential: { type: "adyen_agentic_token", storage: "vault", ref: "ADYEN_AGENT_TOKEN" },
    });
    const x402 = PaymentContractSchema.parse({
      ...raw, provider: "x402", capability: "http_402",
      credential: { type: "wallet_signer", storage: "vault", ref: "X402_TEST_SIGNER" },
      request: {
        url: "https://api.example/paid", method: "GET", network: "eip155:84532", scheme: "exact",
        asset: "0x1234567890abcdef", payTo: "0xabcdef1234567890", facilitator: "https://x402.org/facilitator",
      },
    });
    const tap = PaymentContractSchema.parse({
      ...raw, provider: "visa_tap", capability: "merchant_recognition",
      credential: { type: "scheme_registry", storage: "provider_registry", keyId: "vanta-test-key" },
      request: { url: "https://merchant.example/agent", network: "visa_tap" },
    });
    expect([paymentCapability(adyen), paymentCapability(x402), paymentCapability(tap)]).toEqual([
      "delegated_fiat", "http_402", "merchant_recognition",
    ]);
    expect(paymentBinding(x402)).toMatchObject({ network: "eip155:84532", payee: "0xabcdef1234567890", resource: "https://api.example/paid" });
    expect(PaymentContractSchema.safeParse({
      ...raw, provider: "x402", capability: "http_402",
      credential: { type: "wallet_signer", storage: "vault", ref: "X402_TEST_SIGNER", privateKey: "0xsecret" },
      request: {
        url: "https://api.example/paid", network: "eip155:84532", scheme: "exact",
        asset: "0x1234567890abcdef", payTo: "0xabcdef1234567890", facilitator: "https://x402.org/facilitator",
      },
    }).success).toBe(false);
    expect(PaymentContractSchema.safeParse({
      ...raw, provider: "x402", capability: "http_402",
      credential: { type: "wallet_signer", storage: "vault", ref: "X402_TEST_SIGNER" },
      request: {
        url: "https://api.example/paid", network: "eip155:8453", scheme: "exact",
        asset: "0x1234567890abcdef", payTo: "0xabcdef1234567890", facilitator: "https://x402.org/facilitator",
      },
    }).success).toBe(false);
  });
});
