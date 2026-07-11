import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PaymentContractSchema } from "./contract.js";
import { appendPaymentReceipt, buildReceipt, loadPaymentReceipts, paymentLedgerPath, redactProviderId, summarizePaymentReceipts, withPaymentLedgerLock } from "./ledger.js";

const contract = PaymentContractSchema.parse({
  version: 1, environment: "test", id: "pay_receipt_1234", provider: "stripe_link",
  merchant: { name: "Merchant", url: "https://merchant.example" }, item: { name: "Item", quantity: 1 },
  currency: "usd", currencyExponent: 2, amountMinor: 100,
  caps: { perPurchaseMinor: 100, periodMinor: 500, period: "day" },
  credential: { type: "link_cli", storage: "provider_cli" }, expiresAt: "2026-07-12T00:00:00Z",
});

describe("payment receipt ledger", () => {
  it("writes mode-0600 redacted receipts without credentials or environment values", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-payments-"));
    const receipt = buildReceipt(contract, { at: "2026-07-11T12:00:00Z", status: "authorized", operator: "approved", external: "approved", providerState: "approved", providerId: "lsrq_sensitive_identifier_12345678" });
    await appendPaymentReceipt(root, receipt);
    const raw = await readFile(paymentLedgerPath(root), "utf8");
    expect(raw).toContain("lsrq...5678");
    expect(raw).not.toContain("sensitive_identifier");
    expect(raw).not.toMatch(/sk_(?:test|live)|card_number|authorization/i);
    expect((await stat(paymentLedgerPath(root))).mode & 0o777).toBe(0o600);
  });

  it("uses the latest event per transaction and counts reservations against caps", () => {
    const reserved = buildReceipt(contract, { at: "2026-07-11T12:00:00Z", status: "reserved", operator: "approved", external: "required", providerState: "reserved" });
    expect(summarizePaymentReceipts([reserved])[0]?.status).toBe("authorized");
    const failed = buildReceipt(contract, { at: "2026-07-11T12:01:00Z", status: "failed", operator: "approved", external: "timeout", providerState: "timeout" });
    expect(summarizePaymentReceipts([reserved, failed])[0]?.status).toBe("failed");
  });

  it("fails closed on a corrupt ledger and serializes lock holders", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-payments-"));
    await appendPaymentReceipt(root, buildReceipt(contract, { at: "2026-07-11T12:00:00Z", status: "denied", operator: "denied", external: "not_available", providerState: "operator_denied" }));
    await writeFile(paymentLedgerPath(root), "{}\n", "utf8");
    await expect(loadPaymentReceipts(root)).rejects.toThrow("invalid payment receipt at line 1");
    const order: number[] = [];
    await Promise.all([
      withPaymentLedgerLock(root, async () => { order.push(1); await new Promise((resolve) => setTimeout(resolve, 40)); order.push(2); }),
      withPaymentLedgerLock(root, async () => { order.push(3); }),
    ]);
    expect([[1, 2, 3], [3, 1, 2]]).toContainEqual(order);
  });

  it("redacts short and long provider identifiers", () => {
    expect(redactProviderId("short")).toBe("[redacted]");
    expect(redactProviderId("identifier-123456")).toBe("iden...3456");
  });
});
