import { describe, expect, it, vi } from "vitest";
import { PaymentContractSchema } from "./contract.js";
import { executeMpp, executeStripeLink, paymentCommandEnv, type PaymentCommandRunner } from "./providers.js";

const base = {
  version: 1 as const, environment: "test" as const, id: "pay_provider_1234", merchant: { name: "Paid API", url: "https://api.example" },
  item: { name: "one report", quantity: 1 as const }, currency: "usd", currencyExponent: 2, amountMinor: 10,
  caps: { perPurchaseMinor: 20, periodMinor: 100, period: "day" as const },
  expiresAt: "2026-07-12T00:00:00Z",
};

function successfulRunner(calls: string[][]): PaymentCommandRunner {
  return async (_command, args) => {
    calls.push(args);
    if (args[0] === "payment-methods") return { code: 0, stdout: '{"data":[{"id":"pm_test_123"}]}', stderr: "" };
    if (args[0] === "spend-request") return { code: 0, stdout: '{"id":"lsrq_test_12345678","status":"approved"}', stderr: "" };
    return { code: 0, stdout: '{"status_code":200,"secret":"must-not-escape"}', stderr: "" };
  };
}

describe("payment provider adapters", () => {
  it("creates a Stripe Link spend request with exact amount and external approval", async () => {
    const calls: string[][] = [];
    const contract = PaymentContractSchema.parse({ ...base, provider: "stripe_link", credential: { type: "link_cli", storage: "provider_cli" } });
    if (contract.provider !== "stripe_link") throw new Error("fixture mismatch");
    const result = await executeStripeLink(contract, successfulRunner(calls));
    expect(result).toEqual({
      ok: true, state: "spend_approved", external: "approved", providerId: "lsrq_test_12345678",
      authorization: { challengeType: "provider_step_up", scopedTokenIssued: true, executionAttempted: true },
    });
    expect(calls[1]).toEqual(expect.arrayContaining(["--amount", "10", "--request-approval", "--credential-type", "card"]));
    expect(JSON.stringify(calls)).not.toMatch(/sk_(?:test|live)|card_number/i);
  });

  it("maps provider denial and timeout without returning raw provider output", async () => {
    const contract = PaymentContractSchema.parse({ ...base, provider: "stripe_link", credential: { type: "link_cli", storage: "provider_cli" } });
    if (contract.provider !== "stripe_link") throw new Error("fixture mismatch");
    const run: PaymentCommandRunner = async (_command, args) => args[0] === "payment-methods"
      ? { code: 0, stdout: '{"id":"pm_test_123"}', stderr: "" }
      : { code: 1, stdout: "PAN 4242424242424242", stderr: "approval timed out with sk_test_hidden" };
    expect(await executeStripeLink(contract, run)).toEqual({
      ok: false, state: "external_approval_timeout", external: "timeout",
      authorization: { challengeType: "provider_step_up" },
    });
  });

  it("does not treat a pending spend request as external approval", async () => {
    const contract = PaymentContractSchema.parse({ ...base, provider: "stripe_link", credential: { type: "link_cli", storage: "provider_cli" } });
    if (contract.provider !== "stripe_link") throw new Error("fixture mismatch");
    const run: PaymentCommandRunner = async (_command, args) => args[0] === "payment-methods"
      ? { code: 0, stdout: '{"id":"pm_test_123"}', stderr: "" }
      : { code: 0, stdout: '{"id":"lsrq_test_12345678","status":"pending"}', stderr: "" };
    expect(await executeStripeLink(contract, run)).toEqual({
      ok: false, state: "invalid_provider_result", external: "not_available",
      authorization: { challengeType: "provider_step_up" },
    });
  });

  it("validates a 402 before creating and settling a bounded MPP spend", async () => {
    const calls: string[][] = [];
    const contract = PaymentContractSchema.parse({ ...base, provider: "mpp", credential: { type: "link_cli", storage: "provider_cli" }, request: { url: "https://api.example/report", method: "GET" } });
    if (contract.provider !== "mpp") throw new Error("fixture mismatch");
    const fetchFn = vi.fn(async () => new Response("", { status: 402, headers: { "www-authenticate": 'Payment amount="0.10" currency="usd" method="stripe" resource="https://api.example/report"' } }));
    const result = await executeMpp(contract, successfulRunner(calls), fetchFn, new Date("2026-07-11T12:00:00Z"));
    expect(result).toMatchObject({ ok: true, state: "mpp_settled", external: "approved", httpStatus: 200 });
    expect(result.authorization).toEqual({ challengeType: "http_402", scopedTokenIssued: true, executionAttempted: true });
    expect(result.challengeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(calls[1]).toEqual(expect.arrayContaining(["--credential-type", "shared_payment_token", "--request-approval"]));
    expect(calls[2]?.slice(0, 3)).toEqual(["mpp", "pay", "https://api.example/report"]);
  });

  it("does not invoke payment commands for a mismatched challenge", async () => {
    const calls: string[][] = [];
    const contract = PaymentContractSchema.parse({ ...base, provider: "mpp", credential: { type: "link_cli", storage: "provider_cli" }, request: { url: "https://api.example/report", method: "GET" } });
    if (contract.provider !== "mpp") throw new Error("fixture mismatch");
    const response = new Response("", { status: 402, headers: { "www-authenticate": "Payment amount=99.00 currency=usd method=stripe" } });
    expect(await executeMpp(contract, successfulRunner(calls), async () => response)).toMatchObject({ ok: false, state: "challenge_mismatch" });
    expect(calls).toEqual([]);
  });

  it("passes only non-secret process variables to payment CLIs", () => {
    expect(paymentCommandEnv({ PATH: "/bin", HOME: "/home/a", STRIPE_SECRET_KEY: "secret", VANTA_HOME: "/private" })).toEqual({ PATH: "/bin", HOME: "/home/a" });
  });

  it("keeps the real Link CLI disabled when no test adapter is configured", async () => {
    const previous = process.env.VANTA_PAYMENT_TEST_LINK_CLI;
    delete process.env.VANTA_PAYMENT_TEST_LINK_CLI;
    try {
      const contract = PaymentContractSchema.parse({ ...base, provider: "stripe_link", credential: { type: "link_cli", storage: "provider_cli" } });
      if (contract.provider !== "stripe_link") throw new Error("fixture mismatch");
      expect(await executeStripeLink(contract)).toEqual({ ok: false, state: "payment_method_unavailable", external: "not_available" });
    } finally {
      if (previous !== undefined) process.env.VANTA_PAYMENT_TEST_LINK_CLI = previous;
    }
  });
});
