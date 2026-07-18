import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PaymentContractSchema } from "./contract.js";
import { loadPaymentAuthorizationEvents, paymentAuthorizationPath, paymentBindingHash, recordPaymentAuthorizationEvent } from "./authorization.js";

function contract(amountMinor = 100) {
  return PaymentContractSchema.parse({
    version: 1, environment: "test", id: "pay_authorization_1234", provider: "stripe_link",
    merchant: { name: "Merchant", url: "https://merchant.example" }, item: { name: "Item", quantity: 1 },
    currency: "usd", amountMinor, caps: { perPurchaseMinor: 500, periodMinor: 1000, period: "day" },
    credential: { type: "link_cli", storage: "provider_cli" }, expiresAt: "2026-07-20T00:00:00Z",
  });
}

describe("payment authorization journal", () => {
  it("persists the complete redacted authorization sequence with one immutable binding", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-payment-auth-"));
    const value = contract();
    await recordPaymentAuthorizationEvent(root, value, "previewed", "preview_ready");
    await recordPaymentAuthorizationEvent(root, value, "operator_approved", "operator_approved");
    await recordPaymentAuthorizationEvent(root, value, "provider_challenge", "external_step_up", { challengeType: "provider_step_up" });
    await recordPaymentAuthorizationEvent(root, value, "scoped_token", "scoped_credential_issued");
    await recordPaymentAuthorizationEvent(root, value, "executing", "provider_execution");
    await recordPaymentAuthorizationEvent(root, value, "receipt_recorded", "receipt_recorded");
    const events = await loadPaymentAuthorizationEvents(root);
    expect(events.map((event) => event.phase)).toEqual(["previewed", "operator_approved", "provider_challenge", "scoped_token", "executing", "receipt_recorded"]);
    expect(new Set(events.map((event) => event.bindingHash))).toEqual(new Set([paymentBindingHash(value)]));
    const raw = await readFile(paymentAuthorizationPath(root), "utf8");
    expect(raw).not.toMatch(/424242|sk_(?:test|live)|private[_-]?key|passkey|provider[_-]?token/i);
    expect((await stat(paymentAuthorizationPath(root))).mode & 0o777).toBe(0o600);
  });

  it("rejects illegal transitions and any post-approval binding change", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-payment-auth-"));
    await expect(recordPaymentAuthorizationEvent(root, contract(), "executing", "provider_execution")).rejects.toThrow("start -> executing");
    await recordPaymentAuthorizationEvent(root, contract(), "previewed", "preview_ready");
    await expect(recordPaymentAuthorizationEvent(root, contract(101), "operator_approved", "operator_approved")).rejects.toThrow("binding changed");
  });
});
