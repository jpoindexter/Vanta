import { describe, expect, it } from "vitest";
import { PaymentContractSchema } from "./contract.js";
import { parsePaymentChallenge, validatePaymentChallenge } from "./challenge.js";

const contract = PaymentContractSchema.parse({
  version: 1, environment: "test", id: "pay_mpp_12345678", provider: "mpp",
  merchant: { name: "Paid API", url: "https://api.example" },
  item: { name: "one report", quantity: 1 }, currency: "usd", currencyExponent: 2, amountMinor: 10,
  caps: { perPurchaseMinor: 50, periodMinor: 100, period: "day" },
  credential: { type: "link_cli", storage: "provider_cli" },
  request: { url: "https://api.example/report", method: "GET" },
  expiresAt: "2026-07-12T00:00:00Z",
});

describe("MPP challenge validation", () => {
  it("parses an exact Stripe MPP challenge", () => {
    if (contract.provider !== "mpp") throw new Error("fixture mismatch");
    const parsed = parsePaymentChallenge(402, {
      "WWW-Authenticate": 'Payment amount="0.10", currency="USD", method="stripe", resource="https://api.example/report", merchant="Paid API", item="one report", expires="2026-07-11T13:00:00Z"',
    }, undefined, contract.currencyExponent);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.challenge.amountMinor).toBe(10);
    expect(validatePaymentChallenge(contract, parsed.challenge, new Date("2026-07-11T12:00:00Z"))).toEqual([]);
  });

  it("rejects non-402 responses and malformed challenges", () => {
    expect(parsePaymentChallenge(200, {}, undefined, 2)).toEqual({ ok: false, error: "expected HTTP 402, received 200" });
    expect(parsePaymentChallenge(402, {}, '{"amount":"0.10","currency":"usd"}', 2)).toEqual({ ok: false, error: "HTTP 402 missing WWW-Authenticate challenge" });
    expect(parsePaymentChallenge(402, { "www-authenticate": "Payment currency=usd" }, undefined, 2)).toEqual({ ok: false, error: "payment challenge has invalid amount" });
  });

  it("stops on amount, currency, method, resource, identity, or expiry mismatch", () => {
    if (contract.provider !== "mpp") throw new Error("fixture mismatch");
    const issues = validatePaymentChallenge(contract, {
      scheme: "payment", amountMinor: 11, currency: "eur", method: "tempo",
      resource: "https://evil.example", merchant: "Other", item: "other",
      expiresAt: "2026-07-11T11:00:00Z",
    }, new Date("2026-07-11T12:00:00Z"));
    expect(issues).toHaveLength(7);
  });

  it("rejects decimal precision that cannot map exactly to minor units", () => {
    expect(parsePaymentChallenge(402, { "www-authenticate": "Payment amount=0.001 currency=usd method=stripe" }, undefined, 2)).toEqual({ ok: false, error: "payment challenge has invalid amount" });
  });
});
