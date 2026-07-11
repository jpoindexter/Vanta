import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PaymentContractSchema } from "./contract.js";
import { loadPaymentReceipts, paymentLedgerPath } from "./ledger.js";
import { executePayment } from "./service.js";

function contract(id = "pay_service_1234", amountMinor = 100) {
  return PaymentContractSchema.parse({
    version: 1, environment: "test", id, provider: "stripe_link",
    merchant: { name: "Merchant", url: "https://merchant.example" }, item: { name: "Item", quantity: 1 },
    currency: "usd", currencyExponent: 2, amountMinor,
    caps: { perPurchaseMinor: 100, periodMinor: 100, period: "day" },
    credential: { type: "link_cli", storage: "provider_cli" }, expiresAt: "2026-07-12T00:00:00Z",
  });
}
const now = () => new Date("2026-07-11T12:00:00Z");

describe("payment execution service", () => {
  it("records operator denial and never invokes a provider", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-payment-service-"));
    const provider = vi.fn();
    expect(await executePayment(root, contract(), { approve: async () => false, provider, now })).toMatchObject({ ok: false, state: "operator_denied", receiptRecorded: true });
    expect(provider).not.toHaveBeenCalled();
    expect((await loadPaymentReceipts(root))[0]?.status).toBe("denied");
  });

  it("reserves before provider execution and stores only a redacted result", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-payment-service-"));
    const result = await executePayment(root, contract(), {
      approve: async (preview) => preview.includes("exact total: 100 usd minor units"), now,
      provider: async () => ({ ok: true, state: "spend_approved", external: "approved", providerId: "lsrq_private_12345678" }),
    });
    expect(result).toMatchObject({ ok: true, state: "spend_approved" });
    expect((await loadPaymentReceipts(root)).map((event) => event.status)).toEqual(["reserved", "authorized"]);
    const raw = await readFile(paymentLedgerPath(root), "utf8");
    expect(raw).toContain("lsrq...5678");
    expect(raw).not.toContain("private");
  });

  it("allows only one concurrent reservation under the same period cap", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-payment-service-"));
    const provider = vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); return { ok: true, state: "spend_approved", external: "approved" as const }; });
    const results = await Promise.all([
      executePayment(root, contract("pay_concurrent_1", 60), { approve: async () => true, provider, now }),
      executePayment(root, contract("pay_concurrent_2", 60), { approve: async () => true, provider, now }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.map((result) => result.state)).toContain("contract_rejected_after_approval");
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("releases a failed reservation from future cap totals but blocks id replay", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-payment-service-"));
    const first = await executePayment(root, contract("pay_timeout_1234"), { approve: async () => true, now, provider: async () => ({ ok: false, state: "external_approval_timeout", external: "timeout" }) });
    expect(first).toMatchObject({ ok: false, state: "external_approval_timeout" });
    const replay = await executePayment(root, contract("pay_timeout_1234"), { approve: async () => true, now, provider: vi.fn() });
    expect(replay).toMatchObject({ ok: false, state: "contract_rejected" });
    const next = await executePayment(root, contract("pay_after_timeout"), { approve: async () => true, now, provider: async () => ({ ok: true, state: "spend_approved", external: "approved" }) });
    expect(next.ok).toBe(true);
  });

  it("refuses provisioning when a vault-only sink is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-payment-service-"));
    const provision = PaymentContractSchema.parse({
      ...contract("pay_provision_1234"), provider: "stripe_projects",
      credential: { type: "stripe_cli", storage: "provider_cli" },
      provisioning: { service: "neon/postgres", credentialVaultRefs: ["NEON_DATABASE_URL"] },
    });
    expect(await executePayment(root, provision, { approve: async () => true, now, env: {}, platform: "linux" })).toMatchObject({ ok: false, state: "vault_sink_unavailable" });
  });
});
