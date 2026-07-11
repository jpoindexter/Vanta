import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildPaymentTransactionTool } from "./payment-transaction.js";
import type { ToolContext } from "./types.js";

const contract = {
  version: 1, environment: "test", id: "pay_tool_12345678", provider: "stripe_link",
  merchant: { name: "Merchant", url: "https://merchant.example" }, item: { name: "Item", quantity: 1 },
  currency: "usd", currencyExponent: 2, amountMinor: 100,
  caps: { perPurchaseMinor: 100, periodMinor: 500, period: "day" },
  credential: { type: "link_cli", storage: "provider_cli" }, expiresAt: "2099-07-12T00:00:00Z",
};

describe("payment_transaction tool", () => {
  it("previews exact terms without requesting approval", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-payment-tool-"));
    const requestApproval = vi.fn(async () => false);
    const result = await buildPaymentTransactionTool().execute({ action: "preview", contract }, { root, safety: {} as never, requestApproval });
    expect(result).toMatchObject({ ok: true });
    expect(result.output).toContain("exact total: 100 usd minor units");
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("requires a fresh non-cacheable approval and stops on denial", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-payment-tool-"));
    const requestApproval = vi.fn(async () => false);
    const provider = vi.fn();
    const result = await buildPaymentTransactionTool(provider).execute({ action: "execute", contract }, { root, safety: {} as ToolContext["safety"], requestApproval });
    expect(result).toMatchObject({ ok: false });
    expect(result.output).toContain("operator_denied");
    expect(provider).not.toHaveBeenCalled();
    expect(requestApproval).toHaveBeenCalledWith(expect.stringContaining("exact total: 100"), expect.any(String), "payment_transaction", expect.objectContaining({ fresh: true }));
  });

  it("returns only a redacted success summary after provider approval", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-payment-tool-"));
    const tool = buildPaymentTransactionTool(async () => ({ ok: true, state: "spend_approved", external: "approved", providerId: "lsrq_secret_12345678" }));
    const result = await tool.execute({ action: "execute", contract: { ...contract, id: "pay_tool_success1" } }, { root, safety: {} as never, requestApproval: async () => true });
    expect(result).toEqual({ ok: true, output: "payment spend_approved; redacted receipt recorded" });
    expect(result.output).not.toContain("lsrq");
  });

  it("rejects credential material in strict tool arguments", async () => {
    const result = await buildPaymentTransactionTool().execute({ action: "preview", contract: { ...contract, apiKey: "sk_live_nope" } }, { root: "/tmp", safety: {} as never, requestApproval: async () => true });
    expect(result.ok).toBe(false);
  });
});
