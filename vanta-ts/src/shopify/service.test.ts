import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ShopifyMutationPlanSchema, ShopifyProfileSchema } from "./schema.js";
import { loadShopifyReceipts, shopifyReceiptPath } from "./receipts.js";
import { executeShopifyMutation } from "./service.js";

const profile = ShopifyProfileSchema.parse({ version: 1, store: "vanta-dev.myshopify.com", apiVersion: "2026-04", credentialVaultAlias: "SHOPIFY_DEV_TOKEN", scopes: ["read_products", "write_products"] });
function plan(id = "shop_service_1234") { return ShopifyMutationPlanSchema.parse({ version: 1, operation: "product_update", profile, id, idempotencyKey: "123e4567-e89b-42d3-a456-426614174000", expiresAt: "2099-07-12T00:00:00Z", input: { id: "gid://shopify/Product/123", status: "DRAFT" } }); }
const now = () => new Date("2026-07-11T12:00:00Z");

describe("Shopify mutation service", () => {
  it("records denial without invoking Shopify", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-shopify-service-")), mutate = vi.fn();
    expect(await executeShopifyMutation(root, plan(), { approve: async () => false, mutate, now })).toMatchObject({ ok: false, state: "operator_denied" });
    expect(mutate).not.toHaveBeenCalled(); expect((await loadShopifyReceipts(root))[0]?.status).toBe("denied");
  });

  it("reserves, verifies, and writes a mode-0600 credential-free receipt", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-shopify-service-"));
    const result = await executeShopifyMutation(root, plan(), { approve: async () => true, now, mutate: async () => ({ ok: true, state: "verified", data: { product: { id: "gid://shopify/Product/123", status: "DRAFT" } } }) });
    expect(result).toMatchObject({ ok: true, state: "verified" });
    expect((await loadShopifyReceipts(root)).map((receipt) => receipt.status)).toEqual(["reserved", "verified"]);
    const raw = await readFile(shopifyReceiptPath(root), "utf8");
    expect(raw).not.toMatch(/shpat_|access.?token|credentialVaultAlias/i);
    expect((await stat(shopifyReceiptPath(root))).mode & 0o777).toBe(0o600);
  });

  it("refuses replay before approval or mutation", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-shopify-service-")), approve = vi.fn(async () => true), mutate = vi.fn(async () => ({ ok: true, state: "verified" }));
    await executeShopifyMutation(root, plan(), { approve, mutate, now }); approve.mockClear(); mutate.mockClear();
    expect(await executeShopifyMutation(root, plan(), { approve, mutate, now })).toMatchObject({ ok: false, receiptRecorded: false });
    expect(approve).not.toHaveBeenCalled(); expect(mutate).not.toHaveBeenCalled();
  });
});
