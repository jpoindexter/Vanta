import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  acceptVisaTapMerchantRequest,
  consentedVisaTapIdentifiers,
  createMemoryVisaTapReplayStore,
  signVisaTapRequest,
  verifyVisaTapRequest,
  type VisaTapRegistry,
  type VisaTapRequest,
} from "./visa-tap.js";

const epoch = 1_788_000_000;
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const request: VisaTapRequest = {
  authority: "merchant.example",
  path: "/checkout",
  body: JSON.stringify({ sku: "vanta-1", quantity: 1 }),
};

function registry(key = publicKey): VisaTapRegistry {
  return {
    origin: "https://registry.example",
    getKey: vi.fn(async (keyId: string) => keyId === "vanta-test-key" ? { keyId, algorithm: "ed25519" as const, publicKey: key } : null),
  };
}

function headers(operation: "browse" | "payment" = "payment", target = request) {
  return signVisaTapRequest({
    request: target,
    operation,
    keyId: "vanta-test-key",
    privateKey,
    created: epoch,
    expires: epoch + 120,
    nonce: `nonce-${operation}-12345678`,
  });
}

async function verify(overrides: Partial<Parameters<typeof verifyVisaTapRequest>[0]> = {}) {
  return verifyVisaTapRequest({
    request,
    headers: headers(),
    expectedOperation: "payment",
    registry: registry(),
    pinnedRegistryOrigin: "https://registry.example",
    replay: createMemoryVisaTapReplayStore(),
    now: epoch + 1,
    ...overrides,
  });
}

describe("Visa TAP public conformance lab", () => {
  it("passes the public agent -> registry -> CDN verifier -> merchant topology", async () => {
    const keyRegistry = registry();
    const signed = headers();
    expect(signed.signatureInput).toContain('sig2=("@authority" "@path" "content-digest")');
    expect(signed.signatureInput).toContain('keyId="vanta-test-key";alg="ed25519"');
    expect(signed.signatureInput).toContain('tag="agent-payer-auth"');

    await expect(acceptVisaTapMerchantRequest({
      request,
      headers: signed,
      expectedOperation: "payment",
      registry: keyRegistry,
      pinnedRegistryOrigin: "https://registry.example",
      replay: createMemoryVisaTapReplayStore(),
      now: epoch + 1,
      identifiers: {
        consumer_token: "consumer-reference",
        payment_account_reference: "payment-reference",
      },
      consent: new Set(["consumer_token"]),
    })).resolves.toEqual({
      verification: { ok: true, operation: "payment", keyId: "vanta-test-key" },
      identifiers: { consumer_token: "consumer-reference" },
    });
    expect(keyRegistry.getKey).toHaveBeenCalledWith("vanta-test-key");
  });

  it("rejects replay after the first successful verification", async () => {
    const replay = createMemoryVisaTapReplayStore();
    const signed = headers();
    const input = {
      request, headers: signed, expectedOperation: "payment" as const, registry: registry(),
      pinnedRegistryOrigin: "https://registry.example", replay, now: epoch + 1,
    };
    await expect(verifyVisaTapRequest(input)).resolves.toMatchObject({ ok: true });
    await expect(verifyVisaTapRequest(input)).resolves.toEqual({ ok: false, reason: "replay_detected" });
  });

  it.each([
    ["wrong authority", { request: { ...request, authority: "attacker.example" } }, "signature_invalid"],
    ["wrong path", { request: { ...request, path: "/other" } }, "signature_invalid"],
    ["altered body", { request: { ...request, body: JSON.stringify({ sku: "vanta-2", quantity: 1 }) } }, "content_digest_mismatch"],
    ["wrong operation", { expectedOperation: "browse" as const }, "operation_mismatch"],
    ["unknown key", { registry: { origin: "https://registry.example", getKey: async () => null } }, "unknown_key"],
    ["wrong public key", { registry: registry(generateKeyPairSync("ed25519").publicKey) }, "signature_invalid"],
    ["unpinned registry", { pinnedRegistryOrigin: "https://other-registry.example" }, "registry_origin_mismatch"],
  ])("rejects %s", async (_label, overrides, reason) => {
    await expect(verify(overrides)).resolves.toEqual({ ok: false, reason });
  });

  it("rejects expired signatures", async () => {
    const signed = signVisaTapRequest({
      request,
      operation: "payment",
      keyId: "vanta-test-key",
      privateKey,
      created: epoch - 240,
      expires: epoch - 1,
      nonce: "nonce-expired-12345678",
    });
    await expect(verify({ headers: signed })).resolves.toEqual({ ok: false, reason: "signature_expired" });
  });

  it("does not expose identifiers the consumer did not consent to share", () => {
    expect(consentedVisaTapIdentifiers({
      consumer_token: "consumer-reference",
      payment_account_reference: "payment-reference",
      loyalty_id: "loyalty-reference",
    }, new Set(["consumer_token", "loyalty_id"]))).toEqual({
      consumer_token: "consumer-reference",
      loyalty_id: "loyalty-reference",
    });
  });
});
