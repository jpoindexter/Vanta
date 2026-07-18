import type { PaymentRequirements } from "@x402/core/types";
import { describe, expect, it, vi } from "vitest";
import { createVaultX402Signer } from "./x402-signer.js";

const requirement: PaymentRequirements = {
  scheme: "exact",
  network: "eip155:84532",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  amount: "1000",
  payTo: "0x1111111111111111111111111111111111111111",
  maxTimeoutSeconds: 60,
  extra: { name: "USDC", version: "2" },
};

function request(overrides: Partial<PaymentRequirements> = {}) {
  return {
    contractId: "pay_x402_signer_1234",
    credentialRef: "X402_TEST_SIGNER",
    facilitator: "https://x402.org/facilitator" as const,
    requirement: { ...requirement, ...overrides },
    resource: { url: "https://api.example/paid" },
  };
}

describe("vault-backed x402 signer", () => {
  it("resolves the scoped alias and signs an exact Base Sepolia payload", async () => {
    const resolveSecret = vi.fn(async () => `0x${"11".repeat(32)}`);
    const payload = await createVaultX402Signer({ resolveSecret })(request());

    expect(resolveSecret).toHaveBeenCalledWith("X402_TEST_SIGNER");
    expect(payload).toMatchObject({
      x402Version: 2,
      resource: { url: "https://api.example/paid" },
      accepted: requirement,
      payload: { authorization: { value: "1000" } },
    });
    expect(JSON.stringify(payload)).not.toContain("1111111111111111111111111111111111111111111111111111111111111111");
  });

  it("rejects a missing or malformed secret without emitting it", async () => {
    await expect(createVaultX402Signer({ resolveSecret: async () => null })(request()))
      .rejects.toThrow("x402 vault signer is unavailable");
    await expect(createVaultX402Signer({ resolveSecret: async () => "not-a-private-key" })(request()))
      .rejects.toThrow("x402 vault signer is unavailable");
  });

  it("rejects unsupported networks before opening the vault", async () => {
    const resolveSecret = vi.fn(async () => `0x${"11".repeat(32)}`);
    await expect(createVaultX402Signer({ resolveSecret })(request({
      network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    }))).rejects.toThrow("does not support solana:");
    expect(resolveSecret).not.toHaveBeenCalled();
  });
});
