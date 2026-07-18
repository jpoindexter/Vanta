import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import type { Network, PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { describe, expect, it, vi } from "vitest";
import { PaymentContractSchema, type PaymentContract } from "./contract.js";
import type { PaymentFetch } from "./providers.js";
import { executeX402, type X402Signer } from "./x402.js";

const NETWORKS = [
  { network: "eip155:84532" as const, asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", payTo: "0x1111111111111111111111111111111111111111" },
  { network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as const, asset: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", payTo: "11111111111111111111111111111111" },
] as const;
type NetworkFixture = { network: Network; asset: string; payTo: string };

function contractFor(fixture: NetworkFixture = NETWORKS[0]): Extract<PaymentContract, { provider: "x402" }> {
  return PaymentContractSchema.parse({
    version: 1,
    environment: "test",
    id: `pay_x402_${fixture.network.startsWith("eip155") ? "base" : "solana"}_1234`,
    provider: "x402",
    capability: "http_402",
    merchant: { name: "Fixture API", url: "https://api.example" },
    item: { name: "Protected response", quantity: 1 },
    currency: "usdc",
    currencyExponent: 6,
    amountMinor: 1000,
    caps: { perPurchaseMinor: 1000, periodMinor: 5000, period: "day" },
    credential: { type: "wallet_signer", storage: "vault", ref: "X402_TEST_SIGNER" },
    expiresAt: "2026-07-19T12:00:00.000Z",
    request: {
      url: "https://api.example/paid",
      method: "GET",
      network: fixture.network,
      scheme: "exact",
      asset: fixture.asset,
      payTo: fixture.payTo,
      facilitator: "https://x402.org/facilitator",
    },
  }) as Extract<PaymentContract, { provider: "x402" }>;
}

function requirementFor(contract: Extract<PaymentContract, { provider: "x402" }>): PaymentRequirements {
  return {
    scheme: "exact",
    network: contract.request.network,
    asset: contract.request.asset,
    amount: String(contract.amountMinor),
    payTo: contract.request.payTo,
    maxTimeoutSeconds: 60,
    extra: {},
  };
}

function requiredFor(contract: Extract<PaymentContract, { provider: "x402" }>, requirement = requirementFor(contract)): PaymentRequired {
  return { x402Version: 2, resource: { url: contract.request.url }, accepts: [requirement] };
}

function payloadFor(contract: Extract<PaymentContract, { provider: "x402" }>, accepted = requirementFor(contract)): PaymentPayload {
  return {
    x402Version: 2,
    resource: { url: contract.request.url },
    accepted,
    payload: { signature: "fixture-signature", authorization: { nonce: "fixture-nonce" } },
  };
}

function response(status: number, headerName?: string, headerValue?: string): Response {
  return new Response("", { status, headers: headerName && headerValue ? { [headerName]: headerValue } : undefined });
}

describe("x402 v2 testnet rail", () => {
  it.each(NETWORKS)("settles an exact $network fixture with a redacted signer boundary", async (fixture) => {
    const contract = contractFor(fixture);
    const requirement = requirementFor(contract);
    const signer = vi.fn<X402Signer>(async () => payloadFor(contract, requirement));
    const fetchFn = vi.fn<PaymentFetch>()
      .mockResolvedValueOnce(response(402, "payment-required", encodePaymentRequiredHeader(requiredFor(contract, requirement))))
      .mockResolvedValueOnce(response(200, "payment-response", encodePaymentResponseHeader({
        success: true,
        transaction: fixture.network.startsWith("eip155") ? "0xtransaction" : "solana-signature",
        network: fixture.network,
        amount: "1000",
      })));

    await expect(executeX402(contract, signer, fetchFn)).resolves.toMatchObject({
      ok: true,
      state: "x402_settled",
      external: "approved",
      httpStatus: 200,
    });
    expect(signer).toHaveBeenCalledWith(expect.objectContaining({
      contractId: contract.id,
      credentialRef: "X402_TEST_SIGNER",
      facilitator: "https://x402.org/facilitator",
      requirement,
    }));
    const paidHeaders = new Headers(fetchFn.mock.calls[1]?.[1]?.headers);
    expect(paidHeaders.get("payment-signature")).toBeTruthy();
    expect(JSON.stringify(signer.mock.calls)).not.toContain("privateKey");
  });

  it.each(["network", "asset", "payTo", "amount", "resource"] as const)("rejects a %s mismatch before signing", async (field) => {
    const contract = contractFor();
    const requirement = requirementFor(contract);
    if (field === "network") requirement.network = "eip155:8453";
    if (field === "asset") requirement.asset = "wrong-asset";
    if (field === "payTo") requirement.payTo = "wrong-payee";
    if (field === "amount") requirement.amount = "1001";
    const required = requiredFor(contract, requirement);
    if (field === "resource") required.resource.url = "https://api.example/other";
    const signer = vi.fn<X402Signer>();
    const fetchFn = vi.fn<PaymentFetch>().mockResolvedValue(
      response(402, "payment-required", encodePaymentRequiredHeader(required)),
    );

    await expect(executeX402(contract, signer, fetchFn)).resolves.toMatchObject({
      ok: false,
      state: "x402_challenge_mismatch",
    });
    expect(signer).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("rejects replaying a signed payload across networks", async () => {
    const contract = contractFor(NETWORKS[0]);
    const other = contractFor(NETWORKS[1]);
    const signer = vi.fn<X402Signer>(async () => payloadFor(other));
    const fetchFn = vi.fn<PaymentFetch>().mockResolvedValue(
      response(402, "payment-required", encodePaymentRequiredHeader(requiredFor(contract))),
    );

    await expect(executeX402(contract, signer, fetchFn)).resolves.toMatchObject({
      ok: false,
      state: "x402_signed_payload_mismatch",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("rejects a paid response whose facilitator settlement does not match the approved network", async () => {
    const contract = contractFor();
    const signer = vi.fn<X402Signer>(async () => payloadFor(contract));
    const fetchFn = vi.fn<PaymentFetch>()
      .mockResolvedValueOnce(response(402, "payment-required", encodePaymentRequiredHeader(requiredFor(contract))))
      .mockResolvedValueOnce(response(200, "payment-response", encodePaymentResponseHeader({
        success: true,
        transaction: "0xtransaction",
        network: "eip155:8453",
        amount: "1000",
      })));

    await expect(executeX402(contract, signer, fetchFn)).resolves.toMatchObject({
      ok: false,
      state: "x402_settlement_mismatch",
    });
  });
});
